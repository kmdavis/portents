/**
 * In-memory Storage. The reference implementation and the one tests use.
 *
 * Isomorphic — it touches nothing outside the process — so it lives in the core
 * rather than in a platform adapter, and it is what `@portents/core/testing`
 * compares the real adapters against.
 */

import { assertValidKey, type Storage, type StorageKey } from "../../ports/storage.ts";
import type { StorageTransaction, TransactionalStorage } from "../../ports/transaction.ts";

export interface MemoryStorageOptions {
	/** Seed contents, keyed exactly as they would be written. */
	readonly initial?: Readonly<Record<string, string>>;
}

export class MemoryStorage implements Storage {
	#values = new Map<string, string>();

	constructor(options: MemoryStorageOptions = {}) {
		for (const [key, value] of Object.entries(options.initial ?? {})) {
			this.#values.set(assertValidKey(key), value);
		}
	}

	async read(key: StorageKey): Promise<string | undefined> {
		return this.#values.get(assertValidKey(key));
	}

	async write(key: StorageKey, contents: string): Promise<void> {
		// A Map set is indivisible from a reader's point of view, so atomicity is free.
		this.#values.set(assertValidKey(key), contents);
	}

	async append(key: StorageKey, contents: string): Promise<void> {
		const valid = assertValidKey(key);
		this.#values.set(valid, (this.#values.get(valid) ?? "") + contents);
	}

	async exists(key: StorageKey): Promise<boolean> {
		return this.#values.has(assertValidKey(key));
	}

	async list(prefix: string): Promise<StorageKey[]> {
		return [...this.#values.keys()].filter((key) => key.startsWith(prefix)).sort();
	}

	async remove(key: StorageKey): Promise<void> {
		this.#values.delete(assertValidKey(key));
	}

	/** Everything held, for assertions and for dumping a fixture. */
	snapshot(): Record<string, string> {
		return Object.fromEntries([...this.#values.entries()].sort(([a], [b]) => a.localeCompare(b)));
	}

	get size(): number {
		return this.#values.size;
	}

	clear(): void {
		this.#values.clear();
	}
}

/** In-memory transactional reference store. It is serializable but not durable across process restarts. */
export class MemoryTransactionalStorage implements TransactionalStorage {
	#values: Map<string, string>;
	#tail: Promise<void> = Promise.resolve();

	constructor(options: MemoryStorageOptions = {}) {
		this.#values = new Map(Object.entries(new MemoryStorage(options).snapshot()));
	}

	transaction<T>(operation: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
		const result = this.#tail.then(async () => {
			const working = new MemoryStorage({ initial: Object.fromEntries(this.#values) });
			const value = await operation(working);
			this.#values = new Map(Object.entries(working.snapshot()));
			return value;
		});
		this.#tail = result.then(() => undefined, () => undefined);
		return result;
	}

	/** Committed values only; uncommitted transaction state is never exposed. */
	snapshot(): Record<string, string> {
		return Object.fromEntries(this.#values);
	}
}
