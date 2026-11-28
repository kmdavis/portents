import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import Database from "better-sqlite3";
import type { Storage } from "@portents/core";
import type { LocalCredentialRepository } from "@portents/identity";
import { storageConformanceCases, transactionalStorageConformanceCases } from "@portents/core/testing";
import { SqliteStorage } from "./sqlite-storage.ts";

const directories: string[] = [];
const conformanceStores: SqliteStorage[] = [];
function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "portents-sqlite-"));
	directories.push(directory);
	return directory;
}
after(async () => {
	await Promise.all(conformanceStores.map((store) => store.close()));
	for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("SqliteStorage storage contract", () => {
	const cases = storageConformanceCases(() => {
		const store = new SqliteStorage(":memory:");
		conformanceStores.push(store);
		return store;
	}, { caseSensitive: true });
	for (const testCase of cases) it(testCase.name, testCase.run);
});

describe("SqliteStorage transactional contract", () => {
	for (const [name, factory] of [
		["memory", () => new SqliteStorage(":memory:")],
		["file", () => new SqliteStorage(join(temporaryDirectory(), "transactional.sqlite"))],
	] as const) {
		const cases = transactionalStorageConformanceCases(() => {
			const store = factory();
			conformanceStores.push(store);
			return store;
		});
		for (const testCase of cases) it(`${name}: ${testCase.name}`, testCase.run);
	}
});

describe("SqliteStorage", () => {
	it("implements atomic text storage with literal prefixes and binary ordering", async () => {
		const store = new SqliteStorage(":memory:");
		await store.write("b/key", "hello 🌍");
		await store.append("b/key", "!");
		await store.write("a", "");
		await store.write("ab", "prefix");
		assert.equal(await store.read("b/key"), "hello 🌍!");
		assert.equal(await store.read("missing"), undefined);
		assert.equal(await store.exists("a"), true);
		assert.deepEqual(await store.list(""), ["a", "ab", "b/key"]);
		assert.deepEqual(await store.list("a"), ["a", "ab"]);
		await store.remove("a");
		await store.remove("a");
		assert.equal(await store.exists("a"), false);
		await store.close();
	});

	it("awaits transaction operations and rolls back asynchronous failures", async () => {
		const store = new SqliteStorage(":memory:");
		await store.transaction(async (transaction) => {
			await transaction.write("one", "first");
			await transaction.append("one", " second");
			assert.equal(await transaction.read("one"), "first second");
			await transaction.write("two", "also committed");
		});
		assert.equal(await store.read("two"), "also committed");
		await assert.rejects(store.transaction(async (transaction) => {
			await transaction.write("one", "uncommitted");
			await transaction.write("three", "uncommitted");
			throw new Error("abort");
		}), /abort/);
		assert.equal(await store.read("one"), "first second");
		assert.equal(await store.read("three"), undefined);
		await store.close();
	});

	it("serializes outside operations behind an async transaction", async () => {
		const store = new SqliteStorage(":memory:");
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const transaction = store.transaction(async (view) => {
			await view.write("state", "inside");
			await gate;
			assert.equal(await view.read("state"), "inside");
		});
		const outsideWrite = store.write("state", "outside");
		release();
		await Promise.all([transaction, outsideWrite]);
		assert.equal(await store.read("state"), "outside");
		await store.close();
	});

	it("enforces owner-scoped credential deletion and backs up durable data", async () => {
		const directory = temporaryDirectory();
		const sourcePath = join(directory, "source.sqlite");
		const backupPath = join(directory, "backup.sqlite");
		const store = new SqliteStorage(sourcePath);
		await store.write("campaign/a", "saved");
		const record = { id: "credential-1", principalId: "owner-1", digest: "digest-only" };
		await store.insert(record);
		assert.deepEqual(await store.findByDigest(record.digest), record);
		await assert.rejects(store.insert(record));
		assert.equal(await store.deleteById("other-owner", record.id), false);
		assert.deepEqual(await store.findByDigest(record.digest), record);
		assert.equal(await store.deleteById(record.principalId, record.id), true);
		assert.equal(await store.findByDigest(record.digest), null);
		await store.insert(record);
		await store.backup(backupPath);
		const copy = new SqliteStorage(new Database(backupPath));
		assert.equal(await copy.read("campaign/a"), "saved");
		assert.deepEqual(await copy.findByDigest(record.digest), record);
		await copy.close();
		await store.close();
	});
	it("appends ordered chunks, replaces/removes all chunks, rolls back, and backs up", async () => {
		const directory = temporaryDirectory();
		const store = new SqliteStorage(join(directory, "chunks.sqlite"));
		const first = "a".repeat(64 * 1024 + 3);
		await store.write("ledger", first);
		await store.append("ledger", "b".repeat(64 * 1024 + 5));
		await store.append("ledger", "tail");
		assert.equal(await store.read("ledger"), first + "b".repeat(64 * 1024 + 5) + "tail");
		assert.deepEqual(await store.list("ledger"), ["ledger"]);
		await assert.rejects(store.transaction(async (transaction) => {
			await transaction.append("ledger", "rolled-back");
			throw new Error("rollback chunks");
		}), /rollback chunks/);
		assert.equal((await store.read("ledger"))?.endsWith("tail"), true);
		await store.write("ledger", "replacement");
		assert.equal(await store.read("ledger"), "replacement");
		await store.append("ledger", "!");
		const backup = join(directory, "chunks-backup.sqlite");
		await store.backup(backup);
		const copy = new SqliteStorage(backup);
		assert.equal(await copy.read("ledger"), "replacement!");
		await store.remove("ledger");
		assert.deepEqual(await store.list("ledger"), []);
		await copy.close();
		await store.close();
	});

	it("preserves supplementary Unicode across 64 KiB chunk boundaries", async () => {
		const store = new SqliteStorage(join(temporaryDirectory(), "unicode.sqlite"));
		const value = "a".repeat(64 * 1024 - 1) + "😀" + "b";
		try {
			await store.write("write", value);
			assert.equal(await store.read("write"), value);
			await store.append("append", value);
			await store.append("append", value);
			assert.equal(await store.read("append"), value + value);
		} finally {
			await store.close();
		}
	});

	it("expires committed and rolled-back views, including across a later transaction", async () => {
		const store = new SqliteStorage(":memory:");
		let committed!: Storage;
		await store.transaction(async (transaction) => {
			committed = transaction;
			await transaction.write("state", "committed");
		});
		await store.transaction(async (transaction) => {
			await transaction.write("state", "later");
			await assert.rejects(committed.write("state", "escaped"));
			assert.equal(await transaction.read("state"), "later");
		});
		assert.equal(await store.read("state"), "later");
		let rolledBack!: Storage;
		await assert.rejects(store.transaction(async (transaction) => {
			rolledBack = transaction;
			await transaction.write("state", "rolled back");
			throw new Error("abort");
		}), /abort/);
		await store.transaction(async (transaction) => {
			await transaction.write("state", "final");
			await assert.rejects(rolledBack.append("state", " escaped"));
			assert.equal(await transaction.read("state"), "final");
		});
		assert.equal(await store.read("state"), "final");
		await store.close();
	});

	it("coordinates symlink aliases and rejects initialization during active same-path work", async () => {
		if (process.platform === "win32") return;
		const directory = temporaryDirectory();
		const path = join(directory, "shared.sqlite");
		const alias = join(directory, "shared-alias.sqlite");
		const first = new SqliteStorage(path);
		symlinkSync(path, alias);
		const second = new SqliteStorage(alias);
		let release!: () => void;
		let entered!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const started = new Promise<void>((resolve) => { entered = resolve; });
		const transaction = first.transaction(async (view) => {
			await view.write("shared", "inside");
			entered();
			await gate;
		});
		await started;
		assert.throws(() => new SqliteStorage(alias), /operations on the same database are queued or active/);
		const queued = second.write("shared", "outside");
		release();
		await Promise.all([transaction, queued]);
		assert.equal(await first.read("shared"), "outside");
		await Promise.all([first.close(), second.close()]);
	});

	it("commits credential records with storage and expires the credential view", async () => {
		const store = new SqliteStorage(":memory:");
		let escaped!: LocalCredentialRepository;
		await store.transaction(async (transaction) => {
			const credentials = store.credentialsFor(transaction);
			escaped = credentials;
			await transaction.write("install", "ready");
			await credentials.insert({ id: "id", principalId: "owner", digest: "digest" });
		});
		assert.deepEqual(await store.findByDigest("digest"), { id: "id", principalId: "owner", digest: "digest" });
		await store.transaction(async (transaction) => {
			await transaction.write("install", "later");
			await assert.rejects(escaped.insert({ id: "late", principalId: "owner", digest: "late" }));
		});
		assert.equal(await store.findByDigest("late"), null);
		let failed!: LocalCredentialRepository;
		await assert.rejects(store.transaction(async (transaction) => {
			failed = store.credentialsFor(transaction);
			await failed.insert({ id: "rolled-back", principalId: "owner", digest: "rolled-back" });
			throw new Error("credential rollback");
		}), /credential rollback/);
		await store.transaction(async (transaction) => {
			await transaction.write("install", "final");
			await assert.rejects(failed.insert({ id: "late-failed", principalId: "owner", digest: "late-failed" }));
		});
		assert.equal(await store.findByDigest("rolled-back"), null);
		assert.equal(await store.findByDigest("late-failed"), null);
		await store.close();
	});
});
