/** Streaming reasoning uses the same Markdown renderer as public prose. */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { JSDOM } from "jsdom";

import { createThinkingBlock } from "./thinking.ts";

before(() => {
	const dom = new JSDOM();
	globalThis.document = dom.window.document;
});

describe("thinking block", () => {
	it("renders accumulated Markdown instead of printing its punctuation", () => {
		// A small renderer double makes the boundary explicit: createThinkingBlock must
		// call the renderer, not assign textContent. The production callback is the same
		// marked + DOMPurify path used for public prose.
		const block = createThinkingBlock((target, markdown) => {
			target.innerHTML = markdown.replace(/\*\*(.+)\*\*/, "<strong>$1</strong>");
		});

		block.append("**Preparing ");
		block.append("to assist**");

		const body = block.details.querySelector(".thinking-body");
		assert.equal(body?.innerHTML, "<strong>Preparing to assist</strong>");
		assert.equal(body?.textContent, "Preparing to assist");
	});

	it("is collapsed by default and labelled", () => {
		const block = createThinkingBlock(() => {});
		assert.equal(block.details.open, false);
		assert.equal(block.details.querySelector("summary")?.textContent, "Thinking");
	});

	it("uses a prose container rather than a preformatted text block", () => {
		const block = createThinkingBlock(() => {});
		assert.equal(block.details.querySelector("pre"), null);
		assert.equal(block.details.querySelector(".thinking-body")?.tagName, "DIV");
	});
});
