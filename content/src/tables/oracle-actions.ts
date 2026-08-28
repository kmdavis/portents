import type { Table } from "@portent/core";

/**
 * Oracle: Action
 *
 * Verb half of an action/subject pair. Pair with oracle-subjects when you need a nudge rather than a yes or no.
 */
export const oracleActions = {
	id: "oracle-actions",
	name: "Oracle: Action",
	description: "Verb half of an action/subject pair. Pair with oracle-subjects when you need a nudge rather than a yes or no.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	dice: "1d100",
	entries: [
		{
			range: [1, 2],
			text: "abandon",
		},
		{
			range: [3, 4],
			text: "ambush",
		},
		{
			range: [5, 6],
			text: "arrive",
		},
		{
			range: [7, 8],
			text: "barter",
		},
		{
			range: [9, 10],
			text: "betray",
		},
		{
			range: [11, 12],
			text: "bind",
		},
		{
			range: [13, 14],
			text: "block",
		},
		{
			range: [15, 16],
			text: "break",
		},
		{
			range: [17, 18],
			text: "burn",
		},
		{
			range: [19, 20],
			text: "bury",
		},
		{
			range: [21, 22],
			text: "carry",
		},
		{
			range: [23, 24],
			text: "collapse",
		},
		{
			range: [25, 26],
			text: "conceal",
		},
		{
			range: [27, 28],
			text: "confess",
		},
		{
			range: [29, 30],
			text: "corrupt",
		},
		{
			range: [31, 32],
			text: "count",
		},
		{
			range: [33, 34],
			text: "delay",
		},
		{
			range: [35, 36],
			text: "demand",
		},
		{
			range: [37, 38],
			text: "divide",
		},
		{
			range: [39, 40],
			text: "drown",
		},
		{
			range: [41, 42],
			text: "escape",
		},
		{
			range: [43, 44],
			text: "exchange",
		},
		{
			range: [45, 46],
			text: "follow",
		},
		{
			range: [47, 48],
			text: "forge",
		},
		{
			range: [49, 50],
			text: "gather",
		},
		{
			range: [51, 52],
			text: "guard",
		},
		{
			range: [53, 54],
			text: "haggle",
		},
		{
			range: [55, 56],
			text: "hunt",
		},
		{
			range: [57, 58],
			text: "imitate",
		},
		{
			range: [59, 60],
			text: "inherit",
		},
		{
			range: [61, 62],
			text: "invite",
		},
		{
			range: [63, 64],
			text: "mourn",
		},
		{
			range: [65, 66],
			text: "multiply",
		},
		{
			range: [67, 68],
			text: "open",
		},
		{
			range: [69, 70],
			text: "petition",
		},
		{
			range: [71, 72],
			text: "poison",
		},
		{
			range: [73, 74],
			text: "purify",
		},
		{
			range: [75, 76],
			text: "reclaim",
		},
		{
			range: [77, 78],
			text: "release",
		},
		{
			range: [79, 80],
			text: "repair",
		},
		{
			range: [81, 82],
			text: "replace",
		},
		{
			range: [83, 84],
			text: "reveal",
		},
		{
			range: [85, 86],
			text: "sacrifice",
		},
		{
			range: [87, 88],
			text: "seal",
		},
		{
			range: [89, 90],
			text: "summon",
		},
		{
			range: [91, 92],
			text: "surrender",
		},
		{
			range: [93, 94],
			text: "trade places with",
		},
		{
			range: [95, 96],
			text: "unmake",
		},
		{
			range: [97, 98],
			text: "wake",
		},
		{
			range: [99, 100],
			text: "watch",
		},
	],
} as const satisfies Table;
