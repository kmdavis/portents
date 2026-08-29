/**
 * The transcript and composer use the same two-column geometry.
 *
 * This is tested at the computed-style boundary because both reported regressions were
 * selector interactions, not missing declarations:
 *
 * - hiding the GM cell with `display: none` removed it from grid placement, so the
 *   player cell moved into the deliberately zero-width first track;
 * - the composer remained a one-column flex row while the transcript opened a GM
 *   column, so it ran underneath both panes instead of lining up with the player pane.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../public/demo.css", import.meta.url), "utf8");

function layout(open: boolean) {
	const dom = new JSDOM(`
		<style>${css}</style>
		<div class="chat-pane">
			<div id="transcript" class="${open ? "with-gm" : ""}">
				<div class="turn-row">
					<div class="turn-aside"></div>
					<div class="turn-content"></div>
				</div>
			</div>
			<form id="say-form">
				<div class="composer-gutter" aria-hidden="true"></div>
				<div class="composer-fields"><textarea id="say"></textarea><button id="send">Send</button></div>
			</form>
		</div>
	`);
	const window = dom.window;
	const get = (selector: string) => window.getComputedStyle(window.document.querySelector(selector)!);
	return { get };
}

describe("transcript columns", () => {
	it("uses one ordinary content column while the GM pane is closed", () => {
		const { get } = layout(false);
		// A zero-width grid track is not equivalent. Since the hidden aside no longer
		// participates in placement, the content becomes the first item and lands in it.
		assert.equal(get(".turn-row").display, "block");
		assert.equal(get(".turn-aside").display, "none");
	});

	it("uses the two-column grid only while the GM pane is open", () => {
		const { get } = layout(true);
		assert.equal(get(".turn-row").display, "grid");
		assert.notEqual(get(".turn-aside").display, "none");
	});
});

describe("composer columns", () => {
	it("uses the full player column while the GM pane is closed", () => {
		const { get } = layout(false);
		assert.equal(get("#say-form").display, "block");
		assert.equal(get(".composer-gutter").display, "none");
		assert.equal(get(".composer-fields").display, "flex");
	});

	it("uses the same two columns as the transcript while the GM pane is open", () => {
		const { get } = layout(true);
		assert.equal(get("#say-form").display, "grid");
		assert.notEqual(get(".composer-gutter").display, "none");
		assert.equal(get(".composer-fields").display, "flex");
	});
});
