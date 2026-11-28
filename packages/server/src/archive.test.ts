import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { MemoryStorage } from "@portents/core/memory";
import { CampaignArchiveError, importCampaignArchive, exportCampaignArchive, parseCampaignArchive, type CampaignArchiveV1 } from "./archive.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

const dirs: string[] = [];
function tempDatabase(): string {
	const dir = mkdtempSync(join(tmpdir(), "portents-archive-"));
	dirs.push(dir);
	return join(dir, "archive.sqlite");
}
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const packRefs = [{ id: "example-pack", version: `sha256:${"a".repeat(64)}` }];
const sourceFiles: Record<string, string> = {
	"campaigns/old-slug/campaign.md": "---\nslug: old-slug\nname: Example\n---\n",
	"campaigns/old-slug/journal.md": "An entry.\n",
	"campaigns/old-slug/characters/hero.md": "# Hero\n",
	"campaigns/old-slug/maps/cave.txt": "..@\n",
	"campaigns/old-slug/world/npc/guide.md": "# Guide\n",
	"campaigns/old-slug/rolls.jsonl": "{\"id\":\"r1\"}\n",
	"campaigns/old-slug/piles.json": "{}",
};
async function source(): Promise<MemoryStorage> {
	const storage = new MemoryStorage();
	for (const [key, value] of Object.entries(sourceFiles)) await storage.write(key, value);
	return storage;
}
function altered(archive: CampaignArchiveV1, patch: Record<string, unknown>): unknown {
	return { ...archive, ...patch };
}

describe("campaign archive codec", () => {
	it("round-trips between memory and SQLite storage adapters", async () => {
		const memory = await source();
		const archive = await exportCampaignArchive(memory, "old-slug", packRefs);
		const sqlite = new SqliteStorage(tempDatabase());
		try {
			await importCampaignArchive(archive, sqlite);
			const roundTrip = await exportCampaignArchive(sqlite, "old-slug", packRefs);
			assert.deepEqual(roundTrip, archive);
			const back = new MemoryStorage();
			await importCampaignArchive(roundTrip, back);
			for (const [key, value] of Object.entries(sourceFiles)) assert.equal(await back.read(key), value);
		} finally { await sqlite.close(); }
	});

	it("rejects tampered file and archive checksums", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		const tamperedFiles = archive.files.map((file) => file.path === "journal.md" ? { ...file, contents: "tampered" } : file);
		assert.throws(() => parseCampaignArchive(altered(archive, { files: tamperedFiles })), /Checksum mismatch/);
		assert.throws(() => parseCampaignArchive(altered(archive, { sha256: "0".repeat(64) })), /Archive checksum/);
	});

	it("rejects traversal paths and account-secret fields", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		const traversal = archive.files.map((file) => file.path === "journal.md" ? { ...file, path: "../secret" } : file);
		assert.throws(() => parseCampaignArchive(altered(archive, { files: traversal })), /Invalid campaign file path|Unsupported campaign archive path/);
		assert.throws(() => parseCampaignArchive({ ...archive, accountSecret: "do-not-accept" }), /fields/);
	});

	it("rejects invalid or missing pack versions and unsupported archive versions", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		assert.throws(() => parseCampaignArchive(altered(archive, { packVersions: [{ id: "example-pack", version: "1.0.0" }] })), /pack version/);
		assert.throws(() => parseCampaignArchive(altered(archive, { packVersions: [{ id: "example-pack" }] })), (error) => error instanceof CampaignArchiveError && error.code === "INVALID_ARCHIVE");
		assert.throws(() => parseCampaignArchive(({ ...archive, packVersions: undefined })), (error) => error instanceof CampaignArchiveError && error.code === "INVALID_ARCHIVE");
		assert.throws(() => parseCampaignArchive(altered(archive, { version: 2 })), (error) => error instanceof CampaignArchiveError && error.code === "INVALID_ARCHIVE");
	});

	it("refuses to overwrite an existing import target", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		const target = new MemoryStorage({ initial: { "campaigns/old-slug/journal.md": "preserve me" } });
		await assert.rejects(() => importCampaignArchive(archive, target), /already exists/);
		assert.equal(await target.read("campaigns/old-slug/journal.md"), "preserve me");
	});
});
