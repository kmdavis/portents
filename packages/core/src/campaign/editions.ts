/**
 * Which rules, and which printing of them, as one freeform line.
 *
 * ```yaml
 * system: 5e (2024)
 * system: pf2e (remaster)
 * system: Call of Cthulhu 7e
 * system: generic
 * ```
 *
 * One line rather than two keys, because a system and its printing are one fact
 * about a table, and splitting them made the frontmatter read like a form.
 *
 * ## Freeform, with the safety kept where it matters
 *
 * The system is **any string**. Nothing else in this library assumes d20: sheets
 * take whatever keys a system needs, and refusing to record a campaign of
 * something unusual would contradict that.
 *
 * But two systems in wide use have had a revision that changed character
 * creation, and a GM that guesses wrong hands the player rules they never agreed
 * to. So for a **known** system the printing is validated: `5e (2025)` is a typo
 * and says so, and `5e (remaster)` names another game's printing and says that.
 * For anything else the parenthetical is recorded verbatim and not second-guessed.
 *
 * **The newer printing is always the default.** Someone who wants the older one
 * knows they want it.
 *
 * No trademarked names appear here. `5e` and `pf2e` are the identifiers people
 * search for, and the labels describe printings rather than claiming affiliation.
 */

export type RulesSystem = string;
export type Edition = string;

interface KnownSystem {
	readonly id: string;
	readonly label: string;
	/** Newest first. The head of this list is the default. */
	readonly editions: readonly string[];
	readonly notes: Readonly<Record<string, string>>;
}

/**
 * Systems this library knows enough about to check a printing against.
 *
 * Being absent from this list is not an error, it just means no defaulting and
 * no validation.
 */
export const KNOWN_SYSTEMS: readonly KnownSystem[] = [
	{
		id: "5e",
		label: "Fifth-edition d20 fantasy",
		editions: ["2024", "2014"],
		notes: {
			"2024": "the current core rules, with revised species, backgrounds and weapon mastery",
			"2014": "the original printing, with the older race and background rules",
		},
	},
	{
		id: "pf2e",
		label: "Second-edition d20 fantasy (tight-math variant)",
		editions: ["remaster", "legacy"],
		notes: {
			remaster: "the current core rules, with revised ancestries and reworked spell schools",
			legacy: "the original printing, before the terminology and spell rework",
		},
	},
	{ id: "generic", label: "Generic d20 fantasy", editions: [], notes: {} },
];

const BY_ID = new Map<string, KnownSystem>(KNOWN_SYSTEMS.map((system) => [system.id.toLowerCase(), system]));

export class SystemError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SystemError";
	}
}

export function knownSystem(system: string): boolean {
	return BY_ID.has(system.trim().toLowerCase());
}

export function editionsFor(system: string): readonly string[] {
	return BY_ID.get(system.trim().toLowerCase())?.editions ?? [];
}

/** The newest printing, or `undefined` for an unknown system or one with a single printing. */
export function defaultEdition(system: string): string | undefined {
	return editionsFor(system)[0];
}

export function isEditionOf(system: string, edition: string): boolean {
	return editionsFor(system).some((known) => known.toLowerCase() === edition.trim().toLowerCase());
}

export interface ParsedSystem {
	readonly system: string;
	readonly edition?: string;
}

/** `5e (2024)` into its parts. A line with no parenthetical has no edition. */
export function parseSystem(line: string): ParsedSystem {
	const text = line.trim();
	if (!text) throw new SystemError("A campaign needs a system");
	const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
	if (!match) return { system: text };
	const system = match[1].trim();
	const edition = match[2].trim();
	if (!system) throw new SystemError(`Cannot read a system from ${JSON.stringify(line)}`);
	return edition ? { system, edition } : { system };
}

export function formatSystem(system: string, edition?: string): string {
	const trimmed = system.trim();
	return edition?.trim() ? `${trimmed} (${edition.trim()})` : trimmed;
}

/**
 * Settle on a printing, refusing one that a known system does not have.
 *
 * A silent fallback would be worse than an error: the player would be handed the
 * wrong character creation rules with no way to notice.
 */
export function resolveEdition(system: string, requested?: string): string | undefined {
	const wanted = requested?.trim();
	if (!knownSystem(system)) return wanted || undefined;
	if (!wanted) return defaultEdition(system);

	const available = editionsFor(system);
	if (available.length === 0) {
		throw new SystemError(
			`System ${JSON.stringify(system)} has no printings, so ${JSON.stringify(wanted)} does not apply`,
		);
	}
	const matched = available.find((known) => known.toLowerCase() === wanted.toLowerCase());
	if (!matched) {
		const elsewhere = KNOWN_SYSTEMS.find((candidate) =>
			candidate.editions.some((edition) => edition.toLowerCase() === wanted.toLowerCase()),
		);
		throw new SystemError(
			elsewhere
				? `${JSON.stringify(wanted)} is a printing of ${JSON.stringify(elsewhere.id)}, not ${JSON.stringify(system)}. Use one of: ${available.join(", ")}`
				: `Unknown printing ${JSON.stringify(wanted)} for ${JSON.stringify(system)}. Use one of: ${available.join(", ")}`,
		);
	}
	return matched;
}

/**
 * Parse a freeform line and settle its printing in one step.
 *
 * `extraEdition` is for callers that pass the two separately. Supplying both a
 * parenthetical and a conflicting edition is an error rather than a quiet
 * preference for one of them.
 */
export function resolveSystemLine(line: string, extraEdition?: string): Required<ParsedSystem> | ParsedSystem {
	const parsed = parseSystem(line);
	const extra = extraEdition?.trim();
	if (parsed.edition && extra && parsed.edition.toLowerCase() !== extra.toLowerCase()) {
		throw new SystemError(
			`${JSON.stringify(line)} says ${JSON.stringify(parsed.edition)} but the edition given was ${JSON.stringify(extra)}; pick one`,
		);
	}
	const edition = resolveEdition(parsed.system, parsed.edition ?? extra);
	return edition ? { system: parsed.system, edition } : { system: parsed.system };
}

export function editionNote(system: string, edition: string): string | undefined {
	return BY_ID.get(system.trim().toLowerCase())?.notes[edition.trim()];
}

export function systemLabel(system: string, edition?: string): string {
	const base = BY_ID.get(system.trim().toLowerCase())?.label ?? system.trim();
	return edition ? `${base}, ${edition}` : base;
}

/** A line for a campaign overview or a resume brief. */
export function describeRules(system: string, edition?: string): string {
	const label = systemLabel(system, edition);
	const note = edition ? editionNote(system, edition) : undefined;
	return note ? `${label} — ${note}` : label;
}
