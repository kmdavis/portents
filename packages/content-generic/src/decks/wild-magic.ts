import type { Deck } from "@portents/core";

/**
 * Wild Magic Deck
 *
 * Draw when magic goes wrong: a wild sorcerer's surge, a botched ritual, a cursed scroll, or a spell cast in a place where magic is unstable. Effects last a minute unless stated.
 */
export const wildMagic = {
	id: "wild-magic",
	name: "Wild Magic Deck",
	description: "Draw when magic goes wrong: a wild sorcerer's surge, a botched ritual, a cursed scroll, or a spell cast in a place where magic is unstable. Effects last a minute unless stated.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	cards: [
		{
			name: "Backwash",
			text: "The spell works, and the caster takes {{roll:1d6}} force damage per spell level.",
		},
		{
			name: "Wrong Target",
			text: "The spell resolves against the nearest creature to the intended target instead.",
		},
		{
			name: "Echo",
			text: "The spell fires again at the start of the caster's next turn, at the same target, for free.",
		},
		{
			name: "Colour Out",
			text: "All colour drains from a 30-foot radius for a minute. Everything is greyscale, including creatures.",
		},
		{
			name: "Gravity Slip",
			text: "For a minute, the caster falls upward if they leave the ground. Jumping is a bad idea.",
		},
		{
			name: "Duplicate",
			text: "A silent, harmless copy of the caster appears and mimics them exactly for a minute.",
		},
		{
			name: "Wardrobe",
			text: "Everyone within 20 feet swaps one item of clothing at random. It fits perfectly.",
		},
		{
			name: "Bloom",
			text: "Flowers erupt from every surface in a 20-foot radius. They are edible and mildly narcotic.",
		},
		{
			name: "Volume",
			text: "The caster's voice is audible for a mile for the next minute. Whispering does not help.",
		},
		{
			name: "Weight",
			text: "The caster's gear weighs ten times as much for a minute.",
		},
		{
			name: "Featherfall",
			text: "Everything dropped within 30 feet falls slowly for an hour, including the caster.",
		},
		{
			name: "Candles",
			text: "Every flame within 100 feet goes out. Nothing will light for a minute.",
		},
		{
			name: "Familiar Trouble",
			text: "A small creature appears, is furious about it, and blames the caster.",
		},
		{
			name: "Truthful",
			text: "The caster cannot speak a deliberate untruth for ten minutes.",
		},
		{
			name: "Mirror Skin",
			text: "The caster becomes reflective. They cannot be surprised, and cannot hide at all.",
		},
		{
			name: "Age Slip",
			text: "The caster appears {{roll:2d10}} years older or younger, chosen at random. Cosmetic only, lasts a day.",
		},
		{
			name: "Elemental Leak",
			text: "The caster leaks their spell's element harmlessly for a minute: soot, frost, sparks, or damp.",
		},
		{
			name: "Silence Bloom",
			text: "A 15-foot sphere of total silence follows the caster for a minute.",
		},
		{
			name: "Swap",
			text: "The caster and the nearest willing creature exchange places instantly.",
		},
		{
			name: "Refund",
			text: "The spell slot or focus point is not spent. Nothing else goes wrong.",
		},
		{
			name: "Overcharge",
			text: "The spell resolves as though cast one level higher, and the caster is dazed until the end of their next turn.",
		},
		{
			name: "Nothing",
			text: "The magic shudders and settles. Nothing happens, which is somehow worse.",
		},
	],
} as const satisfies Deck;
