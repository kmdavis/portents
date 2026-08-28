import type { Table } from "@portent/core";

/**
 * Oracle: Subject
 *
 * Noun half of an action/subject pair. Read it against the fiction already on the table; the pair is a prompt, not an instruction.
 */
export const oracleSubjects = {
	id: "oracle-subjects",
	name: "Oracle: Subject",
	description: "Noun half of an action/subject pair. Read it against the fiction already on the table; the pair is a prompt, not an instruction.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d100",
	entries: [
		{
			range: [1, 2],
			text: "a debt",
		},
		{
			range: [3, 4],
			text: "a bloodline",
		},
		{
			range: [5, 6],
			text: "a border",
		},
		{
			range: [7, 8],
			text: "a bridge",
		},
		{
			range: [9, 10],
			text: "a cage",
		},
		{
			range: [11, 12],
			text: "a child",
		},
		{
			range: [13, 14],
			text: "a contract",
		},
		{
			range: [15, 16],
			text: "a corpse",
		},
		{
			range: [17, 18],
			text: "a crown",
		},
		{
			range: [19, 20],
			text: "a door",
		},
		{
			range: [21, 22],
			text: "a false name",
		},
		{
			range: [23, 24],
			text: "a feast",
		},
		{
			range: [25, 26],
			text: "a forgery",
		},
		{
			range: [27, 28],
			text: "a grave",
		},
		{
			range: [29, 30],
			text: "a harvest",
		},
		{
			range: [31, 32],
			text: "a key",
		},
		{
			range: [33, 34],
			text: "a ledger",
		},
		{
			range: [35, 36],
			text: "a letter",
		},
		{
			range: [37, 38],
			text: "a machine",
		},
		{
			range: [39, 40],
			text: "a map",
		},
		{
			range: [41, 42],
			text: "a mask",
		},
		{
			range: [43, 44],
			text: "a mirror",
		},
		{
			range: [45, 46],
			text: "a name",
		},
		{
			range: [47, 48],
			text: "a promise",
		},
		{
			range: [49, 50],
			text: "a relic",
		},
		{
			range: [51, 52],
			text: "a rival",
		},
		{
			range: [53, 54],
			text: "a road",
		},
		{
			range: [55, 56],
			text: "a ruin",
		},
		{
			range: [57, 58],
			text: "a seal",
		},
		{
			range: [59, 60],
			text: "a secret",
		},
		{
			range: [61, 62],
			text: "a shrine",
		},
		{
			range: [63, 64],
			text: "a stranger",
		},
		{
			range: [65, 66],
			text: "a threshold",
		},
		{
			range: [67, 68],
			text: "a toll",
		},
		{
			range: [69, 70],
			text: "a tower",
		},
		{
			range: [71, 72],
			text: "a wound",
		},
		{
			range: [73, 74],
			text: "an alliance",
		},
		{
			range: [75, 76],
			text: "an animal",
		},
		{
			range: [77, 78],
			text: "an heir",
		},
		{
			range: [79, 80],
			text: "an omen",
		},
		{
			range: [81, 82],
			text: "an oath",
		},
		{
			range: [83, 84],
			text: "the dark",
		},
		{
			range: [85, 86],
			text: "the dead",
		},
		{
			range: [87, 88],
			text: "the law",
		},
		{
			range: [89, 90],
			text: "the price",
		},
		{
			range: [91, 92],
			text: "the river",
		},
		{
			range: [93, 94],
			text: "the truth",
		},
		{
			range: [95, 96],
			text: "the weather",
		},
		{
			range: [97, 98],
			text: "water",
		},
		{
			range: [99, 100],
			text: "winter",
		},
	],
} as const satisfies Table;
