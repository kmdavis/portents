import type { Deck } from "@portent/core";

/**
 * Monster Tactics Deck
 *
 * Draw at the start of a fight to decide how the enemy actually behaves. Stops every combat being 'they walk up and attack'. Draw again if the fight turns and the enemy has a reason to change plan.
 */
export const monsterTactics = {
	id: "monster-tactics",
	name: "Monster Tactics Deck",
	description: "Draw at the start of a fight to decide how the enemy actually behaves. Stops every combat being 'they walk up and attack'. Draw again if the fight turns and the enemy has a reason to change plan.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0-1.0",
	},
	cards: [
		{
			name: "Focus Fire",
			text: "They all target the same character \u2014 whoever hurt them last, or whoever looks weakest. Brutal and simple.",
		},
		{
			name: "Break the Caster",
			text: "They identify the spellcaster and go through anyone in the way to reach them.",
		},
		{
			name: "Fighting Withdrawal",
			text: "They give ground deliberately, drawing the party into worse terrain or a second group.",
		},
		{
			name: "Hold the Choke",
			text: "They will not leave the doorway, stair, or bridge. Coming to them is the only option.",
		},
		{
			name: "Grab and Go",
			text: "They want a thing or a person, not a battle. Once they have it, they run.",
		},
		{
			name: "Ranged Harassment",
			text: "They keep distance, shoot, and reposition. Closing costs the party actions and hit points.",
		},
		{
			name: "Sacrifice Play",
			text: "The weakest of them is sent forward to be killed while the rest set something up.",
		},
		{
			name: "Terrain Users",
			text: "They fight from cover, height, or darkness and never step into the open.",
		},
		{
			name: "Reinforcements Called",
			text: "Round one is a delaying action. Something louder arrives on round {{roll:1d3+2}}.",
		},
		{
			name: "Parley First",
			text: "They open with a demand or an offer, and mean it. Violence is their second choice.",
		},
		{
			name: "Cornered Animal",
			text: "No tactics, no retreat, maximum aggression. They will not surrender and cannot be reasoned with.",
		},
		{
			name: "Test and Report",
			text: "They fight for two rounds to measure the party, then disengage and take what they learned home.",
		},
		{
			name: "Split the Party",
			text: "They work to separate one character from the rest, then swarm them.",
		},
		{
			name: "Protect Something",
			text: "There is something behind them \u2014 a nest, a hostage, a mechanism. They fight to keep it out of reach.",
		},
		{
			name: "Bait and Ambush",
			text: "The visible enemy is bait. The real threat is behind or above the party and waits for them to commit.",
		},
		{
			name: "Surrender When Losing",
			text: "At half strength they throw down weapons. If the party kills them anyway, word gets out.",
		},
	],
} as const satisfies Deck;
