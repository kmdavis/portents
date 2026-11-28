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

function jsonStringByteLength(value: string): number {
	let bytes = 2;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code === 0x22 || code === 0x5c) bytes += 2;
		else if (code < 0x20) bytes += [0x08, 0x09, 0x0a, 0x0c, 0x0d].includes(code) ? 2 : 6;
		else if (code < 0x80) bytes++;
		else if (code < 0x800) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff) {
			const low = value.charCodeAt(index + 1);
			if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError("Archive text contains ill-formed UTF-16");
			bytes += 4;
			index++;
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			throw new TypeError("Archive text contains ill-formed UTF-16");
		} else bytes += 3;
	}
	return bytes;
}

function writeJsonString(hash: ReturnType<typeof createHash>, value: string): void {
	hash.update('"');
	let start = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		let escaped: string | undefined;
		if (code === 0x22) escaped = '\\"';
		else if (code === 0x5c) escaped = "\\\\";
		else if (code === 0x08) escaped = "\\b";
		else if (code === 0x09) escaped = "\\t";
		else if (code === 0x0a) escaped = "\\n";
		else if (code === 0x0c) escaped = "\\f";
		else if (code === 0x0d) escaped = "\\r";
		else if (code < 0x20) escaped = `\\u${code.toString(16).padStart(4, "0")}`;
		else if (code >= 0xd800 && code <= 0xdbff) {
			const low = value.charCodeAt(index + 1);
			if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError("Archive text contains ill-formed UTF-16");
			index++;
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			throw new TypeError("Archive text contains ill-formed UTF-16");
		}
		if (escaped !== undefined) {
			if (start < index) hash.update(value.slice(start, index), "utf8");
			hash.update(escaped);
			start = index + 1;
		} else if (index - start >= 8191) {
			hash.update(value.slice(start, index + 1), "utf8");
			start = index + 1;
		}
	}
	if (start < value.length) hash.update(value.slice(start), "utf8");
	hash.update('"');
}

function updateCanonicalJson(hash: ReturnType<typeof createHash>, value: unknown): void {
	if (typeof value === "string") {
		writeJsonString(hash, value);
		return;
	}
	if (value === null || typeof value === "boolean" || typeof value === "number") {
		hash.update(JSON.stringify(value) ?? "null");
		return;
	}
	if (Array.isArray(value)) {
		hash.update("[");
		value.forEach((item, index) => {
			if (index > 0) hash.update(",");
			updateCanonicalJson(hash, item);
		});
		hash.update("]");
		return;
	}
	if (typeof value === "object") {
		hash.update("{");
		Object.keys(value).sort().forEach((key, index) => {
			if (index > 0) hash.update(",");
			writeJsonString(hash, key);
			hash.update(":");
			updateCanonicalJson(hash, (value as Record<string, unknown>)[key]);
		});
		hash.update("}");
		return;
	}
	throw new TypeError("Content must be JSON data");
}

function canonicalSha256(value: unknown): string {
	const hash = createHash("sha256");
	updateCanonicalJson(hash, value);
	return hash.digest("hex");
}

function archiveJsonBaseBytes(campaignSlug: string, packVersions: readonly PackVersion[]): number {
	const empty = JSON.stringify({
		format: "portents-campaign-archive",
		version: 1,
		campaignSlug,
		packVersions,
		files: [],
		sha256: "0".repeat(64),
	});
	return Buffer.byteLength(empty, "utf8") - 2;
}

function fileEntryJsonBytes(path: string, contents: string, checksum: string): number {
	const empty = JSON.stringify({ path, contents: "", sha256: checksum });
	return Buffer.byteLength(empty, "utf8") - 2 + jsonStringByteLength(contents);
}

export function contentPackVersion(pack: ContentPack): { readonly id: string; readonly version: string } {
	return { id: pack.id, version: `sha256:${sha256(canonicalJson(pack))}` };
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
function assertEntries(
	value: unknown,
	campaignSlug: string,
	packVersions: readonly PackVersion[],
): asserts value is readonly FileEntry[] {
	if (!Array.isArray(value) || value.length === 0) throw new TypeError("Archive must contain files");
	let previous = "";
	let totalBytes = archiveJsonBaseBytes(campaignSlug, packVersions);
	for (const [index, entry] of value.entries()) {
		if (!isRecord(entry) || !exactKeys(entry, ["path", "contents", "sha256"]) || typeof entry.path !== "string" || typeof entry.contents !== "string" || typeof entry.sha256 !== "string" || !SHA.test(entry.sha256)) throw new TypeError("Invalid archive file entry");
		assertCampaignPath(entry.path);
		if (entry.path <= previous) throw new TypeError("Archive files must be unique and sorted by path");
		previous = entry.path;
		totalBytes += fileEntryJsonBytes(entry.path, entry.contents, entry.sha256) + (index === 0 ? 0 : 1);
		if (totalBytes > MAX_ARCHIVE_BYTES) throw new CampaignArchiveError("ARCHIVE_TOO_LARGE", "Campaign archive exceeds size limit");
		if (sha256(entry.contents) !== entry.sha256) throw new TypeError(`Checksum mismatch for ${entry.path}`);
	}
	if (!value.some((entry) => entry.path === "campaign.md")) throw new TypeError("Archive is missing campaign.md");
}
function validateArchive(value: unknown): asserts value is CampaignArchiveV1 {
	if (!isRecord(value)) throw new TypeError("Invalid campaign archive fields");
	if (!exactKeys(value, ["format", "version", "campaignSlug", "packVersions", "files", "sha256"])) throw new TypeError("Invalid campaign archive fields");
	if (value.format !== "portents-campaign-archive" || value.version !== 1) throw new TypeError("Unsupported campaign archive version");
	assertSlug(value.campaignSlug);
	assertPackVersions(value.packVersions);
	assertEntries(value.files, value.campaignSlug, value.packVersions);
	if (typeof value.sha256 !== "string" || !SHA.test(value.sha256) || canonicalSha256({
		format: value.format,
		version: value.version,
		campaignSlug: value.campaignSlug,
		packVersions: value.packVersions,
		files: value.files,
	}) !== value.sha256) throw new TypeError("Archive checksum mismatch");
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
	let totalBytes = archiveJsonBaseBytes(campaignSlug, refs);
	for (const key of keys) {
		const path = key.slice(prefix.length);
		assertCampaignPath(path);
		const contents = await storage.read(key);
		if (contents === undefined) throw new TypeError(`Campaign file disappeared during export: ${path}`);
		totalBytes += fileEntryJsonBytes(path, contents, "0".repeat(64)) + (files.length === 0 ? 0 : 1);
		if (totalBytes > MAX_ARCHIVE_BYTES) throw new CampaignArchiveError("ARCHIVE_TOO_LARGE", "Campaign archive exceeds size limit");
		files.push({ path, contents, sha256: sha256(contents) });
	}
	files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	if (!files.some((file) => file.path === "campaign.md")) throw new CampaignArchiveError("INVALID_ARCHIVE", "Campaign is missing campaign.md");
	const payload = { format: "portents-campaign-archive" as const, version: 1 as const, campaignSlug, packVersions: refs, files };
	const archive: CampaignArchiveV1 = { ...payload, sha256: canonicalSha256(payload) };
	return archive;
}
export function parseCampaignArchive(value: unknown): CampaignArchiveV1 {
	assertArchive(value);
	return value;
}
/**
 * Import into an empty campaign namespace. Call with transaction-scoped storage
 * when writes must be atomic; otherwise a failed write can leave partial files,
 * and the empty-target check is not atomic against concurrent writers.
 */
export async function importCampaignArchive(archive: CampaignArchiveV1, storage: Storage): Promise<void> {
	parseCampaignArchive(archive);
	const prefix = `${CAMPAIGN_ROOT}/${archive.campaignSlug}/`;
	const existing = await storage.list(prefix);
	if (existing.length > 0) throw new Error(`Campaign import target is not empty: ${prefix}`);
	for (const file of archive.files) {
		await storage.write(assertValidKey(`${prefix}${file.path}`), file.contents);
	}
}
