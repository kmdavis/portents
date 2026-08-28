import type { Table } from "@portents/core";

/**
 * Dungeon: Dressing
 *
 * One concrete sensory detail per room. Use it instead of describing another empty stone chamber.
 */
export const dungeonDressing = {
	id: "dungeon-dressing",
	name: "Dungeon: Dressing",
	description: "One concrete sensory detail per room. Use it instead of describing another empty stone chamber.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Chalk tally marks on the wall, stopping abruptly at 41",
		},
		{
			range: [2, 2],
			text: "A draught from nowhere that smells of the sea",
		},
		{
			range: [3, 3],
			text: "Scratches on the inside of a door, at knee height",
		},
		{
			range: [4, 4],
			text: "Bootprints in the dust, going one way only",
		},
		{
			range: [5, 5],
			text: "A dropped child's toy, well made, expensive",
		},
		{
			range: [6, 6],
			text: "Fungus that dims when anyone speaks",
		},
		{
			range: [7, 7],
			text: "Water dripping in a rhythm that is almost a word",
		},
		{
			range: [8, 8],
			text: "A mural, deliberately defaced \u2014 only the hands were scraped out",
		},
		{
			range: [9, 9],
			text: "Bones sorted neatly by size",
		},
		{
			range: [10, 10],
			text: "A rope hanging from a ceiling hole, cut clean at the bottom",
		},
		{
			range: [11, 11],
			text: "Old blood, scrubbed at but not removed",
		},
		{
			range: [12, 12],
			text: "A meal set for two, still warm",
		},
		{
			range: [13, 13],
			text: "Every hinge in the room recently oiled",
		},
		{
			range: [14, 14],
			text: "A cracked mirror, and the crack does not appear in reflections",
		},
		{
			range: [15, 15],
			text: "Insects streaming purposefully along one wall",
		},
		{
			range: [16, 16],
			text: "Graffiti in a modern hand: 'we tried the left door'",
		},
		{
			range: [17, 17],
			text: "Frost on one wall only, in high summer",
		},
		{
			range: [18, 18],
			text: "A cage, big enough, with the bars bent outward",
		},
		{
			range: [19, 19],
			text: "Fresh flowers, arranged, in a place with no daylight",
		},
		{
			range: [20, 20],
			text: "Someone has been here recently and put everything back tidily",
		},
	],
} as const satisfies Table;
