import {
	executeCampaignCommand,
	IdempotencyConflictError,
	StaleCampaignRevisionError,
	type StorageTransaction,
	type TransactionalStorage,
} from "../ports/transaction.ts";
import type { ConformanceCase } from "./storage-conformance.ts";

export type TransactionalStorageFactory = () => Promise<TransactionalStorage> | TransactionalStorage;

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`Transactional storage contract: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Transactional storage contract: ${message}; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

async function rejectsWith<T extends Error>(
	run: () => Promise<unknown>,
	ErrorType: new (...args: never[]) => T,
	message: string,
): Promise<T> {
	try {
		await run();
	} catch (error) {
		assert(error instanceof ErrorType, `${message}; got ${String(error)}`);
		return error;
	}
	throw new Error(`Transactional storage contract: ${message}; operation did not reject`);
}


/**
 * Runner-agnostic transaction and campaign-command conformance scenarios.
 * Adapters supply an empty store for each case; durable adapters should also
 * exercise process restart and filesystem/database crash faults in their tests.
 */
export function transactionalStorageConformanceCases(
	factory: TransactionalStorageFactory,
): ConformanceCase[] {
	const fresh = (run: (storage: TransactionalStorage) => Promise<void>) => async () => run(await factory());
	return [
		{
			name: "one transaction commits campaign, ledger, pile, counter, and pending records together",
			run: fresh(async (storage) => {
				await storage.transaction(async (transaction) => {
					await transaction.write("campaigns/test/campaign.md", "revision: 1\n");
					await transaction.append("campaigns/test/rolls.jsonl", "{\"id\":\"h-1\"}\n");
					await transaction.write("campaigns/test/piles.json", "{\"deck\":[1]}");
					await transaction.write("campaigns/test/counters.json", "{\"draws\":1}");
					await transaction.write("campaigns/test/pending.json", "null");
				});
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/test/campaign.md"), "revision: 1\n", "campaign write missing after commit");
					equal(await transaction.read("campaigns/test/rolls.jsonl"), "{\"id\":\"h-1\"}\n", "ledger append missing after commit");
					equal(await transaction.read("campaigns/test/piles.json"), "{\"deck\":[1]}", "pile write missing after commit");
					equal(await transaction.read("campaigns/test/counters.json"), "{\"draws\":1}", "counter write missing after commit");
					equal(await transaction.read("campaigns/test/pending.json"), "null", "pending write missing after commit");
				});
			}),
		},
		{
			name: "a failed transaction rolls back every write and append",
			run: fresh(async (storage) => {
				await storage.transaction(async (transaction) => {
					await transaction.write("campaigns/test/campaign.md", "before");
					await transaction.write("campaigns/test/rolls.jsonl", "existing\n");
				});
				await rejectsWith(
					() => storage.transaction(async (transaction) => {
						await transaction.write("campaigns/test/campaign.md", "after");
						await transaction.append("campaigns/test/rolls.jsonl", "uncommitted\n");
						await transaction.write("campaigns/test/piles.json", "uncommitted");
						throw new Error("simulated failure before commit");
					}),
					Error,
					"failed callback must reject",
				);
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/test/campaign.md"), "before", "campaign update escaped rollback");
					equal(await transaction.read("campaigns/test/rolls.jsonl"), "existing\n", "ledger append escaped rollback");
					equal(await transaction.read("campaigns/test/piles.json"), undefined, "pile update escaped rollback");
				});
			}),
		},
		{
			name: "concurrent commands at one revision commit at most one action",
			run: fresh(async (storage) => {
				const command = (idempotencyKey: string, requestFingerprint: string) => executeCampaignCommand(storage, {
					campaignRoot: "campaigns/shared",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey,
					requestFingerprint,
					execute: async (transaction) => {
						await transaction.write("campaigns/shared/campaign.md", idempotencyKey);
						await transaction.append("campaigns/shared/rolls.jsonl", `${idempotencyKey}\n`);
						return { command: idempotencyKey };
					},
				});
				const results = await Promise.allSettled([command("request-a", "payload-a"), command("request-b", "payload-b")]);
				assert(results.filter((result) => result.status === "fulfilled").length === 1, "exactly one competing command should commit");
				const failure = results.find((result) => result.status === "rejected");
				assert(failure?.status === "rejected" && failure.reason instanceof StaleCampaignRevisionError, "loser must report stale revision");
				await storage.transaction(async (transaction) => {
					const ledger = await transaction.read("campaigns/shared/rolls.jsonl");
					assert(ledger === "request-a\n" || ledger === "request-b\n", "one complete ledger append must commit");
					equal(await transaction.read(".transactions/campaigns/shared/revision"), "1", "revision must increment once");
				});
			}),
		},
		{
			name: "identical retry replays the original result before stale revision rejection",
			run: fresh(async (storage) => {
				let executions = 0;
				const input = {
					campaignRoot: "campaigns/draw",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "roll-1",
					requestFingerprint: "1d20+5|player",
					execute: async (transaction: StorageTransaction) => {
						executions++;
						await transaction.append("campaigns/draw/rolls.jsonl", "{\"id\":\"h-1\",\"total\":17}\n");
						await transaction.write("campaigns/draw/piles.json", "{\"deck\":[2]}");
						await transaction.write("campaigns/draw/pending.json", "null");
						return { ledgerId: "h-1", total: 17 };
					},
				};
				const first = await executeCampaignCommand(storage, input);
				const retry = await executeCampaignCommand(storage, input);
				equal(first, { revision: 1, result: { ledgerId: "h-1", total: 17 }, replayed: false }, "first command receipt changed");
				equal(retry, { revision: 1, result: { ledgerId: "h-1", total: 17 }, replayed: true }, "retry must return original committed result");
				equal(executions, 1, "retry must not execute the action again");
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/draw/rolls.jsonl"), "{\"id\":\"h-1\",\"total\":17}\n", "retry duplicated ledger entry");
					equal(await transaction.read(".transactions/campaigns/draw/revision"), "1", "retry changed revision");
				});
			}),
		},
		{
			name: "idempotency conflicts and unseen stale commands have no effects",
			run: fresh(async (storage) => {
				let executions = 0;
				const base = {
					campaignRoot: "campaigns/conflicts",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "same-key",
					requestFingerprint: "original",
					execute: async (transaction: StorageTransaction) => {
						executions++;
						await transaction.append("campaigns/conflicts/rolls.jsonl", "one\n");
						return { ok: true };
					},
				};
				await executeCampaignCommand(storage, base);
				await rejectsWith(
					() => executeCampaignCommand(storage, { ...base, requestFingerprint: "changed" }),
					IdempotencyConflictError,
					"changed payload must conflict on key reuse",
				);
				await rejectsWith(
					() => executeCampaignCommand(storage, { ...base, idempotencyKey: "new-key", requestFingerprint: "stale" }),
					StaleCampaignRevisionError,
					"unseen stale command must be rejected",
				);
				equal(executions, 1, "rejected requests must not execute actions");
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/conflicts/rolls.jsonl"), "one\n", "rejected request changed ledger");
					equal(await transaction.read(".transactions/campaigns/conflicts/revision"), "1", "rejected request changed revision");
				});
			}),
		},
		{
			name: "retry after a committed response is lost returns the committed receipt",
			run: fresh(async (storage) => {
				let loseResponse = true;
				let executions = 0;
				const responseLoss: TransactionalStorage = {
					async transaction(operation) {
						const result = await storage.transaction(operation);
						if (loseResponse) {
							loseResponse = false;
							throw new Error("simulated lost response after commit");
						}
						return result;
					},
				};
				const input = {
					campaignRoot: "campaigns/retry",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "lost-response",
					requestFingerprint: "same-request",
					execute: async (transaction: StorageTransaction) => {
						executions++;
						await transaction.append("campaigns/retry/rolls.jsonl", "{\"id\":\"r-1\"}\n");
						return { ledgerId: "r-1" };
					},
				};
				await rejectsWith(() => executeCampaignCommand(responseLoss, input), Error, "simulated response loss must reach caller");
				const retry = await executeCampaignCommand(storage, input);
				equal(retry, { revision: 1, result: { ledgerId: "r-1" }, replayed: true }, "retry must replay the commit after response loss");
				equal(executions, 1, "lost response must not repeat the action");
			}),
		},
	];
}
