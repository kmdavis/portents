import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seededRandomSource } from "../ports/random.ts";
import {
	createPile,
	type Deck,
	DeckError,
	deckProblems,
	deckSize,
	drawEphemeral,
	drawFromPile,
	expandDeck,
	formatCard,
	peekPile,
	pileMatchesDeck,
	pileStatus,
	recentlyDrawn,
	returnToTop,
} from "./deck.ts";

const deck: Deck = {
	id: "test-deck",
	name: "Test Deck",
	description: "For testing.",
	provenance: { source: "test" },
	cards: [
		{ name: "Alpha", text: "first" },
		{ name: "Beta", text: "second", tags: ["tagged"] },
		{ name: "Gamma", text: "third", count: 3 },
	],
};

const rng = () => seededRandomSource("deck-test");

describe("expandDeck", () => {
	it("expands counts into separate cards", () => {
		assert.equal(expandDeck(deck).length, 5);
		assert.equal(deckSize(deck), 5);
	});

	it("keeps duplicates adjacent and identical", () => {
		const cards = expandDeck(deck);
		assert.deepEqual(cards.slice(2).map((card) => card.name), ["Gamma", "Gamma", "Gamma"]);
	});

	it("rejects a bad count", () => {
		assert.throws(
			() => expandDeck({ ...deck, cards: [{ name: "Bad", count: 0 }] }),
			/has a bad count: 0/,
		);
		assert.throws(() => expandDeck({ ...deck, cards: [{ name: "Bad", count: 1.5 }] }), DeckError);
	});
});

describe("createPile", () => {
	it("holds every card", () => {
		const pile = createPile(deck, { rng: rng() });
		assert.equal(pile.draw.length, 5);
		assert.equal(pile.discard.length, 0);
		assert.deepEqual([...pile.draw].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
	});

	it("shuffles reproducibly from a seed", () => {
		assert.deepEqual(createPile(deck, { rng: rng() }).draw, createPile(deck, { rng: rng() }).draw);
	});

	it("records when it was shuffled, from an injectable clock", () => {
		const pile = createPile(deck, { rng: rng(), now: () => "2026-01-01T00:00:00.000Z" });
		assert.equal(pile.shuffledAt, "2026-01-01T00:00:00.000Z");
	});
});

describe("drawFromPile", () => {
	it("returns a new pile rather than mutating the old one", () => {
		// The pile is the caller's data. An earlier version reached into campaign
		// state and mutated it, which made drawing impossible without a filesystem.
		const before = createPile(deck, { rng: rng() });
		const result = drawFromPile(deck, before, { rng: rng() });
		assert.equal(before.draw.length, 5, "the original pile changed");
		assert.equal(result.pile.draw.length, 4);
		assert.notEqual(result.pile, before);
	});

	it("depletes the pile", () => {
		let pile = createPile(deck, { rng: rng() });
		const seen: string[] = [];
		for (let i = 0; i < 5; i++) {
			const result = drawFromPile(deck, pile, { rng: rng() });
			seen.push(result.cards[0].name);
			pile = result.pile;
			assert.equal(result.remaining, 4 - i);
		}
		// Five draws see every card exactly once, duplicates included.
		assert.deepEqual(seen.slice().sort(), ["Alpha", "Beta", "Gamma", "Gamma", "Gamma"]);
	});

	it("draws several at once, all different", () => {
		const result = drawFromPile(deck, createPile(deck, { rng: rng() }), { count: 3, rng: rng() });
		assert.equal(result.cards.length, 3);
		assert.equal(new Set(result.cards.map((card) => card.index)).size, 3);
	});

	it("reshuffles the discards when the pile runs out, and says so", () => {
		let pile = createPile(deck, { rng: rng() });
		let reshuffled = false;
		for (let i = 0; i < 5; i++) {
			const result = drawFromPile(deck, pile, { rng: rng() });
			pile = result.pile;
			reshuffled = reshuffled || result.reshuffled;
		}
		assert.equal(reshuffled, false, "should not reshuffle before the deck is exhausted");
		const sixth = drawFromPile(deck, pile, { rng: rng() });
		assert.equal(sixth.reshuffled, true, "the sixth draw should reshuffle");
		assert.equal(sixth.cards.length, 1);
	});

	it("draws the whole deck in one call", () => {
		const result = drawFromPile(deck, createPile(deck, { rng: rng() }), { count: 5, rng: rng() });
		assert.equal(result.cards.length, 5);
		assert.equal(result.remaining, 0);
		assert.equal(result.reshuffled, false);
	});

	it("refuses to draw more cards than the deck holds", () => {
		assert.throws(
			() => drawFromPile(deck, createPile(deck, { rng: rng() }), { count: 6 }),
			/Cannot draw 6 cards from test-deck, which has 5/,
		);
	});

	it("refuses a pile that no longer matches the deck", () => {
		// A pack can be edited between sessions; stale indices would draw the
		// wrong cards.
		const pile = createPile(deck, { rng: rng() });
		const shrunk: Deck = { ...deck, cards: deck.cards.slice(0, 2) };
		assert.throws(() => drawFromPile(shrunk, pile, {}), /does not match deck/);
		assert.throws(() => drawFromPile(shrunk, pile, {}), /call createPile to rebuild/);
	});

	it("refuses a pile from a different deck", () => {
		const pile = createPile(deck, { rng: rng() });
		assert.throws(() => drawFromPile({ ...deck, id: "other" }, pile, {}), /does not match deck/);
	});
});

describe("pileMatchesDeck", () => {
	it("accepts a fresh pile and a part-drawn one", () => {
		const pile = createPile(deck, { rng: rng() });
		assert.equal(pileMatchesDeck(deck, pile), true);
		assert.equal(pileMatchesDeck(deck, drawFromPile(deck, pile, { rng: rng() }).pile), true);
	});

	it("rejects a pile for a resized deck", () => {
		const pile = createPile(deck, { rng: rng() });
		assert.equal(pileMatchesDeck({ ...deck, cards: deck.cards.slice(1) }, pile), false);
	});
});

describe("drawEphemeral", () => {
	it("draws without a pile", () => {
		const cards = drawEphemeral(deck, { count: 2, rng: rng() });
		assert.equal(cards.length, 2);
		assert.notEqual(cards[0].index, cards[1].index);
	});

	it("does not repeat within one draw", () => {
		const cards = drawEphemeral(deck, { count: 5, rng: rng() });
		assert.equal(new Set(cards.map((card) => card.index)).size, 5);
	});

	it("clamps a request larger than the deck", () => {
		assert.equal(drawEphemeral(deck, { count: 99, rng: rng() }).length, 5);
	});
});

describe("peek, recent and return", () => {
	it("peeks without drawing", () => {
		const pile = createPile(deck, { rng: rng() });
		const peeked = peekPile(deck, pile, 2);
		assert.equal(peeked.length, 2);
		assert.equal(pile.draw.length, 5, "peeking should not draw");
		assert.equal(peeked[0].index, pile.draw[0]);
	});

	it("lists what was drawn, newest first", () => {
		let pile = createPile(deck, { rng: rng() });
		const first = drawFromPile(deck, pile, { rng: rng() });
		pile = first.pile;
		const second = drawFromPile(deck, pile, { rng: rng() });
		const recent = recentlyDrawn(deck, second.pile, 2);
		assert.equal(recent[0].index, second.cards[0].index);
		assert.equal(recent[1].index, first.cards[0].index);
	});

	it("puts a card back on top", () => {
		const drawn = drawFromPile(deck, createPile(deck, { rng: rng() }), { rng: rng() });
		const index = drawn.cards[0].index;
		const restored = returnToTop(drawn.pile, index);
		assert.equal(restored.draw[0], index);
		assert.ok(!restored.discard.includes(index));
	});

	it("refuses to return a card that was not drawn", () => {
		const pile = createPile(deck, { rng: rng() });
		assert.throws(() => returnToTop(pile, 0), /not in the discard pile/);
	});
});

describe("pileStatus", () => {
	it("reports the counts", () => {
		const drawn = drawFromPile(deck, createPile(deck, { rng: rng() }), { count: 2, rng: rng() });
		assert.deepEqual(pileStatus(deck, drawn.pile), {
			deckId: "test-deck",
			total: 5,
			remaining: 3,
			discarded: 2,
			shuffledAt: drawn.pile.shuffledAt,
		});
	});
});

describe("formatCard", () => {
	it("renders name, tags and text", () => {
		assert.equal(formatCard(deck.cards[1]), "**Beta** _(tagged)_\nsecond");
	});

	it("fences art", () => {
		assert.match(formatCard({ name: "Tile", art: "###\n+.+" }), /```\n###\n\+\.\+\n```/);
	});

	it("can omit art", () => {
		assert.ok(!formatCard({ name: "Tile", art: "###" }, { art: false }).includes("```"));
	});
});

describe("deckProblems", () => {
	it("passes a well-formed deck", () => {
		assert.deepEqual(deckProblems(deck), []);
	});

	it("catches missing metadata", () => {
		const problems = deckProblems({ id: "", name: "", description: "", cards: [] });
		assert.ok(problems.includes("has no id"));
		assert.ok(problems.includes("has no name"));
		assert.ok(problems.includes("has no description"));
		assert.ok(problems.includes("has no provenance.source"));
		assert.ok(problems.includes("has no cards"));
	});

	it("catches duplicate card names", () => {
		const problems = deckProblems({
			...deck,
			cards: [{ name: "Same" }, { name: "Same" }],
		});
		assert.ok(problems.some((p) => /two cards named "Same"/.test(p)), problems.join("; "));
	});
});
