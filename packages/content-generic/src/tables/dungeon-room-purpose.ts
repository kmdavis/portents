import type { Table } from "@portent/core";

/**
 * Dungeon: Room Purpose
 *
 * What a keyed room was built for. Stock a generated map by rolling once per room, then asking what changed since.
 */
export const dungeonRoomPurpose = {
	id: "dungeon-room-purpose",
	name: "Dungeon: Room Purpose",
	description: "What a keyed room was built for. Stock a generated map by rolling once per room, then asking what changed since.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Guardroom \u2014 arms rack, cold brazier, a game abandoned mid-turn",
		},
		{
			range: [2, 2],
			text: "Barracks \u2014 bunks for more bodies than are here now",
		},
		{
			range: [3, 3],
			text: "Storeroom \u2014 crates, most emptied, one nailed shut",
		},
		{
			range: [4, 4],
			text: "Cistern or well room \u2014 standing water, something below the surface",
		},
		{
			range: [5, 5],
			text: "Shrine \u2014 an altar to something the party may not recognise",
		},
		{
			range: [6, 6],
			text: "Crypt \u2014 niches, most sealed, one open from the inside",
		},
		{
			range: [7, 7],
			text: "Workshop \u2014 half-finished work still clamped in place",
		},
		{
			range: [8, 8],
			text: "Kitchen \u2014 ashes, hooks, and a smell that is nearly food",
		},
		{
			range: [9, 9],
			text: "Records room \u2014 ledgers, tallies, and one page torn out",
		},
		{
			range: [10, 10],
			text: "Cells \u2014 three cells, two open, one occupied",
		},
		{
			range: [11, 11],
			text: "Ritual chamber \u2014 a circle cut into the floor, recently rewritten",
		},
		{
			range: [12, 12],
			text: "Collapsed hall \u2014 rubble, and a gap into somewhere older",
		},
		{
			range: [13, 13],
			text: "Menagerie \u2014 pens with the doors already open",
		},
		{
			range: [14, 14],
			text: "Treasury \u2014 emptied properly, except for what was overlooked",
		},
		{
			range: [15, 15],
			text: "Library \u2014 damp-ruined, three books survivable",
		},
		{
			range: [16, 16],
			text: "Bath or pool \u2014 heated by something still working",
		},
		{
			range: [17, 17],
			text: "Throne or audience room \u2014 one seat, scaled wrong for a human",
		},
		{
			range: [18, 18],
			text: "Mushroom farm \u2014 cultivated, tended, recently harvested",
		},
		{
			range: [19, 19],
			text: "Stair hall \u2014 down, and further down than the party expected",
		},
		{
			range: [20, 20],
			text: "Trapped approach \u2014 the room is the trap; the prize is in plain sight",
		},
	],
} as const satisfies Table;
