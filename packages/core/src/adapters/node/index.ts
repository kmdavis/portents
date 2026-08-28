/**
 * Filesystem Storage for Node.
 *
 * The only file in the package that imports `node:` anything, which is what
 * keeps the core importable in a browser. The isomorphism guard test enforces
 * that by scanning every other source file.
 *
 * Keys map to paths under a root directory. Traversal is impossible because
 * `assertValidKey` rejects `..`, absolute keys and backslashes before a path is
 * ever built — the check is not "sanitise then hope", it is "reject then join".
 */

import { constants } from "node:fs";
import { access, appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { assertValidKey, type Storage, type StorageKey, StorageUnavailableError } from "../../ports/storage.ts";

export interface NodeStorageOptions {
	/** Directory that holds everything. Created on first write. */
	readonly root: string;
}

export class NodeStorage implements Storage {
	readonly root: string;

	constructor(options: NodeStorageOptions) {
		if (!options.root) throw new TypeError("NodeStorage: root is required");
		this.root = resolve(options.root);
	}

	#path(key: StorageKey): string {
		const valid = assertValidKey(key);
		const path = join(this.root, ...valid.split("/"));
		// Belt and braces: assertValidKey already makes escape impossible, but a
		// silent escape would be so bad that it is worth confirming.
		if (path !== this.root && !path.startsWith(this.root + sep)) {
			throw new StorageUnavailableError(`Key ${JSON.stringify(key)} resolved outside the storage root`);
		}
		return path;
	}

	async read(key: StorageKey): Promise<string | undefined> {
		try {
			return await readFile(this.#path(key), "utf8");
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw wrap(error, `reading ${key}`);
		}
	}

	async write(key: StorageKey, contents: string): Promise<void> {
		const path = this.#path(key);
		try {
			await mkdir(dirname(path), { recursive: true });
			// Always temp-then-rename. There is deliberately no option to skip this:
			// the Storage contract requires that a reader never see a partial value,
			// and an option to violate the contract is just a footgun.
			// A unique suffix so two writers cannot collide on the temp file itself.
			const temp = `${path}.${process.pid.toString(36)}${Date.now().toString(36)}${Math.random()
				.toString(36)
				.slice(2, 8)}.tmp`;
			try {
				await writeFile(temp, contents, "utf8");
				await rename(temp, path);
			} catch (error) {
				await rm(temp, { force: true }).catch(() => {});
				throw error;
			}
		} catch (error) {
			throw wrap(error, `writing ${key}`);
		}
	}

	async append(key: StorageKey, contents: string): Promise<void> {
		const path = this.#path(key);
		try {
			await mkdir(dirname(path), { recursive: true });
			await appendFile(path, contents, "utf8");
		} catch (error) {
			throw wrap(error, `appending to ${key}`);
		}
	}

	async exists(key: StorageKey): Promise<boolean> {
		// Resolve the path first: a bad key is the caller's error and must surface,
		// not be swallowed by the catch that turns a missing file into `false`.
		const path = this.#path(key);
		try {
			await access(path, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	async list(prefix: string): Promise<StorageKey[]> {
		const keys: string[] = [];

		/** Directory entries, or undefined when the directory does not exist. */
		const entriesOf = async (dir: string) => {
			try {
				return await readdir(dir, { withFileTypes: true });
			} catch (error) {
				if (isMissing(error)) return undefined;
				throw error;
			}
		};

		const walk = async (dir: string, relative: string): Promise<void> => {
			const entries = await entriesOf(dir);
			if (!entries) return;
			for (const entry of entries) {
				const key = relative ? `${relative}/${entry.name}` : entry.name;
				if (entry.isDirectory()) {
					await walk(join(dir, entry.name), key);
				} else if (entry.isFile() && !entry.name.endsWith(".tmp")) {
					// Temp files from an interrupted atomic write are not values.
					keys.push(key);
				}
			}
		};

		try {
			await walk(this.root, "");
		} catch (error) {
			throw wrap(error, `listing ${JSON.stringify(prefix)}`);
		}
		return keys.filter((key) => key.startsWith(prefix)).sort();
	}

	async remove(key: StorageKey): Promise<void> {
		try {
			await rm(this.#path(key), { force: true });
		} catch (error) {
			throw wrap(error, `removing ${key}`);
		}
	}
}

function isMissing(error: unknown): boolean {
	return (error as { code?: string })?.code === "ENOENT";
}

function wrap(error: unknown, what: string): Error {
	if (error instanceof StorageUnavailableError) return error;
	// Key-validation errors are the caller's fault and must surface unchanged.
	if ((error as Error)?.name === "InvalidKeyError") return error as Error;
	return new StorageUnavailableError(`Storage failed while ${what}: ${(error as Error)?.message ?? error}`, error);
}

export { DEFAULT_HOME_DIRNAME, HOME_ENV_VAR, openHomeStorage, portentsHome } from "./home.ts";
