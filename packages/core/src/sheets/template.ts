/**
 * Sheet templates: a starting scaffold for a character, shipped as content.
 *
 * There are thousands of RPG systems, so a template per system is not a plan.
 * But a sheet with 5E headings stamped onto a Call of Cthulhu character is
 * actively wrong, and it is wrong in a file the player hand-edits and keeps.
 *
 * So a template is **content, not code** — the same shape as a deck or a table,
 * living in the same packs and resolved through the same registry. A system that
 * matters to somebody gets a pack; everything else falls back to a deliberately
 * vague generic scaffold.
 *
 * ## A template is a scaffold, never a schema
 *
 * Nothing validates a sheet against its template. Frontmatter is canonical for
 * values, prose sections are freeform, and the GM can add a section mid-session
 * with the tools that already exist. That is what makes a vague fallback
 * acceptable rather than lossy: being incomplete costs nothing, and can be fixed
 * as play reveals what the sheet actually needs.
 *
 * ## Why not have the model invent one
 *
 * A model asked to produce headings for a system it half-knows will produce
 * plausible ones, confidently, and they will be written to disk and stay there.
 * "Attacks & Spellcasting" on an investigator is a small wrong thing that
 * survives for the life of the campaign. Adding sections as the fiction demands
 * them is correctable; guessing the whole shape up front is not.
 *
 * ## Matching
 *
 * On declared aliases only, never on similarity. `sheetFor("Call of Cthulhu 7e")`
 * finds a template that claims that alias, or nothing at all. Returning nothing
 * is a good answer: the caller falls back to generic and says so.
 */

/** A named section a new sheet starts with. */
export interface TemplateSection {
	readonly heading: string;
	/** Starting body. Defaults to a stub the tools treat as empty. */
	readonly body?: string;
}

export interface SheetTemplate {
	readonly id: string;
	readonly name: string;
	/**
	 * System strings this template claims, lower-cased.
	 *
	 * Matched exactly after normalisation, so a template must claim the spellings
	 * people actually type: `"5e"`, `"dnd 5e"`, `"d&d 5e (2024)"`.
	 */
	readonly aliases: readonly string[];
	/** Sections a new sheet starts with, in order. */
	readonly sections: readonly (string | TemplateSection)[];
	/**
	 * Suggested volatile keys, e.g. `HP`, `Sanity`, `Focus Points`.
	 *
	 * Names and order only, with no values: a default number is a rules claim, and
	 * this file has no business making one. The caller fills them in.
	 */
	readonly status?: readonly string[];
	/** Suggested ability labels, e.g. `STR`, or `Might`, or none at all. */
	readonly abilities?: readonly string[];
	/**
	 * True for a scaffold that is not specific to any system.
	 *
	 * Lets a caller tell the player "no template for that system, so this is the
	 * generic one" instead of implying the sheet is authoritative.
	 */
	readonly generic?: boolean;
	/** Free-text note shown when the template is used. */
	readonly note?: string;
}

/** Lower-case, collapse whitespace, drop punctuation people vary on. */
export function normaliseSystem(system: string): string {
	return system
		.toLowerCase()
		// "&" becomes "n" rather than being dropped, so the two spellings people
		// actually type collapse to the same thing: "D&D" and "dnd" both give "dnd".
		// Dropping it gave "dd", which matched neither.
		.replace(/&/g, "n")
		.replace(/\./g, "")
		.replace(/[()[\]]/g, " ")
		.replace(/[-_/]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The first template claiming this system, or `undefined`.
 *
 * Tries the whole line, then the line without its parenthetical. So a template
 * claiming `"5e"` matches `"5e (2024)"`, while one claiming `"5e 2024"` is
 * preferred if it is earlier in the list. Never falls back to a generic template
 * implicitly: a caller that wants that asks for it, so the fallback is a visible
 * decision rather than a silent one.
 */
export function matchSheet(
	templates: readonly SheetTemplate[],
	system: string,
): SheetTemplate | undefined {
	return matchBySystemAlias(
		templates.filter((template) => !template.generic),
		system,
	);
}

/**
 * Alias matching for anything keyed by system and printing.
 *
 * Extracted from {@link matchSheet} when guidance needed the same rule. Sharing it
 * matters: a sheet scaffold and the GM guidance for the same system must agree on
 * what "5e (2024)" means, and two copies of this logic would eventually disagree.
 *
 * Alias-only, never similarity. A system nobody claimed gets nothing back rather
 * than a guess.
 */
export function matchBySystemAlias<T extends { readonly aliases: readonly string[] }>(
	candidates: readonly T[],
	system: string,
): T | undefined {
	const full = normaliseSystem(system);
	if (!full) return undefined;
	// "5e 2024" -> also try "5e", so a system-level entry catches a printing nobody
	// wrote one for.
	const tries = [full];
	const withoutTail = full.split(" ").slice(0, -1).join(" ");
	if (withoutTail) tries.push(withoutTail);

	for (const attempt of tries) {
		for (const candidate of candidates) {
			if (candidate.aliases.some((alias) => normaliseSystem(alias) === attempt)) return candidate;
		}
	}
	return undefined;
}

/** The generic scaffold from a set of templates, if one is marked. */
export function genericSheet(templates: readonly SheetTemplate[]): SheetTemplate | undefined {
	return templates.find((template) => template.generic);
}

/** Problems with a template. Empty means it is usable. */
export function templateProblems(template: SheetTemplate): string[] {
	const problems: string[] = [];
	if (!template.id.trim()) problems.push("a template needs an id");
	if (template.sections.length === 0) problems.push(`template "${template.id}" has no sections`);
	if (!template.generic && template.aliases.length === 0) {
		problems.push(`template "${template.id}" claims no systems, so nothing will ever match it`);
	}
	if (template.generic && template.aliases.length > 0) {
		problems.push(`template "${template.id}" is generic but also claims systems; it can only be one`);
	}

	const headings = template.sections.map((section) => (typeof section === "string" ? section : section.heading));
	for (const reserved of ["Status", "Ability Scores"]) {
		if (headings.some((heading) => heading.toLowerCase() === reserved.toLowerCase())) {
			problems.push(
				`template "${template.id}" declares a "${reserved}" section, but that one is generated from ` +
					"frontmatter and would be overwritten",
			);
		}
	}
	const seen = new Set<string>();
	for (const heading of headings) {
		const key = heading.toLowerCase();
		if (seen.has(key)) problems.push(`template "${template.id}" repeats the section "${heading}"`);
		seen.add(key);
	}
	return problems;
}
