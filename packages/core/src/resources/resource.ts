/**
 * Small typed envelopes around arbitrary Markdown setting and campaign resources.
 *
 * The envelope gives retrieval stable handles without trying to model prose. A place,
 * faction, ruling, family tree, or stranger kind a third-party pack invents can all use
 * the same document. Pack records are immutable; campaign records are mutable overlays.
 */

import type { Provenance } from "../packs/attribution.ts";
import type { Frontmatter } from "../sheets/frontmatter.ts";

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
			readonly document: ResourceDocument;
	  }
	| {
			readonly origin: "campaign";
			readonly campaignSlug: string;
			readonly path: string;
			readonly immutable: false;
			readonly document: ResourceDocument;
	  };

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

/** Default visibility for a document that does not say otherwise. */
export function resourceAudience(resource: ResourceDocument): readonly ResourceAudience[] {
	return resource.audience ?? ["gm"];
}
