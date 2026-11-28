import Database from "better-sqlite3";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertValidKey, StorageUnavailableError, type Storage, type StorageKey, type TransactionalStorage } from "@portents/core";
import type { LocalCredentialRecord, LocalCredentialRepository } from "@portents/identity";

const APPEND_CHUNK_SIZE = 64 * 1024;
let nextMemoryQueue = 0;
const queues = new Map<string, Promise<unknown>>();
const inFlight = new Map<string, number>();

function canonicalDatabaseKey(path: string): string {
	const absolute = resolve(path);
	let canonical: string;
	try {
		canonical = realpathSync(absolute);
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
		canonical = join(realpathSync(dirname(absolute)), basename(absolute));
	}
	return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function* textChunks(value: string): Generator<string> {
	for (let offset = 0; offset < value.length;) {
		let end = Math.min(offset + APPEND_CHUNK_SIZE, value.length);
		if (end < value.length) {
			const last = value.charCodeAt(end - 1);
			const next = value.charCodeAt(end);
			if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
		}
		yield value.slice(offset, end);
		offset = end;
	}
}

/** SQLite-backed campaign storage and credential repository. */
export class SqliteStorage implements Storage, TransactionalStorage, LocalCredentialRepository {
	readonly #db: Database.Database;
	readonly #queueKey: string;
	#tail: Promise<unknown> = Promise.resolve();
	#closed = false;
	readonly #viewActivity = new WeakMap<object, () => boolean>();

	constructor(database: Database.Database | string) {
		const queueKey = typeof database === "string"
			? database === ":memory:" ? `memory:${++nextMemoryQueue}` : canonicalDatabaseKey(database)
			: database.name && database.name !== ":memory:" ? canonicalDatabaseKey(database.name) : `memory:${++nextMemoryQueue}`;
		if ((inFlight.get(queueKey) ?? 0) > 0) {
			throw new Error("Cannot initialize SQLite storage while operations on the same database are queued or active");
		}
		this.#queueKey = queueKey;
		this.#db = typeof database === "string" ? new Database(database) : database;
		this.#db.pragma("foreign_keys = ON");
		this.#db.pragma("journal_mode = WAL");
		this.#db.pragma("synchronous = FULL");
		this.#db.exec(`CREATE TABLE IF NOT EXISTS storage_chunks (
				key TEXT NOT NULL COLLATE BINARY,
				sequence INTEGER NOT NULL,
				value TEXT NOT NULL,
				PRIMARY KEY(key, sequence)
			);
			CREATE TABLE IF NOT EXISTS local_credentials (
				id TEXT PRIMARY KEY,
				principal_id TEXT NOT NULL,
				digest TEXT NOT NULL UNIQUE
			);`);
		if (this.#db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'storage'").get()) {
			this.#db.transaction(() => {
				this.#db.exec("INSERT INTO storage_chunks(key, sequence, value) SELECT key, 0, value FROM storage; DROP TABLE storage;");
			})();
		}
	}

	#run<T>(operation: () => T | Promise<T>): Promise<T> {
		const previous = queues.get(this.#queueKey) ?? Promise.resolve();
		inFlight.set(this.#queueKey, (inFlight.get(this.#queueKey) ?? 0) + 1);
		const result = Promise.all([this.#tail, previous]).then(() => {
			if (this.#closed) throw new StorageUnavailableError("SQLite storage is closed");
			return operation();
		}).finally(() => {
			const count = inFlight.get(this.#queueKey)! - 1;
			if (count === 0) inFlight.delete(this.#queueKey);
			else inFlight.set(this.#queueKey, count);
		});
		const settled = result.catch(() => undefined);
		this.#tail = settled;
		queues.set(this.#queueKey, settled);
		return result;
	}

	#view(): Storage & { expire(): void } {
		let active = true;
		const ensureActive = () => {
			if (!active) throw new StorageUnavailableError("SQLite transaction is no longer active");
		};
		const isActive = (): boolean => active;
		const view = {
			read: async (key: StorageKey) => { ensureActive(); return this.#read(assertValidKey(key)); },
			write: async (key: StorageKey, value: string) => { ensureActive(); this.#replace(assertValidKey(key), value); },
			append: async (key: StorageKey, value: string) => { ensureActive(); this.#appendChunks(assertValidKey(key), value); },
			exists: async (key: StorageKey) => { ensureActive(); return this.#read(assertValidKey(key)) !== undefined; },
			list: async (prefix: string) => { ensureActive(); return this.#list(prefix); },
			remove: async (key: StorageKey) => { ensureActive(); this.#remove(assertValidKey(key)); },
			expire: () => { active = false; },
		};
		this.#viewActivity.set(view, isActive);
		return view;
	}

	/** Returns credential operations bound to this live transaction view. */
	credentialsFor(transaction: Storage): LocalCredentialRepository {
		const isActive = this.#viewActivity.get(transaction);
		if (!isActive) throw new TypeError("Storage view is not an active SQLite transaction");
		const assertActive = () => {
			if (!isActive()) throw new StorageUnavailableError("SQLite transaction is no longer active");
		};
		return {
			insert: async (record) => {
				assertActive();
				if (!record.id || !record.principalId || !record.digest) throw new TypeError("Credential fields must be non-empty");
				this.#db.prepare("INSERT INTO local_credentials(id, principal_id, digest) VALUES(?, ?, ?)").run(record.id, record.principalId, record.digest);
			},
			findByDigest: async (digest) => {
				assertActive();
				const row = this.#db.prepare("SELECT id, digest, principal_id AS principalId FROM local_credentials WHERE digest = ?").get(digest) as LocalCredentialRecord | undefined;
				return row ?? null;
			},
			deleteById: async (principalId, credentialId) => {
				assertActive();
				return this.#db.prepare("DELETE FROM local_credentials WHERE principal_id = ? AND id = ?").run(principalId, credentialId).changes > 0;
			},
		};
	}

	#read(key: StorageKey): string | undefined {
		const rows = this.#db.prepare("SELECT value FROM storage_chunks WHERE key = ? ORDER BY sequence").all(key) as { value: string }[];
		if (rows.length === 0) return undefined;
		let value = "";
		for (const row of rows) value += row.value;
		return value;
	}
	#replace(key: StorageKey, value: string): void {
		this.#db.prepare("DELETE FROM storage_chunks WHERE key = ?").run(key);
		if (value.length === 0) {
			this.#db.prepare("INSERT INTO storage_chunks(key, sequence, value) VALUES(?, 0, '')").run(key);
			return;
		}
		let sequence = 0;
		for (const chunk of textChunks(value)) {
			this.#db.prepare("INSERT INTO storage_chunks(key, sequence, value) VALUES(?, ?, ?)").run(key, sequence++, chunk);
		}
	}
	#write(key: StorageKey, value: string): void {
		this.#db.transaction(() => this.#replace(key, value))();
	}
	#append(key: StorageKey, value: string): void {
		this.#db.transaction(() => this.#appendChunks(key, value))();
	}
	#appendChunks(key: StorageKey, value: string): void {
		const next = this.#db.prepare("SELECT COALESCE(MAX(sequence) + 1, 0) AS sequence FROM storage_chunks WHERE key = ?").get(key) as { sequence: number };
		let sequence = next.sequence;
		for (const chunk of textChunks(value)) {
			this.#db.prepare("INSERT INTO storage_chunks(key, sequence, value) VALUES(?, ?, ?)").run(key, sequence++, chunk);
		}
		if (next.sequence === 0 && value.length === 0) this.#db.prepare("INSERT INTO storage_chunks(key, sequence, value) VALUES(?, 0, '')").run(key);
	}
	#list(prefix: string): StorageKey[] {
		return (this.#db.prepare("SELECT DISTINCT key FROM storage_chunks WHERE substr(key, 1, ?) = ? ORDER BY key COLLATE BINARY").all(prefix.length, prefix) as { key: StorageKey }[]).map(({ key }) => key);
	}
	#remove(key: StorageKey): void {
		this.#db.prepare("DELETE FROM storage_chunks WHERE key = ?").run(key);
	}

	read(key: StorageKey): Promise<string | undefined> {
		const valid = assertValidKey(key);
		return this.#run(() => this.#read(valid));
	}
	write(key: StorageKey, value: string): Promise<void> {
		const valid = assertValidKey(key);
		return this.#run(() => this.#write(valid, value));
	}
	append(key: StorageKey, value: string): Promise<void> {
		const valid = assertValidKey(key);
		return this.#run(() => this.#append(valid, value));
	}
	exists(key: StorageKey): Promise<boolean> {
		const valid = assertValidKey(key);
		return this.#run(() => this.#read(valid) !== undefined);
	}
	list(prefix: string): Promise<StorageKey[]> {
		return this.#run(() => this.#list(prefix));
	}
	remove(key: StorageKey): Promise<void> {
		const valid = assertValidKey(key);
		return this.#run(() => this.#remove(valid));
	}

	transaction<T>(operation: (transaction: Storage) => Promise<T>): Promise<T> {
		return this.#run(async () => {
			this.#db.exec("BEGIN IMMEDIATE");
			const transaction = this.#view();
			try {
				const result = await operation(transaction);
				this.#db.exec("COMMIT");
				return result;
			} catch (error) {
				try {
					this.#db.exec("ROLLBACK");
				} catch {
					// Preserve the callback/commit failure; SQLite may already have ended it.
				}
				throw error;
			} finally {
				transaction.expire();
			}
		});
	}

	async insert(record: LocalCredentialRecord): Promise<void> {
		if (!record.id || !record.principalId || !record.digest) throw new TypeError("Credential fields must be non-empty");
		return this.#run(() => {
			this.#db.prepare("INSERT INTO local_credentials(id, principal_id, digest) VALUES(?, ?, ?)").run(record.id, record.principalId, record.digest);
		});
	}

	findByDigest(digest: string): Promise<LocalCredentialRecord | null> {
		return this.#run(() => {
			const row = this.#db.prepare("SELECT id, digest, principal_id AS principalId FROM local_credentials WHERE digest = ?").get(digest) as LocalCredentialRecord | undefined;
			return row ?? null;
		});
	}

	deleteById(principalId: string, credentialId: string): Promise<boolean> {
		return this.#run(() => this.#db.prepare("DELETE FROM local_credentials WHERE principal_id = ? AND id = ?").run(principalId, credentialId).changes > 0);
	}

	backup(destination: string): Promise<void> {
		return this.#run(async () => { await this.#db.backup(destination); });
	}

	close(): Promise<void> {
		return this.#run(() => {
			this.#db.close();
			this.#closed = true;
		});
	}
}
