/**
 * The generic sheet scaffold.
 *
 * Deliberately vague, and deliberately not d20. It exists to be *safely
 * incomplete* rather than authoritative: a player whose system nobody wrote a
 * template for should get a sheet that obviously wants filling in, not one that
 * quietly asserts the wrong game.
 *
 * So: no attribute names, no skill list, no combat or magic headings, and no
 * suggested status keys beyond the two that mean something in nearly every game
 * ever printed. Anything more specific is a guess, and a guess here is written to
 * a file the player keeps.
 */

import type { SheetTemplate } from "@portent/core";

export const genericSheet: SheetTemplate = {
	id: "generic",
	name: "Generic character",
	generic: true,
	aliases: [],
	sections: [
		{ heading: "Concept", body: "_Who they are in a sentence._" },
		{ heading: "Traits & Abilities", body: "_Whatever your system calls them._" },
		{ heading: "Equipment & Resources" },
		{ heading: "Relationships" },
		{ heading: "Notes & Open Questions" },
	],
	// Two keys, because a name and a condition are near-universal and a number is
	// not. The GM adds what the system needs on the first roll that needs it.
	status: ["Condition"],
	note: "No template for this system, so this is the generic scaffold. Add sections as play needs them.",
};

export const sheets: readonly SheetTemplate[] = [genericSheet];
