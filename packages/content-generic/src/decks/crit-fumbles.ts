import type { Deck } from "@portent/core";

/**
 * Fumble Deck
 *
 * Optional. Draw on a natural 1 for an attack. Use it on enemies as freely as on the player, or not at all — fumble decks punish martial characters more than casters, so agree before switching this on.
 */
export const critFumbles = {
	id: "crit-fumbles",
	name: "Fumble Deck",
	description: "Optional. Draw on a natural 1 for an attack. Use it on enemies as freely as on the player, or not at all \u2014 fumble decks punish martial characters more than casters, so agree before switching this on.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	cards: [
		{
			name: "Wide",
			text: "Just a miss. Nothing else happens.",
		},
		{
			name: "Off Balance",
			text: "You cannot move again this turn.",
		},
		{
			name: "Overextended",
			text: "The next attack against you before your next turn has advantage.",
		},
		{
			name: "Fumbled Grip",
			text: "Your weapon slips: it lands at your feet.",
		},
		{
			name: "Thrown Wide",
			text: "Your weapon lands {{roll:1d6+5}} feet away in a random direction.",
		},
		{
			name: "Struck the Wall",
			text: "You hit terrain instead. Take {{roll:1d4}} damage and your weapon takes the notch.",
		},
		{
			name: "Tangled",
			text: "You are restrained by your own gear, cloak, or the terrain until you spend an action.",
		},
		{
			name: "Slipped",
			text: "You fall prone where you stand.",
		},
		{
			name: "Wrenched",
			text: "Your attacks deal half damage until the end of your next turn.",
		},
		{
			name: "Hit an Ally",
			text: "The nearest ally within reach takes half your normal damage. If nobody is in reach, you just miss.",
		},
		{
			name: "Bowstring Snapped",
			text: "Ranged: your string or mechanism breaks and needs a minute to fix. Melee: your strap goes and you fight at a penalty until rebuckled.",
		},
		{
			name: "Spent Ammunition",
			text: "Ranged: {{roll:1d4}} ammunition lost or broken. Melee: your weapon is dulled until sharpened.",
		},
		{
			name: "Loud",
			text: "The noise carries. Roll {{table:encounters-dungeon}} or advance the nearest threat clock one step.",
		},
		{
			name: "Telegraphed",
			text: "Every enemy in reach may take a reaction against you immediately.",
		},
		{
			name: "Winded Yourself",
			text: "You cannot use a bonus action, reaction, or second action next turn.",
		},
		{
			name: "Fouled the Ground",
			text: "The square you stand in becomes difficult terrain for everyone, including you.",
		},
		{
			name: "Panic",
			text: "You act last in the next round regardless of initiative.",
		},
		{
			name: "Broke Something Else",
			text: "A non-weapon item on your person is ruined. GM picks; make it something you will notice.",
		},
		{
			name: "Hurt Yourself",
			text: "Take {{roll:1d6}} damage from the follow-through.",
		},
		{
			name: "Lost the Thread",
			text: "Any spell or effect you were concentrating on ends.",
		},
	],
} as const satisfies Deck;
