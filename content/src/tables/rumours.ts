import type { Table } from "@portent/core";

/**
 * Rumours
 *
 * Roughly a third of these should turn out to be wrong. Decide which with the oracle, not in advance.
 */
export const rumours = {
	id: "rumours",
	name: "Rumours",
	description: "Roughly a third of these should turn out to be wrong. Decide which with the oracle, not in advance.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "The old road is passable again, and nobody knows who cleared it",
		},
		{
			range: [2, 2],
			text: "A tax collector went up to {{table:names-place}} and never came back down",
		},
		{
			range: [3, 3],
			text: "There is a reward posted, but the family cannot actually pay it",
		},
		{
			range: [4, 4],
			text: "The well water changed taste a month ago and two people have died since",
		},
		{
			range: [5, 5],
			text: "Somebody is buying old maps, quietly, for good money",
		},
		{
			range: [6, 6],
			text: "The garrison is at half strength and lying about it",
		},
		{
			range: [7, 7],
			text: "A shepherd swears the standing stones have moved",
		},
		{
			range: [8, 8],
			text: "There is a way into the ruin that avoids the front gate entirely",
		},
		{
			range: [9, 9],
			text: "The last party that went in came out rich and left the same night",
		},
		{
			range: [10, 10],
			text: "One of the councillors is not who they were last winter",
		},
		{
			range: [11, 11],
			text: "Livestock have gone missing without blood or tracks",
		},
		{
			range: [12, 12],
			text: "A priest has stopped taking confession and will not say why",
		},
		{
			range: [13, 13],
			text: "There is a debt owed to something, and the payment is due",
		},
		{
			range: [14, 14],
			text: "The mine did not close because it ran out",
		},
		{
			range: [15, 15],
			text: "Two villages are one bad harvest away from a border war",
		},
		{
			range: [16, 16],
			text: "A child came back from the woods speaking a language nobody knows",
		},
		{
			range: [17, 17],
			text: "The bridge toll doubled and the tollkeeper is new",
		},
		{
			range: [18, 18],
			text: "Something is nesting in the bell tower and the bell has not rung in weeks",
		},
		{
			range: [19, 19],
			text: "There is a map tattooed on somebody in the next town",
		},
		{
			range: [20, 20],
			text: "None of it is true and everyone repeating it knows that",
		},
	],
} as const satisfies Table;
