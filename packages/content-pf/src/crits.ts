/**
 * Critical hit and fumble decks, shaped for a three-action, degrees-of-success
 * system.
 *
 * **Original writing, CC0.** Not adapted from any published deck.
 *
 * Paizo does publish physical critical-hit and critical-fumble card products,
 * and their text is a commercial product rather than open rules content: it is
 * not in the ORC- or OGL-licensed rules, and the Community Use Policy that might
 * otherwise cover it is non-commercial and revocable at will. So none of it is
 * usable here, and none of it is used.
 *
 * These differ from the generic decks in what they assume, which is why they
 * override them rather than sitting alongside:
 *
 * - **Actions, not turns.** A generic deck says "lose your next turn". Here the
 *   cost is one action out of three, which is a real but survivable tax.
 * - **Degrees of success exist.** A critical is already a bigger effect, so a
 *   card should add texture rather than stack another multiplier.
 * - **Conditions have values.** Effects name a condition and a value, because the
 *   system has a standard ladder for them.
 */

import type { Deck } from "@portent/core";

const provenance = { source: "original writing for Portent", license: "CC0-1.0" } as const;

export const critHits: Deck = {
	id: "crit-hits",
	name: "Critical Hits",
	description: "Extra consequence on a critical hit, costing actions rather than turns.",
	provenance,
	cards: [
		{ name: "Off Balance", text: "The target is off-balance: it takes a -2 penalty to its next attack roll this round." },
		{ name: "Driven Back", text: "The target is pushed 5 feet directly away from you and cannot Step this turn." },
		{ name: "Grazed Tendon", text: "The target's Speed is reduced by 10 feet until it spends an action to recover." },
		{ name: "Fouled Grip", text: "The target drops one held item of your choice, or spends an action to keep hold of it." },
		{ name: "Ears Ringing", text: "The target is stupefied 1 until the end of its next turn." },
		{ name: "Opened Guard", text: "The target is flat-footed to you until the end of your next turn." },
		{ name: "Bleeding Wound", text: "The target takes 1d6 persistent bleed damage." },
		{ name: "Cracked Armour", text: "The target's armour takes a dent: -1 to its AC until it is repaired." },
		{ name: "Winded", text: "The target loses one action on its next turn." },
		{ name: "Blinding Blood", text: "The target is dazzled until the end of its next turn." },
		{ name: "Fear Takes Hold", text: "The target is frightened 1." },
		{ name: "Clean Through", text: "Roll the weapon's damage dice one additional time and add it." },
		{ name: "Turned Aside", text: "You may immediately Step 5 feet without spending an action." },
		{ name: "Nerve Struck", text: "The target is clumsy 1 until the end of its next turn." },
		{ name: "Momentum", text: "Your next Strike this turn gains a +1 circumstance bonus to its attack roll." },
		{ name: "Nothing Fancy", text: "No extra effect. The critical damage was quite enough." },
	],
};

export const critFumbles: Deck = {
	id: "crit-fumbles",
	name: "Critical Fumbles",
	description: "Consequence on a critical failure, costing actions rather than turns.",
	provenance,
	cards: [
		{ name: "Overswung", text: "You are off-balance: you are flat-footed until the start of your next turn." },
		{ name: "Wide Open", text: "The triggering enemy may make one Strike against you as a reaction." },
		{ name: "Lost Grip", text: "Your weapon flies 10 feet in a random direction." },
		{ name: "Stumbled", text: "You move 5 feet in a random direction and are off-guard until you Step." },
		{ name: "Jammed", text: "Your weapon is stuck: spend an action to free it before attacking again." },
		{ name: "Wrenched Shoulder", text: "Take a -1 penalty to attack rolls with that weapon until you rest." },
		{ name: "Fouled Footing", text: "You fall prone." },
		{ name: "Winded Yourself", text: "You lose your next action this turn." },
		{ name: "Struck an Ally", text: "If an ally is adjacent to your target, deal half your damage to them instead." },
		{ name: "Cracked Haft", text: "Your weapon gains the broken condition after one more use." },
		{ name: "Blinded by Sweat", text: "You are dazzled until the end of your next turn." },
		{ name: "Second Thoughts", text: "You are frightened 1." },
		{ name: "Wasted Effort", text: "Nothing breaks, but the whole exchange cost you the initiative: you are last in the order next round." },
		{ name: "Caught Yourself", text: "No extra effect. You recover before anything worse happens." },
	],
};
