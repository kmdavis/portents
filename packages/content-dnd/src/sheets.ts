/**
 * Sheet scaffolds for fifth-edition characters.
 *
 * Section headings and status key *names* only. No numbers, no skill lists, no
 * class features: those are rules content, and a scaffold has no business
 * asserting them. The two printings differ by one section, which is the honest
 * amount of difference for the purpose of a blank sheet.
 *
 * Original writing. Naming a section "Attacks & Spellcasting" is not reproducing
 * a rulebook.
 */

import type { SheetTemplate } from "@portents/core";

const shared = {
	sections: [
		{ heading: "Skills & Proficiencies" },
		{ heading: "Attacks & Spellcasting" },
		{ heading: "Features & Traits" },
		{ heading: "Equipment" },
		{ heading: "Background & Bonds" },
		{ heading: "Notes" },
	],
	status: [
		"Level",
		"XP",
		"HP",
		"Temp HP",
		"AC",
		"Speed",
		"Initiative",
		"Proficiency Bonus",
		"Hit Dice",
		"Death Saves",
		"Conditions",
		"Inspiration",
		"Spell Slots",
		"Gold",
	],
	abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
} as const;

export const sheet2014: SheetTemplate = {
	id: "dnd-5e-2014",
	name: "Fifth-edition character (2014 printing)",
	aliases: ["dnd 5e 2014", "d&d 5e 2014", "5e 2014", "dnd 5e", "d&d 5e", "5e"],
	sections: [...shared.sections],
	status: [...shared.status],
	abilities: [...shared.abilities],
};

export const sheet2024: SheetTemplate = {
	id: "dnd-5e-2024",
	name: "Fifth-edition character (2024 printing)",
	aliases: ["dnd 5e 2024", "d&d 5e 2024", "5e 2024", "dnd 2024"],
	// Weapon mastery is the one addition worth a section of its own on a blank
	// sheet; everything else the printing changed lives inside existing sections.
	sections: [
		{ heading: "Skills & Proficiencies" },
		{ heading: "Attacks & Spellcasting" },
		{ heading: "Weapon Mastery" },
		{ heading: "Features & Traits" },
		{ heading: "Equipment" },
		{ heading: "Background & Bonds" },
		{ heading: "Notes" },
	],
	status: [...shared.status],
	abilities: [...shared.abilities],
};
