import { assertValidKey, isValidKey, StorageError, type Storage, type StorageKey } from "./storage.ts";

/** Storage view whose reads and writes belong to one atomic transaction. */
export type StorageTransaction = Storage;

/**
 * Atomic persistence for commands spanning multiple campaign records.
 *
 * Implementations must provide serializable transactions: all reads in the
 * callback observe one consistent state, writes are visible together only on
 * successful completion, and a thrown/rejected callback commits nothing. The
 * transaction must include campaign documents, append-only ledger entries,
 * piles/counters, pending state, revisions, and replay records. Every access
 * must use the callback-scoped view; writes that escape it are outside the
 * contract. Do not nest transactions or perform external side effects while a
 * transaction is open.
 */
export interface TransactionalStorage {
	transaction<T>(operation: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}

export class StaleCampaignRevisionError extends Error {
	readonly expectedRevision: number;
	readonly actualRevision: number;
	constructor(expectedRevision: number, actualRevision: number) {
		super(`Campaign revision is ${actualRevision}, expected ${expectedRevision}`);
		this.name = "StaleCampaignRevisionError";
		this.expectedRevision = expectedRevision;
		this.actualRevision = actualRevision;
	}
}

export class IdempotencyConflictError extends Error {
	readonly idempotencyKey: string;
	constructor(idempotencyKey: string) {
		super("Idempotency key was already used for a different request");
		this.name = "IdempotencyConflictError";
		this.idempotencyKey = idempotencyKey;
	}
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

export interface CampaignCommandReceipt<T extends JsonValue> {
	readonly revision: number;
	readonly result: T;
	/** True when the original committed result was returned without executing the action. */
	readonly replayed: boolean;
}

export interface ExecuteCampaignCommand<T extends JsonValue> {
	/** Server-owned storage root for this campaign; not a client-provided storage key. */
	readonly campaignRoot: StorageKey;
	readonly principalId: string;
	readonly expectedRevision: number;
	readonly idempotencyKey: string;
	/** Stable fingerprint of the validated request payload. */
	readonly requestFingerprint: string;
	/** Performs all campaign, ledger, pile, counter, and pending-state effects using only this transaction. */
	readonly execute: (transaction: StorageTransaction) => Promise<T>;
}

interface StoredCommandReceipt {
	readonly version: 1;
	readonly requestFingerprint: string;
	readonly revision: number;
	readonly result: unknown;
}

function requireSingleKeySegment(value: string, label: string): string {
	if (value.includes("/") || !isValidKey(value)) {
		throw new TypeError(`${label} must be one valid storage-key segment`);
	}
	return value;
}

function encodeCampaignRoot(campaignRoot: StorageKey): string {
	const encoded: string[] = [];
	let segment = "";
	for (let index = 0; index < campaignRoot.length; index++) {
		segment += campaignRoot.charCodeAt(index).toString(16).padStart(2, "0");
		if (segment.length === 200) {
			encoded.push(segment);
			segment = "";
		}
	}
	if (segment) encoded.push(segment);
	return `${encoded.join("/")}/end`;
}

function assertJsonValue(value: unknown, ancestors = new Set<object>()): asserts value is JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (Number.isFinite(value) && !Object.is(value, -0)) return;
		throw new TypeError("Command result must contain only JSON-compatible data");
	}
	if (typeof value !== "object") throw new TypeError("Command result must contain only JSON-compatible data");

	if (ancestors.has(value)) throw new TypeError("Command result must not contain cycles");
	ancestors.add(value);

	if (Array.isArray(value)) {
		if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) {
			throw new TypeError("Command result must contain only JSON-compatible data");
		}
		for (let index = 0; index < value.length; index++) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor?.enumerable || !("value" in descriptor)) {
				throw new TypeError("Command result must contain only JSON-compatible data");
			}
			assertJsonValue(descriptor.value, ancestors);
		}
	} else {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError("Command result must contain only JSON-compatible data");
		}
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") throw new TypeError("Command result must contain only JSON-compatible data");
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor?.enumerable || !("value" in descriptor)) {
				throw new TypeError("Command result must contain only JSON-compatible data");
			}
			assertJsonValue(descriptor.value, ancestors);
		}
	}
	ancestors.delete(value);
}


function parseRevision(value: string | undefined, key: StorageKey): number {
	if (value === undefined) return 0;
	if (!/^(0|[1-9]\d*)$/.test(value)) throw new StorageError("Invalid campaign revision record", key);
	const revision = Number(value);
	if (!Number.isSafeInteger(revision)) throw new StorageError("Invalid campaign revision record", key);
	return revision;
}

function parseReceipt(value: string, key: StorageKey): StoredCommandReceipt {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new StorageError("Invalid idempotency replay record", key);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new StorageError("Invalid idempotency replay record", key);
	}
	const record = parsed as Record<string, unknown>;
	if (record.version !== 1 || typeof record.requestFingerprint !== "string" ||
		!Number.isSafeInteger(record.revision) || (record.revision as number) < 1 ||
		!Object.hasOwn(record, "result")) {
		throw new StorageError("Invalid idempotency replay record", key);
	}
	return record as unknown as StoredCommandReceipt;
}

/**
 * Execute a campaign command atomically. Authorization must happen before this
 * call, including before replay lookup. The replay is checked before revision
 * comparison so a committed request can be retried with its original revision.
 */
export async function executeCampaignCommand<T extends JsonValue>(
	storage: TransactionalStorage,
	input: ExecuteCampaignCommand<T>,
): Promise<CampaignCommandReceipt<T>> {
	const campaignRoot = assertValidKey(input.campaignRoot);
	if (campaignRoot === ".transactions" || campaignRoot.startsWith(".transactions/")) {
		throw new TypeError("Campaign root uses the reserved transaction metadata namespace");
	}
	const principalId = requireSingleKeySegment(input.principalId, "Principal ID");
	const idempotencyKey = requireSingleKeySegment(input.idempotencyKey, "Idempotency key");
	if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
		throw new TypeError("Expected revision must be a non-negative safe integer");
	}
	if (!input.requestFingerprint) throw new TypeError("Request fingerprint is required");

	const commandRoot = `.transactions/roots/${encodeCampaignRoot(campaignRoot)}`;
	const revisionKey = assertValidKey(`${commandRoot}/revision`);
	const replayKey = assertValidKey(`${commandRoot}/replays/${principalId}/${idempotencyKey}`);

	return storage.transaction(async (transaction) => {
		const replayText = await transaction.read(replayKey);
		if (replayText !== undefined) {
			const replay = parseReceipt(replayText, replayKey);
			if (replay.requestFingerprint !== input.requestFingerprint) {
				throw new IdempotencyConflictError(idempotencyKey);
			}
			return { revision: replay.revision, result: replay.result as T, replayed: true };
		}

		const actualRevision = parseRevision(await transaction.read(revisionKey), revisionKey);
		if (actualRevision !== input.expectedRevision) {
			throw new StaleCampaignRevisionError(input.expectedRevision, actualRevision);
		}
		if (actualRevision === Number.MAX_SAFE_INTEGER) {
			throw new StorageError("Campaign revision is exhausted", revisionKey);
		}

		const revision = actualRevision + 1;
		const result = await input.execute(transaction);
		assertJsonValue(result);
		const serialized = JSON.stringify({ version: 1, requestFingerprint: input.requestFingerprint, revision, result });
		if (serialized === undefined) throw new TypeError("Command result must be JSON-serializable");
		const receipt = parseReceipt(serialized, replayKey);
		await transaction.write(revisionKey, String(revision));
		await transaction.write(replayKey, serialized);
		return { revision, result: receipt.result as T, replayed: false };
	});
}
