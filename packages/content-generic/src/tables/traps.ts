import type { Table } from "@portents/core";

/**
 * Traps & Hazards
 *
 * Each entry names the tell, so the trap can be found by describing the room rather than by a die roll alone.
 */
export const traps = {
	id: "traps",
	name: "Traps & Hazards",
	description: "Each entry names the tell, so the trap can be found by describing the room rather than by a die roll alone.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	dice: "1d12",
	entries: [
		{
			range: [1, 1],
			text: "Pit under loose boards. Tell: the dust lies flat where nobody walks.",
		},
		{
			range: [2, 2],
			text: "Dart holes in the wall at chest height. Tell: three neat holes, no mortar dust.",
		},
		{
			range: [3, 3],
			text: "Collapsing ceiling on a tripline. Tell: fresh scoring on the flagstones.",
		},
		{
			range: [4, 4],
			text: "Contact poison on a handle. Tell: the handle is the only clean thing in the room.",
		},
		{
			range: [5, 5],
			text: "Flooding chamber, door seals behind. Tell: a tide line on the walls.",
		},
		{
			range: [6, 6],
			text: "Alarm rather than harm. Tell: a wire, and no visible mechanism.",
		},
		{
			range: [7, 7],
			text: "Gas released by opening a container. Tell: wax seals, and a dead rat nearby.",
		},
		{
			range: [8, 8],
			text: "Blade sweep at ankle height. Tell: a shallow groove worn in the floor.",
		},
		{
			range: [9, 9],
			text: "Portcullis splitting the party. Tell: a slot in the ceiling and floor.",
		},
		{
			range: [10, 10],
			text: "Illusory floor over a real drop. Tell: sound does not echo right.",
		},
		{
			range: [11, 11],
			text: "Magical ward keyed to a symbol. Tell: everyone here wears the same pin.",
		},
		{
			range: [12, 12],
			text: "The trap already fired and cannot fire again. Tell: the previous victim.",
		},
	],
} as const satisfies Table;
