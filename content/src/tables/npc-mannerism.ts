import type { Table } from "@portent/core";

/**
 * NPC: Mannerism
 *
 * One playable habit per NPC. Enough to make them recognisable next session without a page of notes.
 */
export const npcMannerism = {
	id: "npc-mannerism",
	name: "NPC: Mannerism",
	description: "One playable habit per NPC. Enough to make them recognisable next session without a page of notes.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Repeats the last two words of your sentence before answering",
		},
		{
			range: [2, 2],
			text: "Never sits down, in any circumstance",
		},
		{
			range: [3, 3],
			text: "Counts things out loud while thinking",
		},
		{
			range: [4, 4],
			text: "Apologises constantly, means none of it",
		},
		{
			range: [5, 5],
			text: "Talks to their animal, not to you",
		},
		{
			range: [6, 6],
			text: "Uses your full name every time",
		},
		{
			range: [7, 7],
			text: "Eats throughout the conversation, offers nothing",
		},
		{
			range: [8, 8],
			text: "Answers questions with questions, cheerfully",
		},
		{
			range: [9, 9],
			text: "Cleans something already clean",
		},
		{
			range: [10, 10],
			text: "Whispers, forcing everyone to lean in",
		},
		{
			range: [11, 11],
			text: "Laughs at the wrong moments, genuinely",
		},
		{
			range: [12, 12],
			text: "Names a price for everything, including favours",
		},
		{
			range: [13, 13],
			text: "Corrects small factual errors, cannot stop themselves",
		},
		{
			range: [14, 14],
			text: "Stands too close and does not notice",
		},
		{
			range: [15, 15],
			text: "Keeps checking the door",
		},
		{
			range: [16, 16],
			text: "Quotes scripture, slightly wrong, with total confidence",
		},
		{
			range: [17, 17],
			text: "Refuses to speak the name of the thing under discussion",
		},
		{
			range: [18, 18],
			text: "Writes down everything the party says",
		},
		{
			range: [19, 19],
			text: "Assumes the party are somebody else and is delighted",
		},
		{
			range: [20, 20],
			text: "Silent, nods, lets somebody else talk for them",
		},
	],
} as const satisfies Table;
