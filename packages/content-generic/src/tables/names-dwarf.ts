import type { Table } from "@portents/core";

/**
 * Names: Dwarf
 *
 * Dwarven given name plus clan name.
 */
export const namesDwarf = {
	id: "names-dwarf",
	name: "Names: Dwarf",
	description: "Dwarven given name plus clan name.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	entries: [
		{
			text: "Borin Deepdelve",
		},
		{
			text: "Halda Stonecut",
		},
		{
			text: "Dvalin Ashforge",
		},
		{
			text: "Runa Emberhand",
		},
		{
			text: "Thrain Ironvow",
		},
		{
			text: "Gisla Coalmantle",
		},
		{
			text: "Muran Blackseam",
		},
		{
			text: "Astrid Hammerfast",
		},
		{
			text: "Vorn Gravelbeard",
		},
		{
			text: "Hedra Quarrykin",
		},
		{
			text: "Odin Slagborn",
		},
		{
			text: "Brenna Anvilwake",
		},
		{
			text: "Karl Oreheart",
		},
		{
			text: "Sigrun Deadlamp",
		},
		{
			text: "Falk Rustvein",
		},
		{
			text: "Torda Goldtally",
		},
		{
			text: "Grim Saltstep",
		},
		{
			text: "Yrsa Flintwidow",
		},
		{
			text: "Nal Cinderpost",
		},
		{
			text: "Vigga Truehold",
		},
	],
} as const satisfies Table;
