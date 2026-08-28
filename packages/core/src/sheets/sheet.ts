/**
 * Character sheets: one markdown file, machine-readable and human-readable.
 *
 * The sheet has to be both. A GM needs to read HP without guessing; a player
 * needs to read the whole character without a parser. Keeping the numbers only
 * in frontmatter makes the file terse and unfriendly; keeping them only in prose
 * makes them ambiguous to read back.
 *
 * So: **both, with the frontmatter canonical and the prose generated from it.**
 * Same shape as the map tiles — one source of truth, two projections — because
 * the alternative is two places to change HP and a sheet that eventually
 * disagrees with itself.
 *
 * ```markdown
 * ---
 * name: Brannoc Thistlewood
 * system: 5e
 * status:
 *   HP: 22/26
 *   AC: 15
 * ---
 *
 * # Brannoc Thistlewood
 *
 * ## Status
 * <!-- portent:generated status -->
 * - **HP:** 22/26
 * - **AC:** 15
 *
 * ## Equipment
 *
 * - Longbow, 20 arrows
 * ```
 *
 * Generated sections carry a marker comment, so the tools know what they own and
 * a human knows what not to hand-edit. If someone edits them anyway,
 * {@link sheetProblems} reports the disagreement rather than silently picking a
 * winner: the file is the source of truth, so a conflict in it is the user's to
 * resolve, not the library's to guess at.
 *
 * Nothing here is D&D-specific. `status` and `abilities` are whatever keys the
 * system needs — Focus Points, Stress, Bennies, Humanity — and the rest of the
 * sheet is free-form markdown.
 */

import {
	appendToSectionBody,
	sectionBody,
	sectionHeadings,
	setSectionBody,
} from "../markdown/sections.ts";
import {
	type Frontmatter,
	type MarkdownDocument,
	parseDocument,
	type Scalar,
	stringifyDocument,
} from "./frontmatter.ts";

/** Frontmatter keys that are projected into generated prose sections. */
export const GENERATED_SECTIONS = [
	{ key: "status", heading: "Status", format: "list" },
	{ key: "abilities", heading: "Ability Scores", format: "table" },
] as const;

export type GeneratedKey = (typeof GENERATED_SECTIONS)[number]["key"];

const MARKER_PREFIX = "<!-- portent:generated ";

function marker(key: string): string {
	return `${MARKER_PREFIX}${key} -->`;
}

export interface Sheet {
	readonly data: Frontmatter;
	/** Markdown after the frontmatter, generated sections included. */
	readonly body: string;
}

export class SheetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SheetError";
	}
}

// ── Sections ─────────────────────────────────────────────────────────────────
//
// Delegated to markdown/sections.ts, which campaign world notes use too.

export function listSections(sheet: Sheet): string[] {
	return sectionHeadings(sheet.body);
}

export function getSection(sheet: Sheet, heading: string): string | undefined {
	return sectionBody(sheet.body, heading);
}

/** Replace a section's body, or append the section if it is absent. */
export function setSection(sheet: Sheet, heading: string, body: string): Sheet {
	return { ...sheet, body: setSectionBody(sheet.body, heading, body) };
}

export function appendToSection(sheet: Sheet, heading: string, body: string): Sheet {
	return { ...sheet, body: appendToSectionBody(sheet.body, heading, body) };
}

/** Whether a section is one the tools generate and own. */
export function isGeneratedSection(sheet: Sheet, heading: string): boolean {
	const body = getSection(sheet, heading);
	return body !== undefined && body.startsWith(MARKER_PREFIX);
}

// ── Generated projections ────────────────────────────────────────────────────

function asMap(value: unknown): Record<string, Scalar> | undefined {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, Scalar>;
}

/** Render one frontmatter key as its prose projection. */
export function renderGeneratedSection(sheet: Sheet, key: GeneratedKey): string | undefined {
	const spec = GENERATED_SECTIONS.find((s) => s.key === key);
	if (!spec) return undefined;
	const values = asMap(sheet.data[key]);
	if (!values || Object.keys(values).length === 0) return undefined;

	const lines = [marker(key)];
	if (spec.format === "table") {
		lines.push("", `| ${spec.heading === "Ability Scores" ? "Ability" : "Key"} | Value |`, "| --- | --- |");
		for (const [name, value] of Object.entries(values)) lines.push(`| ${name} | ${value} |`);
	} else {
		lines.push("");
		for (const [name, value] of Object.entries(values)) lines.push(`- **${name}:** ${value}`);
	}
	return lines.join("\n");
}

/**
 * Regenerate every projected section from the frontmatter.
 *
 * Call after changing `status` or `abilities`. `patchStatus` and friends do it
 * for you; this is for when a caller edits `data` directly.
 */
export function syncGeneratedSections(sheet: Sheet): Sheet {
	let next = sheet;
	for (const spec of GENERATED_SECTIONS) {
		const rendered = renderGeneratedSection(next, spec.key);
		if (rendered === undefined) continue;
		next = setSection(next, spec.heading, rendered);
	}
	return next;
}

// ── Parsing and writing ──────────────────────────────────────────────────────

export function parseSheet(text: string): Sheet {
	const doc: MarkdownDocument = parseDocument(text);
	return { data: { ...doc.data }, body: doc.body };
}

export function stringifySheet(sheet: Sheet): string {
	return stringifyDocument({ data: sheet.data, body: sheet.body });
}

export interface CreateSheetInput {
	readonly name: string;
	/** Freeform: "Level 3 Wood Elf Ranger (Hunter)". */
	readonly concept?: string;
	/** Anything the caller wants in frontmatter: system, edition, player, campaign. */
	readonly meta?: Frontmatter;
	/** Volatile numbers. Projected into a `## Status` list. */
	readonly status?: Record<string, Scalar>;
	/** Projected into an `## Ability Scores` table. */
	readonly abilities?: Record<string, Scalar>;
	/** Prose sections, in order. Bodies default to `_TBD_`. */
	readonly sections?: readonly (string | { heading: string; body?: string })[];
}

/**
 * Build a sheet.
 *
 * Section names are the caller's, not the library's: a Call of Cthulhu sheet has
 * no Spell Slots and a Blades sheet has no Ability Scores.
 */
export function createSheet(input: CreateSheetInput): Sheet {
	if (!input.name.trim()) throw new SheetError("A sheet needs a name");

	const data: Frontmatter = { name: input.name };
	if (input.concept) data.concept = input.concept;
	for (const [key, value] of Object.entries(input.meta ?? {})) {
		if (key === "name" || key === "concept") continue;
		data[key] = value;
	}
	if (input.status) data.status = { ...input.status };
	if (input.abilities) data.abilities = { ...input.abilities };

	const parts = [`# ${input.name}`];
	if (input.concept) parts.push("", `_${input.concept}_`);

	let sheet: Sheet = { data, body: `${parts.join("\n")}\n` };
	sheet = syncGeneratedSections(sheet);

	for (const section of input.sections ?? []) {
		const heading = typeof section === "string" ? section : section.heading;
		const body = typeof section === "string" ? "_TBD_" : (section.body ?? "_TBD_");
		sheet = setSection(sheet, heading, body);
	}
	return sheet;
}

// ── Patching ─────────────────────────────────────────────────────────────────

/**
 * Apply `+3` / `-5` / `12` to a value like `"17/24"`, `"9"` or `9`.
 *
 * Anything non-numeric is replaced outright, so `Conditions: "poisoned"` works
 * through the same call as `HP: "-7"`.
 */
export function applyDelta(current: Scalar | undefined, next: string): Scalar {
	const relative = next.match(/^\s*([+-])\s*(\d+)\s*$/);
	if (!relative) return coerce(next);

	const step = (relative[1] === "-" ? -1 : 1) * Number.parseInt(relative[2], 10);
	if (typeof current === "number") return current + step;
	if (typeof current !== "string") return coerce(next);

	const fraction = current.match(/^\s*(-?\d+)\s*\/\s*(\d+)\s*$/);
	if (fraction) {
		const max = Number.parseInt(fraction[2], 10);
		return `${Math.min(Number.parseInt(fraction[1], 10) + step, max)}/${max}`;
	}
	const plain = current.match(/^\s*(-?\d+)\s*$/);
	if (plain) return String(Number.parseInt(plain[1], 10) + step);
	return coerce(next);
}

function coerce(value: string): Scalar {
	const trimmed = value.trim();
	if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
	return value;
}

/**
 * Change values inside a nested frontmatter map, and regenerate its prose.
 *
 * Existing keys keep their position; new keys are appended. `null` removes a key.
 * Matching is case-insensitive, so `hp` patches `HP`.
 */
export function patchMap(
	sheet: Sheet,
	key: string,
	patch: Record<string, Scalar | null>,
): Sheet {
	const current = asMap(sheet.data[key]) ?? {};
	const canonical = new Map(Object.keys(current).map((k) => [k.toLowerCase(), k]));
	const next: Record<string, Scalar> = { ...current };

	for (const [rawKey, value] of Object.entries(patch)) {
		const target = canonical.get(rawKey.toLowerCase()) ?? rawKey;
		if (value === null) {
			delete next[target];
			continue;
		}
		next[target] = typeof value === "string" ? applyDelta(current[target], value) : value;
	}

	const data = { ...sheet.data, [key]: next };
	return syncGeneratedSections({ ...sheet, data });
}

/** Patch the `status` map. The commonest edit during play. */
export function patchStatus(sheet: Sheet, patch: Record<string, Scalar | null>): Sheet {
	return patchMap(sheet, "status", patch);
}

/** Read the `status` map. */
export function status(sheet: Sheet): Record<string, Scalar> {
	return { ...(asMap(sheet.data.status) ?? {}) };
}

/** Read one status value, case-insensitively. */
export function statusValue(sheet: Sheet, key: string): Scalar | undefined {
	const values = status(sheet);
	const found = Object.keys(values).find((k) => k.toLowerCase() === key.toLowerCase());
	return found === undefined ? undefined : values[found];
}

/** Set a top-level frontmatter value. */
export function setMeta(sheet: Sheet, key: string, value: Frontmatter[string] | null): Sheet {
	const data = { ...sheet.data };
	if (value === null) delete data[key];
	else data[key] = value;
	return { ...sheet, data };
}

/** A one-line digest for a status bar or a resume brief. */
export function statusDigest(sheet: Sheet, keys?: readonly string[]): string {
	const values = status(sheet);
	const wanted = keys ?? Object.keys(values).slice(0, 4);
	return wanted
		.map((key) => {
			const value = statusValue(sheet, key);
			return value === undefined ? undefined : `${key} ${value}`;
		})
		.filter(Boolean)
		.join(" · ");
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Problems with a sheet. Empty means it is consistent.
 *
 * The important one is drift: if a generated section no longer matches the
 * frontmatter it came from, someone hand-edited the prose. That is reported
 * rather than fixed, because the file is the user's and guessing which side they
 * meant is how you lose someone's HP.
 */
export function sheetProblems(sheet: Sheet): string[] {
	const problems: string[] = [];
	if (typeof sheet.data.name !== "string" || sheet.data.name.trim() === "") {
		problems.push("frontmatter has no name");
	}

	for (const spec of GENERATED_SECTIONS) {
		const expected = renderGeneratedSection(sheet, spec.key);
		const actual = getSection(sheet, spec.heading);
		if (expected === undefined) {
			if (actual !== undefined && actual.startsWith(MARKER_PREFIX)) {
				problems.push(
					`the generated "${spec.heading}" section is present but frontmatter has no "${spec.key}"; ` +
						"remove the section or restore the frontmatter",
				);
			}
			continue;
		}
		if (actual === undefined) {
			problems.push(`frontmatter has "${spec.key}" but the "${spec.heading}" section is missing; call syncGeneratedSections`);
			continue;
		}
		if (!actual.startsWith(MARKER_PREFIX)) {
			problems.push(
				`the "${spec.heading}" section is not marked as generated, so it will be overwritten; ` +
					"rename it if it is hand-written",
			);
			continue;
		}
		if (actual.trim() !== expected.trim()) {
			problems.push(
				`the "${spec.heading}" section disagrees with frontmatter "${spec.key}". ` +
					"The frontmatter is canonical; call syncGeneratedSections to rewrite the prose, " +
					"or edit the frontmatter to match what you wrote.",
			);
		}
	}

	for (const [key, value] of Object.entries(sheet.data)) {
		if (Array.isArray(value) || value === null || typeof value !== "object") continue;
		if (Object.keys(value).length === 0) problems.push(`frontmatter "${key}" is an empty map`);
	}

	return problems;
}

/** Whether a sheet is internally consistent. */
export function isConsistent(sheet: Sheet): boolean {
	return sheetProblems(sheet).length === 0;
}
