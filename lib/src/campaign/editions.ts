/**
 * Which rules, and which printing of them.
 *
 * The printing matters more than it looks. Two books share a name and disagree on
 * how a character is built, so a GM that guesses wrong gives the player rules
 * they did not agree to -- and a GM that never mentions the printing leaves them
 * unable to tell. Both major systems have had a revision that changed character
 * creation, so this is the common case rather than an edge one.
 *
 * **The newer printing is always the default.** Someone who wants the older one
 * knows they want it; someone who does not say has almost certainly bought the
 * book currently on the shelf.
 *
 * No trademarked names appear here. `5e` and `pf2e` are the identifiers people
 * search for, and the labels describe printings rather than claiming any
 * affiliation.
 */

export const RULES_SYSTEMS = ["5e", "pf2e", "generic"] as const;
export type RulesSystem = (typeof RULES_SYSTEMS)[number];

export const EDITIONS = ["2024", "2014", "remaster", "legacy"] as const;
export type Edition = (typeof EDITIONS)[number];

interface SystemSpec {
	readonly system: RulesSystem;
	readonly label: string;
	/** Newest first. The head of this list is the default. */
	readonly editions: readonly Edition[];
}

export const SYSTEMS: readonly SystemSpec[] = [
	{ system: "5e", label: "Fifth-edition d20 fantasy", editions: ["2024", "2014"] },
	{ system: "pf2e", label: "Second-edition d20 fantasy (tight-math variant)", editions: ["remaster", "legacy"] },
	{ system: "generic", label: "Generic d20 fantasy", editions: [] },
];

const EDITION_LABELS: Record<Edition, string> = {
	"2024": "2024 revision",
	"2014": "2014 printing",
	remaster: "remaster",
	legacy: "legacy",
};

const EDITION_NOTES: Record<Edition, string> = {
	"2024": "the current core rules, with revised species, backgrounds and weapon mastery",
	"2014": "the original printing, with the older race and background rules",
	remaster: "the current core rules, with revised ancestries and reworked spell schools",
	legacy: "the original printing, before the terminology and spell rework",
};

const BY_SYSTEM = new Map<string, SystemSpec>(SYSTEMS.map((spec) => [spec.system, spec]));

export function isRulesSystem(value: string): value is RulesSystem {
	return BY_SYSTEM.has(value);
}

export function isEdition(value: string): value is Edition {
	return (EDITIONS as readonly string[]).includes(value);
}

export function editionsFor(system: RulesSystem): readonly Edition[] {
	return BY_SYSTEM.get(system)?.editions ?? [];
}

/** The newest printing, or `undefined` for a system that has only one. */
export function defaultEdition(system: RulesSystem): Edition | undefined {
	return editionsFor(system)[0];
}

export function isEditionOf(system: RulesSystem, edition: Edition): boolean {
	return editionsFor(system).includes(edition);
}

/**
 * Resolve a requested printing, refusing one that belongs to another system.
 *
 * A silent fallback would be worse than an error: the player would be handed the
 * wrong character creation rules and have no way to notice.
 */
export function resolveEdition(system: RulesSystem, requested?: string): Edition | undefined {
	if (requested === undefined || requested === "") return defaultEdition(system);
	if (!isEdition(requested)) {
		throw new Error(`Unknown edition ${JSON.stringify(requested)}. Known: ${EDITIONS.join(", ")}`);
	}
	if (!isEditionOf(system, requested)) {
		const available = editionsFor(system);
		throw new Error(
			available.length === 0
				? `System ${JSON.stringify(system)} has no editions, so ${JSON.stringify(requested)} does not apply`
				: `Edition ${JSON.stringify(requested)} is not a printing of ${JSON.stringify(system)}. Use one of: ${available.join(", ")}`,
		);
	}
	return requested;
}

export function editionLabel(edition: Edition): string {
	return EDITION_LABELS[edition];
}

export function editionNote(edition: Edition): string {
	return EDITION_NOTES[edition];
}

export function systemLabel(system: RulesSystem, edition?: Edition): string {
	const base = BY_SYSTEM.get(system)?.label ?? system;
	return edition ? `${base}, ${editionLabel(edition)}` : base;
}

/** A line for a campaign overview or a resume brief. */
export function describeRules(system: RulesSystem, edition?: Edition): string {
	return edition ? `${systemLabel(system, edition)} — ${editionNote(edition)}` : systemLabel(system);
}
