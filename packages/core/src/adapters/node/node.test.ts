import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { detectCaseSensitivity, storageConformanceCases } from "../../testing/storage-conformance.ts";
import { NodeStorage } from "./index.ts";

const roots: string[] = [];

function freshRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "portents-node-storage-"));
	roots.push(root);
	return root;
}

after(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const makeStore = () => new NodeStorage({ root: freshRoot() });

// Whether keys differing only in case are distinct is a property of the
// filesystem, not of the adapter: ext4 says yes, a default macOS APFS volume
// says no. Probe it rather than asserting one and failing on the other machine.
const caseSensitive = await detectCaseSensitivity(makeStore);

describe("NodeStorage", () => {
	describe(`storage contract (filesystem is ${caseSensitive ? "case-sensitive" : "case-folding"})`, () => {
		for (const testCase of storageConformanceCases(makeStore, { caseSensitive })) {
			it(testCase.name, () => testCase.run());
		}
	});

	it("requires a root", () => {
		assert.throws(() => new NodeStorage({ root: "" }), /root is required/);
	});

	it("writes real files at predictable paths", async () => {
		const root = freshRoot();
		const store = new NodeStorage({ root });
		await store.write("grimhold/journal.md", "# Journal\n");
		assert.equal(await readFile(join(root, "grimhold", "journal.md"), "utf8"), "# Journal\n");
	});

	it("leaves no temp files behind after a write", async () => {
		const root = freshRoot();
		const store = new NodeStorage({ root });
		await store.write("a.md", "one");
		await store.write("a.md", "two");
		assert.deepEqual(readdirSync(root), ["a.md"]);
	});

	it("rejects an invalid key from exists rather than answering false", async () => {
		// exists() catches errors to turn a missing file into `false`, which used to
		// swallow key-validation errors too.
		const store = new NodeStorage({ root: freshRoot() });
		await assert.rejects(() => store.exists(""), /Invalid storage key/);
		await assert.rejects(() => store.exists("../nope.md"), /Invalid storage key/);
	});

	it("does not report a stray temp file as a value", async () => {
		const root = freshRoot();
		const store = new NodeStorage({ root });
		await store.write("real.md", "v");
		// Simulate a crash between write and rename.
		writeFileSync(join(root, "real.md.abc123.tmp"), "partial");
		assert.deepEqual(await store.list(""), ["real.md"]);
	});

	it("lists nothing for a root that does not exist yet", async () => {
		const store = new NodeStorage({ root: join(freshRoot(), "not", "created") });
		assert.deepEqual(await store.list(""), []);
	});

	it("refuses to escape the root even if key validation were bypassed", async () => {
		const store = new NodeStorage({ root: freshRoot() });
		// assertValidKey catches these first; this documents the second line of defence.
		for (const key of ["../outside.md", "/etc/passwd", "a/../../b.md"]) {
			await assert.rejects(() => store.read(key), /Invalid storage key|resolved outside/);
		}
	});

	it("wraps a genuine filesystem failure in StorageUnavailableError", async () => {
		const root = freshRoot();
		const store = new NodeStorage({ root });
		// Make a directory where a value is expected, so reading it fails with EISDIR.
		await mkdir(join(root, "blocked.md"), { recursive: true });
		await assert.rejects(() => store.read("blocked.md"), /Storage failed while reading blocked\.md/);
	});

	it("survives many appends in order", async () => {
		const store = new NodeStorage({ root: freshRoot() });
		for (let i = 0; i < 200; i++) await store.append("ledger.jsonl", `{"n":${i}}\n`);
		const lines = (await store.read("ledger.jsonl"))!.trim().split("\n");
		assert.equal(lines.length, 200);
		assert.equal(JSON.parse(lines[199]).n, 199);
	});
});
