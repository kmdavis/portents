/**
 * Storage — the only way the library touches durable state.
 *
 * The engine itself (dice, tables, decks, oracle, maps, tiles, sheets) is
 * synchronous and pure. Persistence is the one asynchronous seam, because
 * IndexedDB and the Origin Private File System cannot be synchronous and a
 * browser build is a hard requirement.
 *
 * ## Contract
 *
 * Implementations MUST satisfy all of this. `storageConformance()` in
 * `@portents/core/testing` checks every clause, and each adapter runs it.
 *
 * **Keys** are POSIX-ish relative paths made of segments joined by `/`:
 * `grimhold/journal.md`. There is deliberately no path module involved and no
 * OS-specific behaviour.
 * - Valid: one or more segments of `[A-Za-z0-9._-]`, joined by single slashes.
 * - Invalid, and MUST throw {@link InvalidKeyError}: the empty string, a
 *   leading or trailing `/`, `//`, any segment equal to `.` or `..`, a
 *   backslash, a NUL, or any segment longer than 255 characters.
 * - Keys are case-sensitive, even on a case-insensitive filesystem. Adapters on
 *   such filesystems may therefore collide; that is a documented limitation,
 *   not licence to normalise case.
 *
 * **Values** are UTF-8 text. There is no binary API in v0. Writing a string and
 * reading it back MUST return exactly that string, including trailing newlines
 * and astral-plane characters.
 *
 * **`read`** resolves to `undefined` for a missing key. It MUST NOT throw for
 * absence — absence is normal and callers branch on it constantly.
 *
 * **`write`** creates or replaces, whole-value, and creates any intermediate
 * structure the adapter needs. It MUST be atomic against readers: a reader
 * either sees the previous value or the new one, never a partial write.
 *
 * **`append`** adds to the end of an existing value, or creates the key. It is
 * atomic against *readers* but NOT against concurrent *writers* (see
 * single-writer below). It exists because an append-only journal and roll
 * ledger are the two hottest write paths and read-modify-write on a growing
 * file is wasteful.
 *
 * **`list`** returns every key that starts with the given prefix, in
 * lexicographic order by code unit. A prefix of `""` lists everything. The
 * prefix is matched literally, not as a directory: `list("grim")` matches
 * `grimhold/journal.md`. Pass a trailing slash if you mean a directory.
 * Ordering is specified because callers sort campaigns for display, and an
 * unstable order makes that flap.
 *
 * **`remove`** on a missing key is a no-op, not an error, so cleanup is
 * idempotent.
 *
 * ## Single-writer assumption
 *
 * v0 assumes **one writer at a time**. This is a solo tabletop tool: one
 * player, one process, one campaign directory. There is no compare-and-swap, no
 * optimistic locking, and no revision counter, because adding them would
 * complicate every call site to solve a problem the domain does not have.
 *
 * If that ever stops being true — a shared campaign, two browser tabs, a server
 * — the fix is a `CheckedStorage` extension adding
 * `writeIfUnchanged(key, expectedEtag, value)`, not a change to this interface.
 * Adapters are free to implement it early.
 *
 * Concretely, an adapter MAY lose an update if two writers race. It MUST NOT
 * corrupt a value: a torn read is a bug, a lost update is a documented risk.
 */

/** A validated storage key. Produced by {@link assertValidKey}. */
export type StorageKey = string;

export class StorageError extends Error {
	readonly key: string | undefined;
	constructor(message: string, key?: string) {
		super(message);
		this.name = "StorageError";
		this.key = key;
	}
}

export class InvalidKeyError extends StorageError {
	constructor(key: string, reason: string) {
		super(`Invalid storage key ${JSON.stringify(key)}: ${reason}`, key);
		this.name = "InvalidKeyError";
	}
}

export class StorageUnavailableError extends StorageError {
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "StorageUnavailableError";
		this.cause = cause;
	}
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_SEGMENT = 255;

/**
 * Throw unless `key` satisfies the key rules in the module docs. Adapters call
 * this first in every method so the rules cannot drift between them.
 */
export function assertValidKey(key: string): StorageKey {
	if (typeof key !== "string") throw new InvalidKeyError(String(key), "not a string");
	if (key.length === 0) throw new InvalidKeyError(key, "empty");
	if (key.includes("\\")) throw new InvalidKeyError(key, "backslashes are not path separators here");
	if (key.includes("\0")) throw new InvalidKeyError(key, "contains a NUL byte");
	if (key.startsWith("/")) throw new InvalidKeyError(key, "must be relative, with no leading slash");
	if (key.endsWith("/")) throw new InvalidKeyError(key, "must name a value, not a directory");
	if (key.includes("//")) throw new InvalidKeyError(key, "empty path segment");

	for (const segment of key.split("/")) {
		if (segment === "." || segment === "..") {
			throw new InvalidKeyError(key, `traversal segment ${JSON.stringify(segment)}`);
		}
		if (segment.length > MAX_SEGMENT) {
			throw new InvalidKeyError(key, `segment longer than ${MAX_SEGMENT} characters`);
		}
		if (!SEGMENT.test(segment)) {
			throw new InvalidKeyError(key, `segment ${JSON.stringify(segment)} has characters outside [A-Za-z0-9._-]`);
		}
	}
	return key;
}

/** True when `key` is valid, for callers that would rather branch than catch. */
export function isValidKey(key: string): boolean {
	try {
		assertValidKey(key);
		return true;
	} catch {
		return false;
	}
}

/** Durable UTF-8 text keyed by relative path. See the module docs for the contract. */
export interface Storage {
	/** The stored text, or `undefined` if the key does not exist. Never throws for absence. */
	read(key: StorageKey): Promise<string | undefined>;

	/** Create or wholly replace. Atomic against readers. */
	write(key: StorageKey, contents: string): Promise<void>;

	/** Add to the end, creating the key if absent. Atomic against readers only. */
	append(key: StorageKey, contents: string): Promise<void>;

	/** Whether the key exists. */
	exists(key: StorageKey): Promise<boolean>;

	/** Keys starting with `prefix`, lexicographic by code unit. `""` lists all. */
	list(prefix: string): Promise<StorageKey[]>;

	/** Delete. A no-op when the key is absent. */
	remove(key: StorageKey): Promise<void>;
}
