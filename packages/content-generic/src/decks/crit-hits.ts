import type { Deck } from "@portent/core";

/**
 * Critical Hit Deck
 *
 * Draw on a critical hit instead of, or as well as, rolling extra damage. Effects are written system-neutrally: 'a save' means a Dexterity/Constitution save in 5E or a basic Reflex/Fortitude save in PF2E, GM's pick. Every card is a consequence, not just a bigger number.
 */
export const critHits = {
	id: "crit-hits",
	name: "Critical Hit Deck",
	description: "Draw on a critical hit instead of, or as well as, rolling extra damage. Effects are written system-neutrally: 'a save' means a Dexterity/Constitution save in 5E or a basic Reflex/Fortitude save in PF2E, GM's pick. Every card is a consequence, not just a bigger number.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	cards: [
		{
			name: "Through the Guard",
			text: "Maximum damage on the die instead of rolling it.",
		},
		{
			name: "Opened Up",
			text: "Normal crit damage, and the target bleeds: {{roll:1d4}} damage at the start of each of its turns until someone spends an action to stop it.",
		},
		{
			name: "Hamstrung",
			text: "Speed halved until the target heals or takes a minute to bind the leg.",
		},
		{
			name: "Disarmed",
			text: "The target's weapon lands {{roll:2d6}} feet away in a random direction.",
		},
		{
			name: "Rung Like a Bell",
			text: "The target has disadvantage (or the equivalent penalty) on its next attack, and cannot take reactions until its turn ends.",
		},
		{
			name: "Cracked Ribs",
			text: "Normal crit damage. Any forced movement or dash the target makes costs it {{roll:1d6}} damage.",
		},
		{
			name: "Blinded by Blood",
			text: "The target cannot see until it uses an action to clear its eyes.",
		},
		{
			name: "Armour Split",
			text: "The target's armour bonus drops by 2 until repaired. If it wears none, add {{roll:1d6}} damage instead.",
		},
		{
			name: "Knocked Sprawling",
			text: "The target is prone and drops one held item of your choice.",
		},
		{
			name: "Winded",
			text: "The target cannot speak, cast with a verbal component, or shout a warning until the end of its next turn.",
		},
		{
			name: "Shield Shattered",
			text: "The target's shield is destroyed. With no shield, it takes {{roll:1d8}} extra damage instead.",
		},
		{
			name: "Nerve Struck",
			text: "The target drops everything it is holding and cannot pick anything up until its turn ends.",
		},
		{
			name: "Driven Back",
			text: "The target is pushed 10 feet directly away. If it hits a wall or another creature, both take {{roll:1d6}} damage.",
		},
		{
			name: "Concentration Broken",
			text: "Any ongoing spell or focus effect the target maintains ends immediately, no save.",
		},
		{
			name: "Punched Through",
			text: "The blow continues into a second target within 5 feet of the first, for half your normal damage.",
		},
		{
			name: "Tendon Cut",
			text: "The target's attacks deal half damage until it receives magical healing or a full rest.",
		},
		{
			name: "Head Wound",
			text: "The target is stunned until the end of its next turn if it fails a save, dazed if it succeeds.",
		},
		{
			name: "Exposed Flank",
			text: "The next attack against this target before your next turn is made with advantage.",
		},
		{
			name: "Terrifying Blow",
			text: "Every enemy that saw it must save or be frightened of you until the end of its next turn.",
		},
		{
			name: "Perfect Strike",
			text: "Roll your damage twice and take the better result, then describe the blow yourself.",
		},
		{
			name: "Weapon Wedged",
			text: "Maximum damage, but your weapon is stuck in the target: pull it free with an action or fight on without it.",
		},
		{
			name: "Merciful Opening",
			text: "You could kill it. Instead you have it at your mercy: it yields, flees, or talks. Your choice, right now.",
		},
	],
} as const satisfies Deck;
