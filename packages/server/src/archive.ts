import { createHash } from "node:crypto";
import { assertCampaignResourcePath, assertValidKey, CAMPAIGN_ROOT, type ContentPack, type Storage } from "@portents/core";


export class CampaignArchiveError extends Error {
	readonly code: "INVALID_ARCHIVE" | "ARCHIVE_TOO_LARGE";

	constructor(code: "INVALID_ARCHIVE" | "ARCHIVE_TOO_LARGE", message: string) {
		super(message);
		this.code = code;
		this.name = "CampaignArchiveError";
	}
}
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export interface CampaignArchiveV1 {
	readonly format: "portents-campaign-archive";
	readonly version: 1;
	readonly campaignSlug: string;
	readonly packVersions: readonly { readonly id: string; readonly version: string }[];
	readonly files: readonly { readonly path: string; readonly contents: string; readonly sha256: string }[];
	readonly sha256: string;
}

type FileEntry = CampaignArchiveV1["files"][number];
type PackVersion = CampaignArchiveV1["packVersions"][number];
const HASH = /^sha256:[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{64}$/;

function canonicalJson(value: unknown): string {
	if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
	}
	throw new TypeError("Content must be JSON data");
}
function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function contentPackVersion(pack: ContentPack): { readonly id: string; readonly version: string } {
	return { id: pack.id, version: `sha256:${sha256(canonicalJson(pack))}` };
}

function canonicalPayload(archive: Pick<CampaignArchiveV1, "format" | "version" | "campaignSlug" | "packVersions" | "files">): string {
	return canonicalJson({
		format: archive.format,
		version: archive.version,
		campaignSlug: archive.campaignSlug,
		packVersions: [...archive.packVersions].map(({ id, version }) => ({ id, version })),
		files: [...archive.files].map(({ path, contents, sha256: checksum }) => ({ path, contents, sha256: checksum })),
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function assertSlug(value: unknown): asserts value is string {
	if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 60) throw new TypeError("Invalid campaign slug");
}
function assertPackVersions(value: unknown): asserts value is readonly PackVersion[] {
	if (!Array.isArray(value)) throw new TypeError("Invalid pack version references");
	let previous = "";
	for (const entry of value) {
		if (!isRecord(entry) || !exactKeys(entry, ["id", "version"]) || typeof entry.id !== "string" || entry.id.trim().length === 0 || entry.id.length > 255 || typeof entry.version !== "string" || !HASH.test(entry.version)) throw new TypeError("Invalid pack version reference");
		if (entry.id <= previous) throw new TypeError("Pack version references must be unique and sorted by id");
		previous = entry.id;
	}
}
function assertCampaignPath(path: unknown): asserts path is string {
	if (typeof path !== "string") throw new TypeError("Invalid campaign file path");
	try { assertValidKey(path); } catch { throw new TypeError("Invalid campaign file path"); }
	if (["campaign.md", "journal.md", "world.md", "rolls.jsonl", "piles.json"].includes(path)) return;
	if (/^characters\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(path) || /^maps\/[a-z0-9]+(?:-[a-z0-9]+)*\.txt$/.test(path)) return;
	if (path.startsWith("world/")) {
		try { assertCampaignResourcePath(path.slice("world/".length)); return; } catch { /* reject below */ }
	}
	throw new TypeError(`Unsupported campaign archive path: ${path}`);
}
function campaignSlugFromDocument(contents: string): string | undefined {
	const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!frontmatter) return undefined;
	const match = frontmatter[1]!.match(/^slug:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/m);
	return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}
function assertEntries(value: unknown): asserts value is readonly FileEntry[] {
	if (!Array.isArray(value) || value.length === 0) throw new TypeError("Archive must contain files");
	let previous = "";
	for (const entry of value) {
		if (!isRecord(entry) || !exactKeys(entry, ["path", "contents", "sha256"]) || typeof entry.path !== "string" || typeof entry.contents !== "string" || typeof entry.sha256 !== "string" || !SHA.test(entry.sha256)) throw new TypeError("Invalid archive file entry");
		assertCampaignPath(entry.path);
		if (entry.path <= previous) throw new TypeError("Archive files must be unique and sorted by path");
		previous = entry.path;
		if (sha256(entry.contents) !== entry.sha256) throw new TypeError(`Checksum mismatch for ${entry.path}`);
	}
	if (!value.some((entry) => entry.path === "campaign.md")) throw new TypeError("Archive is missing campaign.md");
}
function validateArchive(value: unknown): asserts value is CampaignArchiveV1 {
	if (!isRecord(value)) throw new TypeError("Invalid campaign archive fields");
	if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_ARCHIVE_BYTES) throw new CampaignArchiveError("ARCHIVE_TOO_LARGE", "Campaign archive exceeds size limit");
	if (!exactKeys(value, ["format", "version", "campaignSlug", "packVersions", "files", "sha256"])) throw new TypeError("Invalid campaign archive fields");
	if (value.format !== "portents-campaign-archive" || value.version !== 1) throw new TypeError("Unsupported campaign archive version");
	assertSlug(value.campaignSlug);
	assertPackVersions(value.packVersions);
	assertEntries(value.files);
	if (typeof value.sha256 !== "string" || !SHA.test(value.sha256) || sha256(canonicalPayload(value as unknown as CampaignArchiveV1)) !== value.sha256) throw new TypeError("Archive checksum mismatch");
	const declaredSlug = campaignSlugFromDocument(value.files.find((entry) => entry.path === "campaign.md")!.contents);
	if (declaredSlug !== undefined && declaredSlug !== value.campaignSlug) throw new TypeError("Campaign document slug does not match archive slug");
}
function assertArchive(value: unknown): asserts value is CampaignArchiveV1 {
	try { validateArchive(value); }
	catch (error) {
		if (error instanceof CampaignArchiveError) throw error;
		throw new CampaignArchiveError("INVALID_ARCHIVE", error instanceof Error ? error.message : "Invalid campaign archive");
	}
}

export async function exportCampaignArchive(storage: Storage, campaignSlug: string, packVersions: readonly { id: string; version: string }[]): Promise<CampaignArchiveV1> {
	assertSlug(campaignSlug);
	const refs = [...packVersions].map(({ id, version }) => ({ id, version })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	assertPackVersions(refs);
	const prefix = `${CAMPAIGN_ROOT}/${campaignSlug}/`;
	const keys = await storage.list(prefix);
	const files: FileEntry[] = [];
	for (const key of keys) {
		const path = key.slice(prefix.length);
		assertCampaignPath(path);
		const contents = await storage.read(key);
		if (contents === undefined) throw new TypeError(`Campaign file disappeared during export: ${path}`);
		files.push({ path, contents, sha256: sha256(contents) });
	}
	files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	const payload = { format: "portents-campaign-archive" as const, version: 1 as const, campaignSlug, packVersions: refs, files };
	const archive: CampaignArchiveV1 = { ...payload, sha256: sha256(canonicalPayload(payload)) };
	assertArchive(archive);
	return archive;
}
export function parseCampaignArchive(value: unknown): CampaignArchiveV1 {
	assertArchive(value);
	return value;
}
export async function importCampaignArchive(archive: CampaignArchiveV1, storage: Storage): Promise<void> {
	parseCampaignArchive(archive);
	const keys = archive.files.map(({ path }) => assertValidKey(`${CAMPAIGN_ROOT}/${archive.campaignSlug}/${path}`));
	for (const key of keys) if (await storage.exists(key)) throw new Error(`Campaign import target already exists: ${key}`);
	for (let index = 0; index < keys.length; index++) await storage.write(keys[index]!, archive.files[index]!.contents);
}
