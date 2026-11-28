import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { Storage } from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import { CampaignArchiveError, importCampaignArchive, exportCampaignArchive, MAX_ARCHIVE_BYTES, parseCampaignArchive, type CampaignArchiveV1 } from "./archive.ts";
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
	"campaigns/old-slug/campaign.md": "---\nslug: old-slug\nname: Old Slug\nsystem: 5e\ncounters:\n  sessions: 0\n  rolls: 0\n  draws: 0\n---\n",
	"campaigns/old-slug/journal.md": "An entry with 🧙.\n",
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
function digest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}
function canonicalForTest(value: unknown): string {
	if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonicalForTest).join(",")}]`;
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalForTest(record[key])}`).join(",")}}`;
	}
	throw new TypeError("Not JSON");
}
function replaceArchiveFile(archive: CampaignArchiveV1, path: string, contents: string): CampaignArchiveV1 {
	const files = archive.files.map((file) => file.path === path ? { ...file, contents, sha256: digest(contents) } : file);
	const payload = {
		format: archive.format,
		version: archive.version,
		campaignSlug: archive.campaignSlug,
		packVersions: archive.packVersions,
		files,
	};
	return { ...payload, sha256: digest(canonicalForTest(payload)) };
}

describe("campaign archive codec", () => {
	it("round-trips between memory and SQLite storage adapters", async () => {
		const memory = await source();
		const archive = await exportCampaignArchive(memory, "old-slug", packRefs);
		assert.ok(Buffer.byteLength(JSON.stringify(archive), "utf8") <= MAX_ARCHIVE_BYTES);
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

	it("rejects an import when another key already exists under the campaign namespace", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		const target = new MemoryStorage({ initial: {
			"campaigns/old-slug/characters/existing.md": "preserve me",
		} });
		await assert.rejects(() => importCampaignArchive(archive, target), /not empty/);
		assert.equal(await target.read("campaigns/old-slug/characters/existing.md"), "preserve me");
		assert.equal(await target.read("campaigns/old-slug/campaign.md"), undefined);
	});

	it("rejects cumulative export overflow before reading subsequent files", async () => {
		const halfLimit = "x".repeat(Math.floor(MAX_ARCHIVE_BYTES / 2));
		const memory = new MemoryStorage({ initial: {
			"campaigns/oversized/campaign.md": halfLimit,
			"campaigns/oversized/journal.md": halfLimit,
			"campaigns/oversized/world.md": "must not be read",
		} });
		const reads: string[] = [];
		const tracked: Storage = {
			read: async (key) => { reads.push(key); return memory.read(key); },
			write: (key, value) => memory.write(key, value),
			append: (key, value) => memory.append(key, value),
			exists: (key) => memory.exists(key),
			list: (prefix) => memory.list(prefix),
			remove: (key) => memory.remove(key),
		};
		await assert.rejects(
			() => exportCampaignArchive(tracked, "oversized", packRefs),
			(error) => error instanceof CampaignArchiveError && error.code === "ARCHIVE_TOO_LARGE",
		);
		assert.deepEqual(reads, ["campaigns/oversized/campaign.md", "campaigns/oversized/journal.md"]);
	});

	it("rejects ill-formed UTF-16 while preserving supplementary Unicode", async () => {
		const archive = await exportCampaignArchive(await source(), "old-slug", packRefs);
		assert.equal(archive.files.find((file) => file.path === "journal.md")!.contents, "An entry with 🧙.\n");
		const malformed = replaceArchiveFile(archive, "journal.md", "\ud800");
		assert.throws(
			() => parseCampaignArchive(malformed),
			(error) => error instanceof CampaignArchiveError && error.code === "INVALID_ARCHIVE",
		);
	});
});
