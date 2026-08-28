import type { Table } from "@portent/core";

/**
 * Oracle: Complication
 *
 * Drawn when the oracle d100 comes up doubles. Something else is also true. Apply it now, not later.
 */
export const oracleComplications = {
	id: "oracle-complications",
	name: "Oracle: Complication",
	description: "Drawn when the oracle d100 comes up doubles. Something else is also true. Apply it now, not later.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Someone the party thought was elsewhere is here, and has been for a while.",
		},
		{
			range: [2, 2],
			text: "A resource the party was counting on is spent, spoiled or stolen.",
		},
		{
			range: [3, 3],
			text: "The noise draws attention: a second party is now aware of them.",
		},
		{
			range: [4, 4],
			text: "An earlier lie catches up. Someone present knows it was a lie.",
		},
		{
			range: [5, 5],
			text: "The way back is no longer the way back \u2014 collapsed, flooded, locked, or watched.",
		},
		{
			range: [6, 6],
			text: "A neutral party picks a side, and it is not the party's side.",
		},
		{
			range: [7, 7],
			text: "There is far less time than assumed. The deadline just moved closer.",
		},
		{
			range: [8, 8],
			text: "The thing they came for is here but not whole: broken, split, or partly missing.",
		},
		{
			range: [9, 9],
			text: "An ally is compromised: bought, blackmailed, replaced, or possessed.",
		},
		{
			range: [10, 10],
			text: "The place reacts. Wards wake, alarms sound, or the architecture rearranges.",
		},
		{
			range: [11, 11],
			text: "A bystander is in immediate danger and cannot be ignored without cost.",
		},
		{
			range: [12, 12],
			text: "Someone is recording this: a witness, a scrying eye, a scribe in the corner.",
		},
		{
			range: [13, 13],
			text: "The enemy wants exactly the same thing, for a reason the party would respect.",
		},
		{
			range: [14, 14],
			text: "A previously beaten foe reappears, worse, and knows the party's habits.",
		},
		{
			range: [15, 15],
			text: "Something the party carries is the actual problem, and it has been all along.",
		},
		{
			range: [16, 16],
			text: "The weather or environment turns hostile within the next few minutes.",
		},
		{
			range: [17, 17],
			text: "A debt is called in at the worst moment by someone entitled to call it.",
		},
		{
			range: [18, 18],
			text: "The obvious route works, but leaves proof of the party's passage behind.",
		},
		{
			range: [19, 19],
			text: "Two problems the party was tracking separately turn out to be one problem.",
		},
		{
			range: [20, 20],
			text: "It is already done. The party arrived after the decisive moment, not before.",
		},
	],
} as const satisfies Table;
