/**
 * `@portent/content-pf` — content for the Pathfinder-style d20 systems.
 *
 * **Everything here is original writing under CC0.** That is not an oversight:
 * unlike fifth edition, these systems have no CC-BY reference document to adapt.
 * Paizo's rules content is available under the ORC (remaster) or the OGL
 * (legacy), and neither has an SPDX identifier, so `package.json` could not
 * state what the content was actually under. Their Community Use Policy is
 * non-commercial and revocable "for any reason or for no reason", which is the
 * opposite of the durability a published package needs.
 *
 * So this package carries content *shaped* for these systems rather than taken
 * from them: decks that cost actions instead of turns, sheet scaffolds that
 * track hero points and focus points, and status keys named the way these games
 * name them.
 *
 * Adding ORC-licensed content later is possible, but it is a deliberate decision
 * with real costs -- a non-SPDX licence field, the licence text shipped in the
 * package, and an attribution notice -- and it should live in its own package so
 * those costs stay contained.
 *
 * ```ts
 * import { createRegistry } from "@portent/core";
 * import { genericContent } from "@portent/content-generic";
 * import { pf2eContent } from "@portent/content-pf";
 *
 * const registry = createRegistry([genericContent, pf2eContent]);
 * ```
 */

import type { ContentPack } from "@portent/core";
import { critFumbles, critHits } from "./crits.ts";
import { guidance } from "./guidance.generated.ts";
import { sheetFirstEdition, sheetLegacy, sheetRemaster } from "./sheets.ts";

export { critFumbles, critHits } from "./crits.ts";
export { sheetFirstEdition, sheetLegacy, sheetRemaster } from "./sheets.ts";

const provenance = { source: "original writing for Portent", license: "CC0-1.0" } as const;

/** The remaster: the current printing, and the default for `pf2e`. */
export const pf2eContent: ContentPack = {
	id: "pf2e-remaster",
	guidance: guidance.filter((entry) => entry.id === "pf2e-remaster"),
	name: "Second edition, remaster",
	decks: [critHits, critFumbles],
	sheets: [sheetRemaster],
	// The generic decks assume losing a turn is a reasonable cost. In a
	// three-action system it is not, so these replace them outright.
	overrides: [
		{ kind: "deck", id: "crit-hits", reason: "action-economy costs instead of lost turns" },
		{ kind: "deck", id: "crit-fumbles", reason: "action-economy costs instead of lost turns" },
	],
	provenance,
};

/** The legacy printing, before the terminology and spell rework. */
export const pf2eLegacyContent: ContentPack = {
	id: "pf2e-legacy",
	guidance: guidance.filter((entry) => entry.id === "pf2e-legacy"),
	name: "Second edition, legacy printing",
	sheets: [sheetLegacy],
	provenance,
};

/** First edition: a different game, sharing only its ancestry. */
export const pf1eContent: ContentPack = {
	id: "pf1e",
	guidance: guidance.filter((entry) => entry.id === "pf1e"),
	name: "First edition",
	sheets: [sheetFirstEdition],
	provenance,
};

/** Every printing, oldest first. */
export const pfPacks = [pf1eContent, pf2eLegacyContent, pf2eContent] as const;
