/**
 * Transcript ordering.
 *
 * One reported bug, and it is the kind worth a permanent test: a roll appeared *below*
 * the narration that used its result, which reads exactly like a model inventing a
 * number and calling a tool afterwards to cover for it.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { JSDOM } from "jsdom";

import { Transcript } from "./transcript.ts";

/** Stand-in for the markdown renderer. Enough to tell empty from not. */
const render = (target: HTMLElement, markdown: string) => {
	target.textContent = markdown;
};

before(() => {
	const dom = new JSDOM("<div id='root'></div>");
	// The module creates elements through the global, as it does in a browser.
	globalThis.document = dom.window.document;
});

const fresh = () => {
	const root = document.createElement("div");
	return { root, transcript: new Transcript({ root, render }) };
};

describe("ordering", () => {
	it("puts a roll before the prose that follows it", () => {
		// The reported bug. The GM narrates, calls a tool, then narrates the result;
		// the roll must land between the two halves.
		const { transcript } = fresh();
		transcript.stream("Let us see what the dice say. ");
		transcript.add("turn roll", "**Rolled 6#4d6kh3** — r-1 16, r-2 11");
		transcript.stream("Your scores are 16 and 11.");
		transcript.end();

		assert.deepEqual(transcript.order, ["turn gm", "turn roll", "turn gm"]);
	});

	it("puts a roll first when the GM says nothing before calling the tool", () => {
		// What actually happened in the reported session: the model called ask_roll with
		// no preamble, so the old code's pre-created empty block sat above the roll.
		const { transcript } = fresh();
		transcript.add("turn roll", "**Rolled 6#4d6kh3**");
		transcript.stream("Excellent — your scores are 17, 16, 11, 11, 10, 8.");
		transcript.end();

		assert.deepEqual(transcript.order, ["turn roll", "turn gm"]);
	});

	it("keeps several tool calls in the order they happened", () => {
		const { transcript } = fresh();
		transcript.stream("You swing. ");
		transcript.add("turn roll", "attack: 19");
		transcript.stream("A hit. ");
		transcript.add("turn roll", "damage: 13");
		transcript.stream("The bugbear drops.");
		transcript.end();

		assert.deepEqual(transcript.order, ["turn gm", "turn roll", "turn gm", "turn roll", "turn gm"]);
	});

	it("does not merge prose across a tool call", () => {
		// Each half must be its own block, or the roll cannot sit between them.
		const { root, transcript } = fresh();
		transcript.stream("First half.");
		transcript.add("turn roll", "r-1");
		transcript.stream("Second half.");
		transcript.end();

		const prose = [...root.children].filter((child) => child.className === "turn gm");
		assert.equal(prose.length, 2);
		assert.equal(prose[0].textContent, "First half.");
		assert.equal(prose[1].textContent, "Second half.", "prose restarted with the earlier text still attached");
	});

	it("accumulates streamed chunks within one block", () => {
		const { root, transcript } = fresh();
		for (const chunk of ["The ", "gate ", "is ", "barred."]) transcript.stream(chunk);
		transcript.end();

		assert.equal(root.childElementCount, 1);
		assert.equal(root.firstElementChild?.textContent, "The gate is barred.");
	});
});

describe("empty turns", () => {
	it("drops a block that never received prose", () => {
		// A turn that called tools and then said nothing would otherwise leave a blank
		// bubble, which reads as a failed reply.
		const { root, transcript } = fresh();
		transcript.add("turn roll", "r-1");
		transcript.end();
		assert.deepEqual(transcript.order, ["turn roll"]);
		assert.equal(root.childElementCount, 1);
	});

	it("keeps a block that received prose", () => {
		const { transcript } = fresh();
		transcript.stream("Something.");
		transcript.end();
		assert.deepEqual(transcript.order, ["turn gm"]);
	});

	it("reports emptiness, which decides whether the GM opens", () => {
		const { transcript } = fresh();
		assert.equal(transcript.isEmpty, true);
		transcript.stream("hello");
		assert.equal(transcript.isEmpty, false);
	});
});

describe("change notification", () => {
	it("fires on every mutation, so the caller can scroll", () => {
		const root = document.createElement("div");
		let changes = 0;
		const transcript = new Transcript({ root, render, onChange: () => changes++ });

		transcript.stream("a");
		transcript.stream("b");
		transcript.add("turn roll", "r-1");
		transcript.end();

		assert.equal(changes, 4);
	});
});
