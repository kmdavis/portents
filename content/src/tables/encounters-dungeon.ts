import type { Table } from "@portent/core";

/**
 * Encounters: Dungeon
 *
 * Roll when the party makes noise, lingers, or opens something. Half of these are not fights.
 */
export const encountersDungeon = {
	id: "encounters-dungeon",
	name: "Encounters: Dungeon",
	description: "Roll when the party makes noise, lingers, or opens something. Half of these are not fights.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 2],
			text: "A patrol, {{roll:1d4+1}} strong, walking a fixed route on a schedule",
			tags: [
				"hostile",
			],
		},
		{
			range: [3, 3],
			text: "A lone sentry who would rather negotiate than die here",
			tags: [
				"social",
			],
		},
		{
			range: [4, 4],
			text: "Scavengers picking over a kill that is not theirs",
			tags: [
				"hostile",
			],
		},
		{
			range: [5, 5],
			text: "Something the residents are also afraid of, loose in the halls",
			tags: [
				"hostile",
			],
		},
		{
			range: [6, 6],
			text: "Vermin swarm, drawn by food or blood the party is carrying",
			tags: [
				"hostile",
			],
		},
		{
			range: [7, 7],
			text: "A prisoner, alive, who will lie about why they are here",
			tags: [
				"social",
			],
		},
		{
			range: [8, 8],
			text: "Another party of adventurers, ahead of the party and worse off",
			tags: [
				"social",
			],
		},
		{
			range: [9, 9],
			text: "A servant or drudge who can be bribed with basic decency",
			tags: [
				"social",
			],
		},
		{
			range: [10, 10],
			text: "Voices arguing behind a door about what to do with the party",
			tags: [
				"ominous",
			],
		},
		{
			range: [11, 11],
			text: "A trap already sprung, with the previous victim still in it",
			tags: [
				"ominous",
			],
		},
		{
			range: [12, 12],
			text: "The lights go out and something moves in the dark, once",
			tags: [
				"ominous",
			],
		},
		{
			range: [13, 13],
			text: "Structural failure: floor, ceiling, or the stair the party came up",
			tags: [
				"environment",
			],
		},
		{
			range: [14, 14],
			text: "A ward triggers and the place knows where they are",
			tags: [
				"environment",
			],
		},
		{
			range: [15, 15],
			text: "A door that was open is closed, and locked from the far side",
			tags: [
				"ominous",
			],
		},
		{
			range: [16, 16],
			text: "An animal, domesticated, loose and friendly and clearly someone's",
			tags: [
				"neutral",
			],
		},
		{
			range: [17, 17],
			text: "Fresh supplies: food, water, oil, someone else's cache",
			tags: [
				"fortune",
			],
		},
		{
			range: [18, 18],
			text: "Detail worth noting: {{table:dungeon-dressing}}",
			tags: [
				"neutral",
			],
		},
		{
			range: [19, 19],
			text: "A shortcut the map does not show, if they are willing to crawl",
			tags: [
				"fortune",
			],
		},
		{
			range: [20, 20],
			text: "Silence. The party gets to rest, if they dare take it",
			tags: [
				"calm",
			],
		},
	],
} as const satisfies Table;
