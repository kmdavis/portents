/**
 * Decks, with a real draw pile.
 *
 * A drawn card stays gone until the deck is reshuffled. That matters for decks
 * where depletion is the point: a dungeon tile deck that runs out gives a dungeon
 * a natural size, and a crit deck that cannot repeat itself stops the third
 * critical hit of the session feeling like the first.
 *
 * The pile is **plain data the caller owns**, and every operation returns a new
 * one. An earlier version of this reached into campaign state and mutated it,
 * which meant drawing a card could not be done without a campaign, could not be
 * done in a browser, and could not be tested without a filesystem. Persistence
 * belongs to whoever owns the campaign; this module only knows about cards.
 */

import type { Provenance } from "../packs/registry.ts";
import { defaultRandomSource, type RandomSource } from "../ports/random.ts";

export interface Card {
	readonly name: string;
	readonly text?: string;
	readonly tags?: readonly string[];
	/** ASCII art, for decks where the card is a picture. */
	readonly art?: string;
	/** Copies in the deck. Defaults to 1. */
	readonly count?: number;
}

export interface Deck {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	/** Which rules system, if the deck is system-specific. */
	readonly system?: string;
	readonly provenance?: Provenance;
	readonly cards: readonly Card[];
}

/**
 * A deck's state: what is left to draw and what has been discarded.
 *
 * Indices into the *expanded* card list, so a deck with three copies of a card
 * tracks them separately. Serialises to JSON as-is.
 */
export interface Pile {
	readonly deckId: string;
	/** Indices remaining, top of the deck first. */
	readonly draw: readonly number[];
	/** Indices discarded, most recent first. */
	readonly discard: readonly number[];
	/** ISO timestamp of the last shuffle, for a campaign log. */
	readonly shuffledAt?: string;
}

export interface DrawnCard extends Card {
	/** Position in the expanded deck. Stable for a given deck definition. */
	readonly index: number;
}

export interface DrawResult {
	readonly cards: readonly DrawnCard[];
	/** The pile after the draw. The caller persists this. */
	readonly pile: Pile;
	/** True when the draw pile ran out and the discards were reshuffled into it. */
	readonly reshuffled: boolean;
	readonly remaining: number;
	readonly total: number;
}

export class DeckError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DeckError";
	}
}

/** Cards with `count` expanded into individual entries. */
export function expandDeck(deck: Deck): Card[] {
	const out: Card[] = [];
	for (const card of deck.cards) {
		const copies = card.count ?? 1;
		if (!Number.isInteger(copies) || copies < 1) {
			throw new DeckError(`Card ${JSON.stringify(card.name)} in deck ${deck.id} has a bad count: ${card.count}`);
		}
		for (let i = 0; i < copies; i++) out.push(card);
	}
	return out;
}

/** Total cards in a deck, counting duplicates. */
export function deckSize(deck: Deck): number {
	return deck.cards.reduce((total, card) => total + (card.count ?? 1), 0);
}

export interface PileOptions {
	readonly rng?: RandomSource;
	/** Timestamp for the shuffle. Injected so a test can assert on it. */
	readonly now?: () => string;
}

/** A freshly shuffled pile with every card in it. */
export function createPile(deck: Deck, options: PileOptions = {}): Pile {
	const rng = options.rng ?? defaultRandomSource();
	const size = deckSize(deck);
	return {
		deckId: deck.id,
		draw: rng.shuffle(Array.from({ length: size }, (_, i) => i)),
		discard: [],
		shuffledAt: options.now?.() ?? new Date().toISOString(),
	};
}

/**
 * Whether a pile still describes a deck.
 *
 * A pack can be edited between sessions. If the card count changed, the saved
 * indices no longer mean what they meant, so the pile has to be rebuilt rather
 * than silently drawing the wrong cards.
 */
export function pileMatchesDeck(deck: Deck, pile: Pile): boolean {
	return pile.deckId === deck.id && pile.draw.length + pile.discard.length === deckSize(deck);
}

export interface DrawOptions extends PileOptions {
	readonly count?: number;
}

/**
 * Draw from a pile.
 *
 * When the draw pile runs out mid-draw, the discards are reshuffled back in and
 * `reshuffled` says so — worth telling the player, since it means the deck has
 * been all the way round.
 */
export function drawFromPile(deck: Deck, pile: Pile, options: DrawOptions = {}): DrawResult {
	const cards = expandDeck(deck);
	if (!pileMatchesDeck(deck, pile)) {
		throw new DeckError(
			`Pile for ${JSON.stringify(pile.deckId)} does not match deck ${JSON.stringify(deck.id)} ` +
				`(${pile.draw.length + pile.discard.length} cards tracked, deck has ${cards.length}). ` +
				"The deck was probably edited; call createPile to rebuild.",
		);
	}

	const rng = options.rng ?? defaultRandomSource();
	const requested = Math.max(1, Math.floor(options.count ?? 1));
	if (requested > cards.length) {
		throw new DeckError(`Cannot draw ${requested} cards from ${deck.id}, which has ${cards.length}`);
	}

	let draw = [...pile.draw];
	let discard = [...pile.discard];
	let shuffledAt = pile.shuffledAt;
	let reshuffled = false;
	const drawn: number[] = [];

	for (let i = 0; i < requested; i++) {
		if (draw.length === 0) {
			if (discard.length === 0) break;
			draw = rng.shuffle(discard);
			discard = [];
			shuffledAt = options.now?.() ?? new Date().toISOString();
			reshuffled = true;
		}
		const index = draw.shift();
		if (index === undefined) break;
		drawn.push(index);
		discard.unshift(index);
	}

	return {
		cards: drawn.map((index) => ({ ...cards[index], index })),
		pile: { deckId: deck.id, draw, discard, shuffledAt },
		reshuffled,
		remaining: draw.length,
		total: cards.length,
	};
}

/**
 * Draw without a pile: a random hand, without replacement within the one draw.
 *
 * For one-off inspiration where depletion would be meaningless — pulling an NPC
 * spark to answer a question the players just asked, say.
 */
export function drawEphemeral(deck: Deck, options: DrawOptions = {}): DrawnCard[] {
	const cards = expandDeck(deck);
	const rng = options.rng ?? defaultRandomSource();
	const count = Math.max(1, Math.min(Math.floor(options.count ?? 1), cards.length));
	return rng
		.shuffle(cards.map((_, index) => index))
		.slice(0, count)
		.map((index) => ({ ...cards[index], index }));
}

/** Look at the top of the pile without drawing. GM's privilege. */
export function peekPile(deck: Deck, pile: Pile, count = 1): DrawnCard[] {
	const cards = expandDeck(deck);
	return pile.draw.slice(0, Math.max(0, count)).map((index) => ({ ...cards[index], index }));
}

/** The most recently discarded cards, newest first. */
export function recentlyDrawn(deck: Deck, pile: Pile, count = 5): DrawnCard[] {
	const cards = expandDeck(deck);
	return pile.discard.slice(0, Math.max(0, count)).map((index) => ({ ...cards[index], index }));
}

export interface PileStatus {
	readonly deckId: string;
	readonly total: number;
	readonly remaining: number;
	readonly discarded: number;
	readonly shuffledAt?: string;
}

export function pileStatus(deck: Deck, pile: Pile): PileStatus {
	return {
		deckId: deck.id,
		total: deckSize(deck),
		remaining: pile.draw.length,
		discarded: pile.discard.length,
		shuffledAt: pile.shuffledAt,
	};
}

/** Put a specific card back on top, for a GM who drew by mistake. */
export function returnToTop(pile: Pile, index: number): Pile {
	const at = pile.discard.indexOf(index);
	if (at === -1) throw new DeckError(`Card index ${index} is not in the discard pile`);
	const discard = [...pile.discard];
	discard.splice(at, 1);
	return { ...pile, draw: [index, ...pile.draw], discard };
}

/** One card as markdown. */
export function formatCard(card: Card, options: { art?: boolean } = {}): string {
	const heading = [`**${card.name}**`];
	if (card.tags?.length) heading.push(`_(${card.tags.join(", ")})_`);
	let out = heading.join(" ");
	if (card.text) out += `\n${card.text}`;
	if (options.art !== false && card.art) out += `\n\n\`\`\`\n${card.art}\n\`\`\``;
	return out;
}

/** Problems with a deck definition. Empty means it is well formed. */
export function deckProblems(deck: Deck): string[] {
	const problems: string[] = [];
	if (!deck.id) problems.push("has no id");
	if (!deck.name) problems.push("has no name");
	if (!deck.description) problems.push("has no description");
	if (!deck.provenance?.source) problems.push("has no provenance.source");
	if (deck.cards.length === 0) problems.push("has no cards");

	const names = new Set<string>();
	for (const card of deck.cards) {
		if (!card.name) problems.push("has a card with no name");
		if (names.has(card.name)) problems.push(`has two cards named ${JSON.stringify(card.name)}`);
		names.add(card.name);
		const copies = card.count ?? 1;
		if (!Number.isInteger(copies) || copies < 1) {
			problems.push(`card ${JSON.stringify(card.name)} has a bad count: ${card.count}`);
		}
	}
	return problems;
}
