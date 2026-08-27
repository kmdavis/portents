/**
 * Browser Storage, on IndexedDB.
 *
 * IndexedDB rather than localStorage: localStorage is synchronous, capped
 * around 5 MB, and a campaign journal plus a roll ledger will outgrow that in a
 * long game. IndexedDB is also transactional, which is what makes the contract's
 * "a reader never sees a partial write" clause true rather than hopeful.
 *
 * One object store, keys as strings, values as strings. No schema beyond that,
 * because the library's durable format is markdown and JSON text — the browser
 * is just another place to keep the same files.
 *
 * Not exercised by the Node test suite: there is no IndexedDB in Node, so the
 * conformance suite for this adapter has to run under a real browser or a DOM
 * emulation. That is a genuine gap and it is called out in the README rather
 * than papered over with a fake.
 */

import { assertValidKey, type Storage, type StorageKey, StorageUnavailableError } from "../../ports/storage.ts";

export interface BrowserStorageOptions {
	/** Database name. Use one per application, not one per campaign. */
	readonly database?: string;
	/** Object store name. */
	readonly store?: string;
}

const DEFAULT_DATABASE = "portent";
const DEFAULT_STORE = "files";

function indexedDb(): IDBFactory {
	const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
	if (!factory) {
		throw new StorageUnavailableError(
			"No IndexedDB available. BrowserStorage needs a browser context; use MemoryStorage in tests or " +
				"NodeStorage on a server.",
		);
	}
	return factory;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

export class BrowserStorage implements Storage {
	readonly #database: string;
	readonly #store: string;
	#connection: Promise<IDBDatabase> | undefined;

	constructor(options: BrowserStorageOptions = {}) {
		this.#database = options.database ?? DEFAULT_DATABASE;
		this.#store = options.store ?? DEFAULT_STORE;
	}

	#open(): Promise<IDBDatabase> {
		this.#connection ??= new Promise((resolve, reject) => {
			const request = indexedDb().open(this.#database, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.#store)) db.createObjectStore(this.#store);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(new StorageUnavailableError(`Could not open IndexedDB "${this.#database}"`, request.error));
			request.onblocked = () =>
				reject(new StorageUnavailableError(`IndexedDB "${this.#database}" is blocked by another tab`));
		});
		return this.#connection;
	}

	/**
	 * Run `work` in one transaction. Read-modify-write for `append` happens
	 * inside a single `readwrite` transaction, which is what keeps it atomic
	 * against readers.
	 */
	async #transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
		const db = await this.#open();
		return new Promise<T>((resolve, reject) => {
			const transaction = db.transaction(this.#store, mode);
			let result: T;
			let settled = false;
			transaction.oncomplete = () => {
				if (!settled) resolve(result);
			};
			transaction.onerror = () => {
				settled = true;
				reject(new StorageUnavailableError("IndexedDB transaction failed", transaction.error));
			};
			transaction.onabort = () => {
				settled = true;
				reject(new StorageUnavailableError("IndexedDB transaction aborted", transaction.error));
			};
			Promise.resolve(work(transaction.objectStore(this.#store))).then(
				(value) => {
					result = value;
				},
				(error) => {
					settled = true;
					try {
						transaction.abort();
					} catch {
						// Already finished.
					}
					reject(error);
				},
			);
		});
	}

	async read(key: StorageKey): Promise<string | undefined> {
		const valid = assertValidKey(key);
		return this.#transact("readonly", async (store) => {
			const value = await promisify<unknown>(store.get(valid));
			return typeof value === "string" ? value : undefined;
		});
	}

	async write(key: StorageKey, contents: string): Promise<void> {
		const valid = assertValidKey(key);
		await this.#transact("readwrite", async (store) => {
			await promisify(store.put(contents, valid));
		});
	}

	async append(key: StorageKey, contents: string): Promise<void> {
		const valid = assertValidKey(key);
		await this.#transact("readwrite", async (store) => {
			const existing = await promisify<unknown>(store.get(valid));
			const base = typeof existing === "string" ? existing : "";
			await promisify(store.put(base + contents, valid));
		});
	}

	async exists(key: StorageKey): Promise<boolean> {
		const valid = assertValidKey(key);
		return this.#transact("readonly", async (store) => {
			const count = await promisify<number>(store.count(valid));
			return count > 0;
		});
	}

	async list(prefix: string): Promise<StorageKey[]> {
		return this.#transact("readonly", async (store) => {
			const keys = await promisify<IDBValidKey[]>(store.getAllKeys());
			return keys
				.filter((key): key is string => typeof key === "string")
				.filter((key) => key.startsWith(prefix))
				.sort();
		});
	}

	async remove(key: StorageKey): Promise<void> {
		const valid = assertValidKey(key);
		await this.#transact("readwrite", async (store) => {
			await promisify(store.delete(valid));
		});
	}

	/** Close the connection. Mostly for tests and for tearing down a session. */
	async close(): Promise<void> {
		if (!this.#connection) return;
		(await this.#connection).close();
		this.#connection = undefined;
	}
}

export {
	type RasterOptions,
	svgDimensions,
	svgToPngBlob,
	svgToPngBytes,
	svgToPngDataUrl,
} from "./raster.ts";
