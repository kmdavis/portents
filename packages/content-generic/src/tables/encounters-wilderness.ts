import type { Table } from "@portent/core";

/**
 * Encounters: Wilderness
 *
 * System-neutral wilderness encounters, weighted toward the non-hostile. Statting is the GM's job; the entry says who and why.
 */
export const encountersWilderness = {
	id: "encounters-wilderness",
	name: "Encounters: Wilderness",
	description: "System-neutral wilderness encounters, weighted toward the non-hostile. Statting is the GM's job; the entry says who and why.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Predators hunting something else, and the party is between them and it",
			tags: [
				"hostile",
			],
		},
		{
			range: [2, 2],
			text: "A war band on the move, {{roll:2d6}} strong, not looking for a fight yet",
			tags: [
				"hostile",
			],
		},
		{
			range: [3, 3],
			text: "Ambush from cover by scouts who want the party's supplies, not their lives",
			tags: [
				"hostile",
			],
		},
		{
			range: [4, 4],
			text: "A lone monster, badly wounded, cornered and desperate",
			tags: [
				"hostile",
			],
		},
		{
			range: [5, 5],
			text: "Something enormous passes at a distance and does not notice them",
			tags: [
				"ominous",
			],
		},
		{
			range: [6, 6],
			text: "Corpses on the road, {{roll:1d4}} of them, killed less than a day ago",
			tags: [
				"ominous",
			],
		},
		{
			range: [7, 7],
			text: "A shrine at a crossroads, offerings fresh",
			tags: [
				"neutral",
			],
		},
		{
			range: [8, 8],
			text: "A merchant with a broken axle and a suspiciously heavy cart",
			tags: [
				"social",
			],
		},
		{
			range: [9, 9],
			text: "Pilgrims, footsore, sharing rumour: {{table:rumours}}",
			tags: [
				"social",
			],
		},
		{
			range: [10, 10],
			text: "A hunter who knows the area and will trade guidance for company",
			tags: [
				"social",
			],
		},
		{
			range: [11, 11],
			text: "A refugee family heading the other way, with a good reason",
			tags: [
				"social",
			],
		},
		{
			range: [12, 12],
			text: "Weather turns: {{table:weather}}",
			tags: [
				"environment",
			],
		},
		{
			range: [13, 13],
			text: "The road is out \u2014 flood, rockfall, or a bridge deliberately cut",
			tags: [
				"environment",
			],
		},
		{
			range: [14, 14],
			text: "A toll, collected by people with no authority to collect it",
			tags: [
				"social",
			],
		},
		{
			range: [15, 15],
			text: "Tracks of something bipedal and far too large, heading the party's way",
			tags: [
				"ominous",
			],
		},
		{
			range: [16, 16],
			text: "An abandoned camp, still warm, gear left behind",
			tags: [
				"ominous",
			],
		},
		{
			range: [17, 17],
			text: "A traveller going the same way who will not say where from",
			tags: [
				"social",
			],
		},
		{
			range: [18, 18],
			text: "Wild animals behaving wrongly: fleeing, or unafraid",
			tags: [
				"ominous",
			],
		},
		{
			range: [19, 19],
			text: "A find: {{table:treasure-minor}} in the mud of an old track",
			tags: [
				"fortune",
			],
		},
		{
			range: [20, 20],
			text: "Nothing at all, and good weather for it \u2014 the party gains ground",
			tags: [
				"calm",
			],
		},
	],
} as const satisfies Table;
