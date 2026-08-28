import type { Table } from "@portent/core";

/**
 * GM Moves
 *
 * What the world does when the player fails a roll, hesitates, or does something the GM has no plan for. Pick or roll; never leave a failure as 'nothing happens'.
 */
export const gmMoves = {
	id: "gm-moves",
	name: "GM Moves",
	description: "What the world does when the player fails a roll, hesitates, or does something the GM has no plan for. Pick or roll; never leave a failure as 'nothing happens'.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	dice: "1d20",
	entries: [
		{
			range: [1, 1],
			text: "Deal damage, but describe it as a specific injury with a consequence.",
		},
		{
			range: [2, 2],
			text: "Use up a resource: ammunition, torches, rations, a spell slot, a favour.",
		},
		{
			range: [3, 3],
			text: "Separate them from something they need: a weapon, a companion, the exit.",
		},
		{
			range: [4, 4],
			text: "Offer an opportunity with a cost attached, and make the cost clear.",
		},
		{
			range: [5, 5],
			text: "Reveal an unwelcome truth about the situation.",
		},
		{
			range: [6, 6],
			text: "Put someone the player cares about in the line of fire.",
		},
		{
			range: [7, 7],
			text: "Turn their success against them: they get what they asked for, and it is worse.",
		},
		{
			range: [8, 8],
			text: "A threat advances one step: the clock ticks visibly.",
		},
		{
			range: [9, 9],
			text: "Tell them the requirements or consequences, then ask if they still do it.",
		},
		{
			range: [10, 10],
			text: "Introduce a new element mid-scene: another creature, another door, another voice.",
		},
		{
			range: [11, 11],
			text: "Take away their footing: terrain shifts, light dies, ground gives.",
		},
		{
			range: [12, 12],
			text: "Make them choose between two things they want.",
		},
		{
			range: [13, 13],
			text: "An NPC does the sensible thing for their own interests, not the plot's.",
		},
		{
			range: [14, 14],
			text: "The noise, blood, or magic attracts something else.",
		},
		{
			range: [15, 15],
			text: "Impose a condition rather than damage: frightened, restrained, blinded, slowed.",
		},
		{
			range: [16, 16],
			text: "Let them succeed and immediately raise the stakes on the next beat.",
		},
		{
			range: [17, 17],
			text: "Damage a thing rather than a person: gear breaks, a map burns, a bridge cracks.",
		},
		{
			range: [18, 18],
			text: "Give them exactly what they wanted from the wrong person.",
		},
		{
			range: [19, 19],
			text: "Skip ahead: cut to the consequence and let them react to the aftermath.",
		},
		{
			range: [20, 20],
			text: "Do nothing hostile. Let the moment breathe and let them talk.",
		},
	],
} as const satisfies Table;
