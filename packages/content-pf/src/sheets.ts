/**
 * Sheet scaffolds for the Pathfinder-style systems.
 *
 * Section headings and status key *names* only, all original writing. Naming a
 * status key "Hero Points" is not reproducing a rulebook, and no value is
 * suggested for any of them: a default number would be a rules claim.
 *
 * Three printings, because they genuinely differ in what a blank sheet needs.
 * The remaster is the default and the two older ones exist so a campaign can
 * record what it is actually playing.
 */

import type { SheetTemplate } from "@portents/core";

const secondEdition = {
	sections: [
		{ heading: "Ancestry, Background & Class" },
		{ heading: "Skills & Lore" },
		{ heading: "Strikes & Spellcasting" },
		{ heading: "Feats & Features" },
		{ heading: "Equipment & Bulk" },
		{ heading: "Notes" },
	],
	status: [
		"Level",
		"HP",
		"Temp HP",
		"AC",
		"Speed",
		"Class DC",
		"Perception",
		"Hero Points",
		"Focus Points",
		"Conditions",
		"Wounded",
		"Dying",
		"Gold",
	],
	abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
} as const;

export const sheetRemaster: SheetTemplate = {
	id: "pf2e-remaster",
	name: "Second-edition character (remaster)",
	aliases: ["pf2e remaster", "pf2e", "pathfinder 2e remaster", "pathfinder 2e", "pf 2e"],
	sections: [...secondEdition.sections],
	status: [...secondEdition.status],
	abilities: [...secondEdition.abilities],
};

export const sheetLegacy: SheetTemplate = {
	id: "pf2e-legacy",
	name: "Second-edition character (legacy printing)",
	aliases: ["pf2e legacy", "pathfinder 2e legacy"],
	// The legacy printing tracks alignment, which the remaster removed.
	sections: [...secondEdition.sections],
	status: [...secondEdition.status, "Alignment"],
	abilities: [...secondEdition.abilities],
};

export const sheetFirstEdition: SheetTemplate = {
	id: "pf1e",
	name: "First-edition character",
	aliases: ["pf1e", "pathfinder 1e", "pf 1e"],
	// A different game: separate saves, BAB, CMB/CMD, and prepared spell lists.
	sections: [
		{ heading: "Race, Class & Level" },
		{ heading: "Skills" },
		{ heading: "Attacks" },
		{ heading: "Feats & Special Abilities" },
		{ heading: "Spells" },
		{ heading: "Equipment" },
		{ heading: "Notes" },
	],
	status: [
		"Level",
		"HP",
		"AC",
		"Touch AC",
		"Flat-Footed AC",
		"Speed",
		"BAB",
		"CMB",
		"CMD",
		"Fortitude",
		"Reflex",
		"Will",
		"Conditions",
		"Gold",
	],
	abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
};
