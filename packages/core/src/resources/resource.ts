/**
 * Small typed envelopes around arbitrary Markdown setting and campaign resources.
 *
 * The envelope gives retrieval stable handles without trying to model prose. A place,
 * faction, ruling, family tree, or stranger kind a third-party pack invents can all use
 * the same document. Pack records are immutable; campaign records are mutable overlays.
 */

import type { Provenance } from "../packs/attribution.ts";
import {
	type Frontmatter,
	type FrontmatterValue,
	parseDocument,
	stringifyDocument,
} from "../sheets/frontmatter.ts";

export const RESOURCE_SCHEMA_VERSION = 1 as const;
export const MAX_RESOURCE_CHARACTERS = 200_000;

/** Common folders, not an exhaustive ontology. Other lowercase kinds are allowed. */
export const COMMON_RESOURCE_KINDS = ["npc", "place", "faction", "thread", "ruling", "note"] as const;

/** Safe by default. A missing audience means the GM only. */
export type ResourceAudience = "all" | "gm" | `participant/${string}`;

export interface ResourceDocument {
	readonly schemaVersion: typeof RESOURCE_SCHEMA_VERSION;
	/** Stable, namespaced identity such as `portents/greywater/npc/nesta`. */
	readonly id: string;
	/** Packaged setting this belongs to. Campaign-only notes may omit it. */
	readonly settingId?: string;
	/** Lowercase storage-safe folder name. Open to third-party kinds. */
	readonly kind: string;
	readonly name: string;
	readonly aliases?: readonly string[];
	readonly tags?: readonly string[];
	/** Stable resource IDs. Relations stay in prose until the domain needs more. */
	readonly links?: readonly string[];
	readonly audience?: readonly ResourceAudience[];
	/** A campaign development that updates, but never edits, packaged canon. */
	readonly supersedes?: string;
	readonly provenance?: Provenance;
	/** Unknown additive frontmatter, preserved on a parse/write round trip. */
	readonly metadata?: Frontmatter;
	readonly body: string;
}

export interface SettingManifest {
	readonly schemaVersion: typeof RESOURCE_SCHEMA_VERSION;
	readonly id: string;
	readonly name: string;
	readonly summary: string;
	readonly aliases?: readonly string[];
	/** System aliases this setting is known to work with. Empty means system-neutral. */
	readonly systems?: readonly string[];
	readonly provenance?: Provenance;
}

/** Where a loaded document came from, and therefore whether it can be changed. */
export type ResourceRecord =
	| {
			readonly origin: "pack";
			readonly packId: string;
			readonly immutable: true;
			readonly resource: ResourceDocument;
	  }
	| {
			readonly origin: "campaign";
			readonly campaignSlug: string;
			readonly path: string;
			readonly immutable: false;
			readonly resource: ResourceDocument;
	  };

export type CampaignResourceRecord = Extract<ResourceRecord, { readonly origin: "campaign" }>;
export type PackResourceRecord = Extract<ResourceRecord, { readonly origin: "pack" }>;

export class ResourceContractError extends Error {
	readonly problems: readonly string[];
	constructor(where: string, problems: readonly string[]) {
		super(`${where}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
		this.name = "ResourceContractError";
		this.problems = problems;
	}
}

const ID_SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_METADATA = new Set([
	"schemaVersion",
	"id",
	"settingId",
	"kind",
	"name",
	"aliases",
	"tags",
	"links",
	"audience",
	"supersedes",
	"provenance",
	"body",
]);

/** IDs have at least a namespace and local name. */
export function isNamespacedId(value: string): boolean {
	const segments = value.split("/");
	return segments.length >= 2 && segments.every((segment) => ID_SEGMENT.test(segment));
}

/** One valid campaign resource folder or filename segment. */
export function isResourceSegment(value: string): boolean {
	return KIND.test(value);
}

function duplicateValues(values: readonly string[] | undefined): string[] {
	if (!values) return [];
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates].sort();
}

function textListProblems(label: string, values: readonly string[] | undefined): string[] {
	if (!values) return [];
	const problems: string[] = [];
	for (const value of values) {
		if (!value.trim()) problems.push(`${label} contains an empty value`);
	}
	const duplicates = duplicateValues(values);
	if (duplicates.length > 0) problems.push(`${label} contains duplicates: ${duplicates.join(", ")}`);
	return problems;
}

export function settingProblems(setting: SettingManifest): string[] {
	const problems: string[] = [];
	if (setting.schemaVersion !== RESOURCE_SCHEMA_VERSION) {
		problems.push(`schemaVersion must be ${RESOURCE_SCHEMA_VERSION}, got ${String(setting.schemaVersion)}`);
	}
	if (!isNamespacedId(setting.id)) problems.push(`id must be a lowercase namespaced id, got ${JSON.stringify(setting.id)}`);
	if (!setting.name.trim()) problems.push("name must not be empty");
	if (!setting.summary.trim()) problems.push("summary must not be empty");
	problems.push(...textListProblems("aliases", setting.aliases));
	problems.push(...textListProblems("systems", setting.systems));
	return problems;
}

export function resourceProblems(resource: ResourceDocument): string[] {
	const problems: string[] = [];
	if (resource.schemaVersion !== RESOURCE_SCHEMA_VERSION) {
		problems.push(`schemaVersion must be ${RESOURCE_SCHEMA_VERSION}, got ${String(resource.schemaVersion)}`);
	}
	if (!isNamespacedId(resource.id)) problems.push(`id must be a lowercase namespaced id, got ${JSON.stringify(resource.id)}`);
	if (resource.settingId) {
		if (!isNamespacedId(resource.settingId)) {
			problems.push(`settingId must be a lowercase namespaced id, got ${JSON.stringify(resource.settingId)}`);
		} else if (!resource.id.startsWith(`${resource.settingId}/`)) {
			problems.push(`packaged resource id must start with settingId plus "/": ${resource.settingId}/`);
		}
	}
	if (!isResourceSegment(resource.kind)) {
		problems.push(`kind must be a lowercase storage-safe segment, got ${JSON.stringify(resource.kind)}`);
	}
	if (!resource.name.trim()) problems.push("name must not be empty");
	if (resource.body.length > MAX_RESOURCE_CHARACTERS) {
		problems.push(`body exceeds ${MAX_RESOURCE_CHARACTERS} characters; split it into smaller topics`);
	}
	problems.push(...textListProblems("aliases", resource.aliases));
	problems.push(...textListProblems("tags", resource.tags));
	problems.push(...textListProblems("links", resource.links));
	problems.push(...textListProblems("audience", resource.audience));
	for (const link of resource.links ?? []) {
		if (!isNamespacedId(link)) problems.push(`link must be a namespaced resource id, got ${JSON.stringify(link)}`);
	}
	for (const audience of resource.audience ?? []) {
		if (audience !== "all" && audience !== "gm" && !/^participant\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(audience)) {
			problems.push(`invalid audience ${JSON.stringify(audience)}`);
		}
	}
	if ((resource.audience ?? []).includes("all") && (resource.audience?.length ?? 0) > 1) {
		problems.push('audience "all" cannot be combined with narrower audiences');
	}
	if (resource.supersedes && !isNamespacedId(resource.supersedes)) {
		problems.push(`supersedes must be a namespaced resource id, got ${JSON.stringify(resource.supersedes)}`);
	}
	for (const key of Object.keys(resource.metadata ?? {})) {
		if (RESERVED_METADATA.has(key)) problems.push(`metadata must not repeat reserved key ${JSON.stringify(key)}`);
	}
	return [...new Set(problems)];
}

export function assertSetting(setting: SettingManifest): SettingManifest {
	const problems = settingProblems(setting);
	if (problems.length > 0) throw new ResourceContractError(`Invalid setting ${JSON.stringify(setting.id)}`, problems);
	return setting;
}

export function assertResource(resource: ResourceDocument): ResourceDocument {
	const problems = resourceProblems(resource);
	if (problems.length > 0) throw new ResourceContractError(`Invalid resource ${JSON.stringify(resource.id)}`, problems);
	return resource;
}

const ENVELOPE_KEYS = [
	"schemaVersion",
	"id",
	"settingId",
	"kind",
	"name",
	"aliases",
	"tags",
	"links",
	"audience",
	"supersedes",
] as const;

function parsedString(data: Frontmatter, key: string): string | undefined {
	const value = data[key];
	return typeof value === "string" ? value : undefined;
}

function parsedStrings(data: Frontmatter, key: string): string[] | undefined {
	const value = data[key];
	if (value === undefined) return undefined;
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return [value];
	return [String(value)];
}

/** Parse one campaign or source-package Markdown resource. */
export function parseResourceDocument(markdown: string): ResourceDocument {
	if (markdown.length > MAX_RESOURCE_CHARACTERS) {
		throw new ResourceContractError("Invalid resource file", [
			`file exceeds ${MAX_RESOURCE_CHARACTERS} characters; split it into smaller topics`,
		]);
	}
	const parsed = parseDocument(markdown);
	const metadata: Frontmatter = {};
	for (const [key, value] of Object.entries(parsed.data)) {
		if (!(ENVELOPE_KEYS as readonly string[]).includes(key)) metadata[key] = value;
	}
	const version = parsed.data.schemaVersion;
	const settingId = parsedString(parsed.data, "settingId");
	const aliases = parsedStrings(parsed.data, "aliases");
	const tags = parsedStrings(parsed.data, "tags");
	const links = parsedStrings(parsed.data, "links");
	const audience = parsedStrings(parsed.data, "audience") as ResourceAudience[] | undefined;
	const supersedes = parsedString(parsed.data, "supersedes");
	const resource: ResourceDocument = {
		schemaVersion: (typeof version === "number" ? version : Number.NaN) as 1,
		id: parsedString(parsed.data, "id") ?? "",
		...(settingId ? { settingId } : {}),
		kind: parsedString(parsed.data, "kind") ?? "",
		name: parsedString(parsed.data, "name") ?? "",
		...(aliases ? { aliases } : {}),
		...(tags ? { tags } : {}),
		...(links ? { links } : {}),
		...(audience ? { audience } : {}),
		...(supersedes ? { supersedes } : {}),
		...(Object.keys(metadata).length > 0 ? { metadata } : {}),
		body: parsed.body,
	};
	return assertResource(resource);
}

/** Stringify without losing additive metadata a newer writer may understand. */
export function stringifyResourceDocument(resource: ResourceDocument): string {
	assertResource(resource);
	const data: Frontmatter = { ...(resource.metadata ?? {}) };
	const set = (key: string, value: FrontmatterValue | undefined) => {
		if (value !== undefined) data[key] = value;
	};
	set("schemaVersion", resource.schemaVersion);
	set("id", resource.id);
	set("settingId", resource.settingId);
	set("kind", resource.kind);
	set("name", resource.name);
	set("aliases", resource.aliases ? [...resource.aliases] : undefined);
	set("tags", resource.tags ? [...resource.tags] : undefined);
	set("links", resource.links ? [...resource.links] : undefined);
	set("audience", resource.audience ? [...resource.audience] : undefined);
	set("supersedes", resource.supersedes);
	return stringifyDocument({ data, body: resource.body });
}

export interface ResourceQuery {
	readonly text?: string;
	readonly kind?: string;
	readonly settingId?: string;
	readonly audience?: ResourceAudience;
	readonly limit?: number;
}

function normalized(value: string): string {
	return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resourceVisibleTo(resource: ResourceDocument, viewer: ResourceAudience): boolean {
	if (viewer === "gm") return true;
	const audiences = resourceAudience(resource);
	return audiences.includes("all") || audiences.includes(viewer);
}

function matchRank(resource: ResourceDocument, text: string): number | undefined {
	if (!text) return 5;
	const query = normalized(text);
	const terms = query.split(/\s+/).filter(Boolean);
	const fields: Array<[number, string]> = [
		[0, resource.name],
		...[...(resource.aliases ?? [])].map((value): [number, string] => [1, value]),
		[2, resource.id],
		...[...(resource.tags ?? [])].map((value): [number, string] => [3, value]),
		...[...(resource.links ?? [])].map((value): [number, string] => [4, value]),
		[5, resource.body],
	];
	const haystack = normalized(fields.map(([, value]) => value).join("\n"));
	if (!terms.every((term) => haystack.includes(term))) return undefined;
	if (normalized(resource.name) === query) return 0;
	if ((resource.aliases ?? []).some((alias) => normalized(alias) === query)) return 1;
	return fields.find(([rank, value]) => terms.every((term) => normalized(value).includes(term)))?.[0] ?? 5;
}

/** Deterministic local lookup. No embeddings, summaries, or hidden index. */
export function queryResourceRecords(records: readonly ResourceRecord[], query: ResourceQuery = {}): ResourceRecord[] {
	const ranked: Array<{ record: ResourceRecord; rank: number }> = [];
	for (const record of records) {
		const resource = record.resource;
		if (query.kind && resource.kind !== query.kind) continue;
		if (query.settingId && resource.settingId !== query.settingId) continue;
		if (query.audience && !resourceVisibleTo(resource, query.audience)) continue;
		const rank = matchRank(resource, query.text?.trim() ?? "");
		if (rank !== undefined) ranked.push({ record, rank });
	}
	ranked.sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (a.record.origin !== b.record.origin) return a.record.origin === "campaign" ? -1 : 1;
		if (a.record.resource.id < b.record.resource.id) return -1;
		if (a.record.resource.id > b.record.resource.id) return 1;
		return 0;
	});
	const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
	return ranked.slice(0, limit).map(({ record }) => record);
}

export function formatResourceList(records: readonly ResourceRecord[]): string {
	if (records.length === 0) return "No matching setting or campaign resources.";
	return [
		"Resources:",
		...records.map((record) => {
			const origin = record.origin === "pack" ? `pack:${record.packId}` : `campaign:${record.path}`;
			return `- \`${record.resource.id}\` — **${record.resource.name}** (${record.resource.kind}, ${origin})`;
		}),
		"",
		"Read one by passing its exact `id`.",
	].join("\n");
}

/** A compact exact-read result for model tools and people. */
export function formatResourceRecord(record: ResourceRecord): string {
	const resource = record.resource;
	const origin = record.origin === "pack" ? `pack ${record.packId}` : `campaign file ${record.path}`;
	const lines = [
		`# ${resource.name}`,
		"",
		`- **ID:** \`${resource.id}\``,
		`- **Kind:** ${resource.kind}`,
		`- **Origin:** ${origin}`,
	];
	if (resource.aliases?.length) lines.push(`- **Aliases:** ${resource.aliases.join(", ")}`);
	if (resource.tags?.length) lines.push(`- **Tags:** ${resource.tags.join(", ")}`);
	if (resource.links?.length) lines.push(`- **Links:** ${resource.links.map((id) => `\`${id}\``).join(", ")}`);
	if (resource.supersedes) lines.push(`- **Updates:** \`${resource.supersedes}\``);
	lines.push("", resource.body || "_No prose recorded._");
	return `${lines.join("\n")}\n`;
}

/** Default visibility for a document that does not say otherwise. */
export function resourceAudience(resource: ResourceDocument): readonly ResourceAudience[] {
	return resource.audience ?? ["gm"];
}
