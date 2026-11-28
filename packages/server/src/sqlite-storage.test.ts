import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import Database from "better-sqlite3";
import { storageConformanceCases } from "@portents/core/testing";
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
});
