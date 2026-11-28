import Database from "better-sqlite3";
import { assertValidKey, StorageUnavailableError, type Storage, type StorageKey, type TransactionalStorage } from "@portents/core";
import type { LocalCredentialRecord, LocalCredentialRepository } from "@portents/identity";

/** SQLite-backed campaign storage and credential repository. */
export class SqliteStorage implements Storage, TransactionalStorage, LocalCredentialRepository {
	readonly #db: Database.Database;
	#tail: Promise<unknown> = Promise.resolve();
	#closed = false;

	constructor(database: Database.Database | string) {
		this.#db = typeof database === "string" ? new Database(database) : database;
		this.#db.pragma("foreign_keys = ON");
		this.#db.pragma("journal_mode = WAL");
		this.#db.pragma("synchronous = FULL");
		this.#db.exec(`CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY COLLATE BINARY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS local_credentials (
				id TEXT PRIMARY KEY,
				principal_id TEXT NOT NULL,
				digest TEXT NOT NULL UNIQUE
			);`);
	}

	#run<T>(operation: () => T | Promise<T>): Promise<T> {
		const result = this.#tail.then(() => {
			if (this.#closed) throw new StorageUnavailableError("SQLite storage is closed");
			return operation();
		});
		this.#tail = result.catch(() => undefined);
		return result;
	}

	#view(): Storage {
		return {
			read: async (key) => this.#read(assertValidKey(key)),
			write: async (key, value) => this.#write(assertValidKey(key), value),
			append: async (key, value) => this.#append(assertValidKey(key), value),
			exists: async (key) => this.#read(assertValidKey(key)) !== undefined,
			list: async (prefix) => this.#list(prefix),
			remove: async (key) => this.#remove(assertValidKey(key)),
		};
	}

	#read(key: StorageKey): string | undefined {
		return (this.#db.prepare("SELECT value FROM storage WHERE key = ?").get(key) as { value: string } | undefined)?.value;
	}
	#write(key: StorageKey, value: string): void {
		this.#db.prepare("INSERT INTO storage(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
	}
	#append(key: StorageKey, value: string): void {
		this.#db.prepare("INSERT INTO storage(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = storage.value || excluded.value").run(key, value);
	}
	#list(prefix: string): StorageKey[] {
		return (this.#db.prepare("SELECT key FROM storage WHERE substr(key, 1, ?) = ? ORDER BY key COLLATE BINARY").all(prefix.length, prefix) as { key: StorageKey }[]).map(({ key }) => key);
	}
	#remove(key: StorageKey): void {
		this.#db.prepare("DELETE FROM storage WHERE key = ?").run(key);
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
			try {
				const result = await operation(this.#view());
				this.#db.exec("COMMIT");
				return result;
			} catch (error) {
				try {
					this.#db.exec("ROLLBACK");
				} catch {
					// Preserve the callback/commit failure; SQLite may already have ended it.
				}
				throw error;
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
