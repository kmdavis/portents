import type { Table } from "@portents/core";

/**
 * Encounters: Town & City
 *
 * Street-level events. Most are opportunities or entanglements rather than combat.
 */
export const encountersUrban = {
	id: "encounters-urban",
	name: "Encounters: Town & City",
	description: "Street-level events. Most are opportunities or entanglements rather than combat.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "A pickpocket, competent, already three streets away",
		},
		{
			range: [2, 2],
			text: "A street preacher naming one of the party in their sermon",
		},
		{
			range: [3, 3],
			text: "Guards questioning people about a description that half fits the party",
		},
		{
			range: [4, 4],
			text: "A funeral procession blocking the route, and mourners who notice rudeness",
		},
		{
			range: [5, 5],
			text: "Two guilds arguing in the street over a right of way, an hour from violence",
		},
		{
			range: [6, 6],
			text: "A child offering to guide them somewhere for a copper, and meaning it",
		},
		{
			range: [7, 7],
			text: "A shop selling exactly what the party needs, at twice the price",
		},
		{
			range: [8, 8],
			text: "A public punishment, and the crowd's mood is the interesting part",
		},
		{
			range: [9, 9],
			text: "Someone recognises a party member and gets it wrong",
		},
		{
			range: [10, 10],
			text: "A bookseller with one item that should not be for sale",
		},
		{
			range: [11, 11],
			text: "A tavern brawl spilling out of a door: {{table:tavern-names}}",
		},
		{
			range: [12, 12],
			text: "A rumour, loudly and unreliably delivered: {{table:rumours}}",
		},
		{
			range: [13, 13],
			text: "A commission posted publicly, already claimed by someone else",
		},
		{
			range: [14, 14],
			text: "A collector calling in a debt from someone the party likes",
		},
		{
			range: [15, 15],
			text: "Fire. Real, spreading, and everyone is looking at the strangers",
		},
		{
			range: [16, 16],
			text: "A parade or festival that makes discretion impossible today",
		},
		{
			range: [17, 17],
			text: "A body in an alley, and nobody has raised the alarm yet",
		},
		{
			range: [18, 18],
			text: "An invitation, sealed, addressed correctly, from a name they do not know",
		},
		{
			range: [19, 19],
			text: "A cheap room with a landlord who asks no questions and remembers everything",
		},
		{
			range: [20, 20],
			text: "An unremarkable errand completed without incident, and the day is theirs",
		},
	],
} as const satisfies Table;
