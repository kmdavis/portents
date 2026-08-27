import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { storageConformanceCases } from "../../testing/storage-conformance.ts";
import { MemoryStorage } from "./index.ts";

describe("MemoryStorage", () => {
	describe("storage contract", () => {
		for (const testCase of storageConformanceCases(() => new MemoryStorage())) {
			it(testCase.name, () => testCase.run());
		}
	});

	it("accepts seeded contents", async () => {
		const store = new MemoryStorage({ initial: { "a/b.md": "seeded" } });
		assert.equal(await store.read("a/b.md"), "seeded");
		assert.equal(store.size, 1);
	});

	it("validates seeded keys rather than accepting a key it would reject later", () => {
		assert.throws(() => new MemoryStorage({ initial: { "../escape.md": "x" } }), /InvalidKeyError|Invalid storage key/);
	});

	it("snapshots in sorted order", async () => {
		const store = new MemoryStorage();
		await store.write("z.md", "1");
		await store.write("a.md", "2");
		assert.deepEqual(Object.keys(store.snapshot()), ["a.md", "z.md"]);
	});

	it("clears", async () => {
		const store = new MemoryStorage({ initial: { "a.md": "x" } });
		store.clear();
		assert.equal(store.size, 0);
		assert.equal(await store.read("a.md"), undefined);
	});
});
