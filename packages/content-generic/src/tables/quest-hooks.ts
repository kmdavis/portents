import type { Table } from "@portent/core";

/**
 * Quest Hooks
 *
 * Each hook states who wants it, what it costs them, and why it cannot wait. Roll once for an adventure premise.
 */
export const questHooks = {
	id: "quest-hooks",
	name: "Quest Hooks",
	description: "Each hook states who wants it, what it costs them, and why it cannot wait. Roll once for an adventure premise.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "A village needs its well unpoisoned before the herd dies. They can pay in food and goodwill only.",
		},
		{
			range: [2, 2],
			text: "A merchant house wants a shipment intercepted before it reaches a rival. The shipment is a person.",
		},
		{
			range: [3, 3],
			text: "A widow wants her husband's body brought back from where he fell. Others want it left there.",
		},
		{
			range: [4, 4],
			text: "A scholar needs an escort into a ruin and will not say what they intend to remove.",
		},
		{
			range: [5, 5],
			text: "A garrison commander needs deserters found quietly before the count learns they left.",
		},
		{
			range: [6, 6],
			text: "A child has gone missing and the parents are the prime suspects in everyone else's eyes.",
		},
		{
			range: [7, 7],
			text: "A shrine has stopped answering prayers. Its keeper wants to know whether that is her fault.",
		},
		{
			range: [8, 8],
			text: "Somebody is forging the town's seal. The mayor would rather it never went to court.",
		},
		{
			range: [9, 9],
			text: "A caravan route needs reopening before winter or the valley starves.",
		},
		{
			range: [10, 10],
			text: "A dying thief will trade the location of a cache for safe passage for his sister.",
		},
		{
			range: [11, 11],
			text: "A noble wants a marriage stopped without anyone knowing she wanted it stopped.",
		},
		{
			range: [12, 12],
			text: "The mine has flooded and something came up with the water.",
		},
		{
			range: [13, 13],
			text: "A monster is not the problem; the bounty on it is, and the party can prove that.",
		},
		{
			range: [14, 14],
			text: "Two villages both hold a deed to the same field, both genuine.",
		},
		{
			range: [15, 15],
			text: "A prisoner must be moved three days overland, and four factions want them dead.",
		},
		{
			range: [16, 16],
			text: "A library is being sold off in pieces and one volume must not be sold.",
		},
		{
			range: [17, 17],
			text: "Somebody has been impersonating the party. Their debts are arriving.",
		},
		{
			range: [18, 18],
			text: "A festival must go ahead or the town admits it is afraid. It should not go ahead.",
		},
		{
			range: [19, 19],
			text: "A map arrives by post, addressed to a party member, in their own handwriting.",
		},
		{
			range: [20, 20],
			text: "The last party to take this job returned, and are pretending it went fine.",
		},
	],
} as const satisfies Table;
