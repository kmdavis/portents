import {
	executeCampaignCommand,
	IdempotencyConflictError,
	readCampaignRevision,
	StaleCampaignRevisionError,
	type JsonValue,
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
					authorize: async () => {},
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
				});
			}),
		},
		{
			name: "concurrent identical retries replay once and same-key conflicts stay distinct from stale writes",
			run: fresh(async (storage) => {
				let executions = 0;
				const input = {
					campaignRoot: "campaigns/concurrent-replay",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "same-request",
					requestFingerprint: "same-payload",
					authorize: async () => {},
					execute: async (transaction: StorageTransaction) => {
						executions++;
						await transaction.append("campaigns/concurrent-replay/rolls.jsonl", "one\n");
						return { ledgerId: "one" };
					},
				};
				const [first, second] = await Promise.all([
					executeCampaignCommand(storage, input),
					executeCampaignCommand(storage, input),
				]);
				equal(executions, 1, "overlapping identical commands must execute once");
				equal(first.result, second.result, "identical requests must return equal results");
				equal(first.revision, second.revision, "identical requests must return equal revisions");
				assert(first.replayed !== second.replayed, "one overlapping request must replay the committed result");

				const conflictStorage = await factory();
				let conflictingExecutions = 0;
				const conflictingCommand = (requestFingerprint: string) => executeCampaignCommand(conflictStorage, {
					campaignRoot: "campaigns/concurrent-conflict",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "same-key",
					requestFingerprint,
					authorize: async () => {},
					execute: async (transaction) => {
						conflictingExecutions++;
						await transaction.append("campaigns/concurrent-conflict/rolls.jsonl", `${requestFingerprint}\n`);
						return { requestFingerprint };
					},
				});
				const conflicts = await Promise.allSettled([
					conflictingCommand("payload-a"),
					conflictingCommand("payload-b"),
				]);
				assert(conflicts.filter((result) => result.status === "fulfilled").length === 1, "one conflicting request must commit");
				const conflict = conflicts.find((result) => result.status === "rejected");
				assert(conflict?.status === "rejected" && conflict.reason instanceof IdempotencyConflictError, "same-key loser must report idempotency conflict");
				equal(conflictingExecutions, 1, "conflicting request must not execute after the first commit");
			}),
		},
		{
			name: "authorization is checked inside the transaction before replay",
			run: fresh(async (storage) => {
				await storage.transaction((transaction) => transaction.write("campaigns/auth/owner", "alice"));
				let executions = 0;
				const command = (idempotencyKey: string, expectedRevision: number) => executeCampaignCommand(storage, {
					campaignRoot: "campaigns/auth",
					principalId: "alice",
					expectedRevision,
					idempotencyKey,
					requestFingerprint: "same-command",
					authorize: async (transaction) => {
						assert(
							!("write" in transaction) && !("append" in transaction) && !("remove" in transaction),
							"authorization view must not expose mutating methods at runtime",
						);
						if (await transaction.read("campaigns/auth/owner") !== "alice") {
							throw new Error("campaign access denied");
						}
					},
					execute: async (transaction) => {
						executions++;
						await transaction.write(`campaigns/auth/actions/${idempotencyKey}`, "committed");
						return { idempotencyKey };
					},
				});
				await command("original", 0);
				await storage.transaction((transaction) => transaction.write("campaigns/auth/owner", "bob"));
				await rejectsWith(() => command("original", 0), Error, "revoked owner must not receive a replay result");
				await rejectsWith(() => command("new-command", 1), Error, "revoked owner must not execute a new command");
				equal(executions, 1, "denied replay and new command must not execute");
				await storage.transaction((transaction) => transaction.write("campaigns/auth/owner", "alice"));
				const next = await command("authorized-next", 1);
				equal(next.revision, 2, "denied new command must not change campaign revision");
			}),
		},
		{
			name: "gameplay callbacks cannot access other campaigns or transaction metadata",
			run: fresh(async (storage) => {
				const violations: Array<[string, (transaction: StorageTransaction) => Promise<unknown>]> = [
					["cross-campaign", (transaction) => transaction.write("campaigns/other/state", "bad")],
					["metadata-removal", (transaction) => transaction.remove(".transactions/roots/other/replay")],
					["broad-list", (transaction) => transaction.list("campaigns")],
				];
				for (const [key, violateScope] of violations) {
					await rejectsWith(
						() => executeCampaignCommand(storage, {
							campaignRoot: "campaigns/scoped",
							principalId: "alice",
							expectedRevision: 0,
							idempotencyKey: key,
							requestFingerprint: key,
							authorize: async () => {},
							execute: async (transaction) => {
								await violateScope(transaction);
								return true;
							},
						}),
						TypeError,
						`${key} must be rejected by the campaign scope`,
					);
					await storage.transaction(async (transaction) => {
						equal(await readCampaignRevision(transaction, "campaigns/scoped"), 0, `${key} must not advance the revision`);
					});
				}
			}),
		},
		{
			name: "a reader never observes a partial multi-record transaction",
			run: fresh(async (storage) => {
				const firstKey = "campaigns/isolation/first.json";
				const secondKey = "campaigns/isolation/second.json";
				await storage.transaction(async (transaction) => {
					await transaction.write(firstKey, "old-first");
					await transaction.write(secondKey, "old-second");
				});
				let writerStarted!: () => void;
				const started = new Promise<void>((resolve) => { writerStarted = resolve; });
				let resumeWriter!: () => void;
				const gate = new Promise<void>((resolve) => { resumeWriter = resolve; });
				const writer = storage.transaction(async (transaction) => {
					await transaction.write(firstKey, "new-first");
					writerStarted();
					await gate;
					await transaction.write(secondKey, "new-second");
				});
				await started;
				const reader = storage.transaction(async (transaction) => ({
					first: await transaction.read(firstKey),
					second: await transaction.read(secondKey),
				}));
				resumeWriter();
				await writer;
				const observed = await reader;
				assert(
					(observed.first === "old-first" && observed.second === "old-second") ||
					(observed.first === "new-first" && observed.second === "new-second"),
					"reader must see the complete pre-commit or committed state",
				);
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
					authorize: async () => {},
					execute: async (transaction: StorageTransaction) => {
						executions++;
						await transaction.append("campaigns/draw/rolls.jsonl", "{\"id\":\"h-1\",\"total\":17}\n");
						await transaction.write("campaigns/draw/piles.json", "{\"deck\":[2]}");
						await transaction.write("campaigns/draw/pending.json", "null");
						return { ledgerId: "h-1", total: 17 };
					},
				};
				await storage.transaction(async (transaction) => {
					equal(await readCampaignRevision(transaction, "campaigns/draw"), 0, "new campaign revision must start at zero");
				});
				const first = await executeCampaignCommand(storage, input);
				const retry = await executeCampaignCommand(storage, input);
				equal(first, { revision: 1, result: { ledgerId: "h-1", total: 17 }, replayed: false }, "first command receipt changed");
				equal(retry, { revision: 1, result: { ledgerId: "h-1", total: 17 }, replayed: true }, "retry must return original committed result");
				equal(executions, 1, "retry must not execute the action again");
				const stale = await rejectsWith(
					() => executeCampaignCommand(storage, { ...input, idempotencyKey: "new-request" }),
					StaleCampaignRevisionError,
					"new request at the original revision must be rejected",
				);
				equal(stale.actualRevision, 1, "a retry must not advance the revision");
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/draw/rolls.jsonl"), "{\"id\":\"h-1\",\"total\":17}\n", "retry duplicated ledger entry");
					equal(await readCampaignRevision(transaction, "campaigns/draw"), 1, "revision accessor must match the committed snapshot");
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
					authorize: async () => {},
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
					() => executeCampaignCommand(storage, { ...base, expectedRevision: 1 }),
					IdempotencyConflictError,
					"reused key with a different expected revision must conflict",
				);
				const stale = await rejectsWith(
					() => executeCampaignCommand(storage, { ...base, idempotencyKey: "new-key", requestFingerprint: "stale" }),
					StaleCampaignRevisionError,
					"unseen stale command must be rejected",
				);
				equal(stale.actualRevision, 1, "rejected requests must not advance the revision");
				await storage.transaction(async (transaction) => {
					equal(await transaction.read("campaigns/conflicts/rolls.jsonl"), "one\n", "rejected request changed ledger");
				});
			}),
		},
		{
			name: "campaign roots use fixed-depth non-overlapping identities",
			run: fresh(async (storage) => {
				const command = (campaignRoot: string, idempotencyKey: string, requestFingerprint: string) =>
					executeCampaignCommand(storage, {
						campaignRoot,
						principalId: "alice",
						expectedRevision: 0,
						idempotencyKey,
						requestFingerprint,
						authorize: async () => {},
						execute: async () => ({ ok: true }),
					});
				await command("campaigns/a", "revision", "first");
				await rejectsWith(
					() => command("campaigns/a/replays/alice/revision", "nested", "nested"),
					TypeError,
					"nested campaign root must be rejected",
				);
				const other = await command("campaigns/a-replays-alice-revision", "separate", "second");
				equal(other.revision, 1, "separate fixed-depth roots must have independent revisions");
			}),
		},
		{
			name: "lossy JSON command results are rejected without committing gameplay writes",
			run: fresh(async (storage) => {
				const cyclic: Record<string, unknown> = {};
				cyclic.self = cyclic;
				const sparse = new Array<JsonValue>(1);
				const accessor: Record<string, unknown> = {};
				Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
				const invalidResults: Array<[string, JsonValue]> = [
					["nan", Number.NaN],
					["negative-zero", -0],
					["cycle", cyclic as unknown as JsonValue],
					["sparse-array", sparse],
					["accessor", accessor as unknown as JsonValue],
					["map", new Map() as unknown as JsonValue],
				];
				for (const [key, result] of invalidResults) {
					await rejectsWith(
						() => executeCampaignCommand(storage, {
							campaignRoot: "campaigns/lossy",
							principalId: "alice",
							expectedRevision: 0,
							idempotencyKey: key,
							requestFingerprint: key,
							authorize: async () => {},
							execute: async (transaction) => {
								await transaction.write("campaigns/lossy/campaign.md", key);
								return result;
							},
						}),
						TypeError,
						`${key} result must be rejected`,
					);
					await storage.transaction(async (transaction) => {
						equal(await transaction.read("campaigns/lossy/campaign.md"), undefined, `${key} result leaked a gameplay write`);
						equal(await readCampaignRevision(transaction, "campaigns/lossy"), 0, `${key} result changed the revision`);
					});
				}
				const committed = await executeCampaignCommand(storage, {
					campaignRoot: "campaigns/lossy",
					principalId: "alice",
					expectedRevision: 0,
					idempotencyKey: "valid",
					requestFingerprint: "valid",
					authorize: async () => {},
					execute: async (transaction) => {
						await transaction.write("campaigns/lossy/campaign.md", "valid");
						return 17;
					},
				});
				equal(committed, { revision: 1, result: 17, replayed: false }, "valid result must commit after invalid results roll back");
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
					authorize: async () => {},
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
