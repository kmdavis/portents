import type { Deck } from "@portent/core";

/**
 * Standard Playing Cards
 *
 * A 54-card French deck including both jokers. Useful for initiative, fortune tests, Deck-of-Many-Things-style stunts, and any table keyed to suit and rank.
 */
export const playingCards = {
	id: "playing-cards",
	name: "Standard Playing Cards",
	description: "A 54-card French deck including both jokers. Useful for initiative, fortune tests, Deck-of-Many-Things-style stunts, and any table keyed to suit and rank.",
	provenance: {
		source: "public domain card set",
		license: "public domain",
	},
	cards: [
		{
			name: "Ace of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 1",
		},
		{
			name: "2 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 2",
		},
		{
			name: "3 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 3",
		},
		{
			name: "4 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 4",
		},
		{
			name: "5 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 5",
		},
		{
			name: "6 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 6",
		},
		{
			name: "7 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 7",
		},
		{
			name: "8 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 8",
		},
		{
			name: "9 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 9",
		},
		{
			name: "10 of Spades",
			tags: [
				"spades",
				"pip",
			],
			text: "\u2660 value 10",
		},
		{
			name: "Jack of Spades",
			tags: [
				"spades",
				"court",
			],
			text: "\u2660 value 11",
		},
		{
			name: "Queen of Spades",
			tags: [
				"spades",
				"court",
			],
			text: "\u2660 value 12",
		},
		{
			name: "King of Spades",
			tags: [
				"spades",
				"court",
			],
			text: "\u2660 value 13",
		},
		{
			name: "Ace of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 1",
		},
		{
			name: "2 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 2",
		},
		{
			name: "3 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 3",
		},
		{
			name: "4 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 4",
		},
		{
			name: "5 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 5",
		},
		{
			name: "6 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 6",
		},
		{
			name: "7 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 7",
		},
		{
			name: "8 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 8",
		},
		{
			name: "9 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 9",
		},
		{
			name: "10 of Hearts",
			tags: [
				"hearts",
				"pip",
			],
			text: "\u2665 value 10",
		},
		{
			name: "Jack of Hearts",
			tags: [
				"hearts",
				"court",
			],
			text: "\u2665 value 11",
		},
		{
			name: "Queen of Hearts",
			tags: [
				"hearts",
				"court",
			],
			text: "\u2665 value 12",
		},
		{
			name: "King of Hearts",
			tags: [
				"hearts",
				"court",
			],
			text: "\u2665 value 13",
		},
		{
			name: "Ace of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 1",
		},
		{
			name: "2 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 2",
		},
		{
			name: "3 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 3",
		},
		{
			name: "4 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 4",
		},
		{
			name: "5 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 5",
		},
		{
			name: "6 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 6",
		},
		{
			name: "7 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 7",
		},
		{
			name: "8 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 8",
		},
		{
			name: "9 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 9",
		},
		{
			name: "10 of Diamonds",
			tags: [
				"diamonds",
				"pip",
			],
			text: "\u2666 value 10",
		},
		{
			name: "Jack of Diamonds",
			tags: [
				"diamonds",
				"court",
			],
			text: "\u2666 value 11",
		},
		{
			name: "Queen of Diamonds",
			tags: [
				"diamonds",
				"court",
			],
			text: "\u2666 value 12",
		},
		{
			name: "King of Diamonds",
			tags: [
				"diamonds",
				"court",
			],
			text: "\u2666 value 13",
		},
		{
			name: "Ace of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 1",
		},
		{
			name: "2 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 2",
		},
		{
			name: "3 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 3",
		},
		{
			name: "4 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 4",
		},
		{
			name: "5 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 5",
		},
		{
			name: "6 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 6",
		},
		{
			name: "7 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 7",
		},
		{
			name: "8 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 8",
		},
		{
			name: "9 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 9",
		},
		{
			name: "10 of Clubs",
			tags: [
				"clubs",
				"pip",
			],
			text: "\u2663 value 10",
		},
		{
			name: "Jack of Clubs",
			tags: [
				"clubs",
				"court",
			],
			text: "\u2663 value 11",
		},
		{
			name: "Queen of Clubs",
			tags: [
				"clubs",
				"court",
			],
			text: "\u2663 value 12",
		},
		{
			name: "King of Clubs",
			tags: [
				"clubs",
				"court",
			],
			text: "\u2663 value 13",
		},
		{
			name: "Joker (red)",
			tags: [
				"joker",
			],
			text: "Wild. Whatever the table decided a joker means.",
		},
		{
			name: "Joker (black)",
			tags: [
				"joker",
			],
			text: "Wild. Whatever the table decided a joker means.",
		},
	],
} as const satisfies Deck;
