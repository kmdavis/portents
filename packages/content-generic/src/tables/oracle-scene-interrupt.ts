import type { Table } from "@portent/core";

/**
 * Oracle: Scene Interrupt
 *
 * Not the scene you planned at all. Something takes the initiative before the party can act on their intent.
 */
export const oracleSceneInterrupt = {
	id: "oracle-scene-interrupt",
	name: "Oracle: Scene Interrupt",
	description: "Not the scene you planned at all. Something takes the initiative before the party can act on their intent.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d12",
	entries: [
		{
			range: [1, 1],
			text: "An NPC acts on their own agenda now: {{table:oracle-actions}} {{table:oracle-subjects}}.",
		},
		{
			range: [2, 2],
			text: "A threat the party left behind arrives, in force.",
		},
		{
			range: [3, 3],
			text: "A messenger reaches them with news that reprioritises everything.",
		},
		{
			range: [4, 4],
			text: "The environment fails: fire, flood, collapse, or a storm nobody can talk through.",
		},
		{
			range: [5, 5],
			text: "A stranger asks the party for help and cannot pay.",
		},
		{
			range: [6, 6],
			text: "Something the party owns activates, escapes, or speaks.",
		},
		{
			range: [7, 7],
			text: "Authority intervenes: guards, a noble, a priest, a tax collector with a writ.",
		},
		{
			range: [8, 8],
			text: "A rival gets there first and is on the way out with the prize.",
		},
		{
			range: [9, 9],
			text: "Violence starts between two other parties and the party is between them.",
		},
		{
			range: [10, 10],
			text: "A previous kindness is repaid, awkwardly and publicly.",
		},
		{
			range: [11, 11],
			text: "The party is accused of something they did not do, with evidence.",
		},
		{
			range: [12, 12],
			text: "Time skips: they lose an hour and cannot account for it.",
		},
	],
} as const satisfies Table;
