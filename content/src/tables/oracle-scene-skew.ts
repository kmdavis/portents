import type { Table } from "@portent/core";

/**
 * Oracle: Scene Skew
 *
 * The scene you planned, bent. Keep the location and the cast; change one load-bearing assumption.
 */
export const oracleSceneSkew = {
	id: "oracle-scene-skew",
	name: "Oracle: Scene Skew",
	description: "The scene you planned, bent. Keep the location and the cast; change one load-bearing assumption.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	dice: "1d12",
	entries: [
		{
			range: [1, 1],
			text: "It happens somewhere else nearby \u2014 the meeting moved, the door is on the far side.",
		},
		{
			range: [2, 2],
			text: "Someone expected is missing, and their absence is the news.",
		},
		{
			range: [3, 3],
			text: "Someone unexpected is present and will not leave.",
		},
		{
			range: [4, 4],
			text: "It is much earlier or much later than the party planned for.",
		},
		{
			range: [5, 5],
			text: "The mood is wrong: what should be tense is casual, or the reverse.",
		},
		{
			range: [6, 6],
			text: "A physical obstacle blocks the intended approach; there is a worse alternative.",
		},
		{
			range: [7, 7],
			text: "The stakes are personal to someone present in a way the party did not know.",
		},
		{
			range: [8, 8],
			text: "Whatever the party came to find has already been moved, sold, or hidden.",
		},
		{
			range: [9, 9],
			text: "There is an audience. Whatever happens here will be repeated.",
		},
		{
			range: [10, 10],
			text: "The party is expected. Someone prepared for exactly this.",
		},
		{
			range: [11, 11],
			text: "A rule applies here that the party did not know about: custom, law, or ward.",
		},
		{
			range: [12, 12],
			text: "It is smaller and shabbier than expected, and that is disquieting.",
		},
	],
} as const satisfies Table;
