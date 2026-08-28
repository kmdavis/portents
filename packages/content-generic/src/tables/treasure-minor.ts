import type { Table } from "@portents/core";

/**
 * Treasure: Minor Finds
 *
 * Small hoards and pocket loot. Every entry is a thing with a history, not a number of coins.
 */
export const treasureMinor = {
	id: "treasure-minor",
	name: "Treasure: Minor Finds",
	description: "Small hoards and pocket loot. Every entry is a thing with a history, not a number of coins.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "{{roll:2d6}} silver coins of a kingdom that no longer exists",
		},
		{
			range: [2, 2],
			text: "A signet ring, worth {{roll:1d6*10}} gp, engraved with somebody's initials",
		},
		{
			range: [3, 3],
			text: "A sealed letter of credit, redeemable only in a city three weeks away",
		},
		{
			range: [4, 4],
			text: "A jar of ointment, {{roll:1d4}} doses, effect unknown until used",
		},
		{
			range: [5, 5],
			text: "A well-made weapon with another owner's name on the tang",
		},
		{
			range: [6, 6],
			text: "A key, iron, heavy, with a paper tag long since illegible",
		},
		{
			range: [7, 7],
			text: "A holy symbol of an unfashionable god, gold, {{roll:1d6*25}} gp",
		},
		{
			range: [8, 8],
			text: "A locket with a portrait of somebody the party has met",
		},
		{
			range: [9, 9],
			text: "A pouch of teeth, sorted, catalogued, labelled",
		},
		{
			range: [10, 10],
			text: "Trade bars stamped by a merchant house that will want them back",
		},
		{
			range: [11, 11],
			text: "A map of somewhere real, with one landmark drawn wrong on purpose",
		},
		{
			range: [12, 12],
			text: "A bottle of very good wine, {{roll:1d4*5}} gp, unopened",
		},
		{
			range: [13, 13],
			text: "Silk, half a bolt, water-stained at one end",
		},
		{
			range: [14, 14],
			text: "A mechanism, brass, purpose unclear, still ticking",
		},
		{
			range: [15, 15],
			text: "{{roll:3d6}} gp in mixed coin and a receipt for something collected",
		},
		{
			range: [16, 16],
			text: "A journal, three-quarters full, last entry mid-sentence",
		},
		{
			range: [17, 17],
			text: "Two doses of a poison, labelled with a warning in a friendly hand",
		},
		{
			range: [18, 18],
			text: "A gemstone, uncut, {{roll:1d6*50}} gp, with an inclusion shaped like an eye",
		},
		{
			range: [19, 19],
			text: "A writ of passage, forged, but good forgery",
		},
		{
			range: [20, 20],
			text: "Nothing of value, and clear evidence somebody searched here first",
		},
	],
} as const satisfies Table;
