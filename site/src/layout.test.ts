/**
 * The transcript owns the conversation columns; the composer does not.
 *
 * Two separate width bugs came from treating the composer as part of the pane layout:
 *
 * - hiding the GM cell with `display: none` removed it from grid placement, so the
 *   player cell moved into the deliberately zero-width first track;
 * - then the composer was aligned to the player track, when the intended design was a
 *   full-width control below the GM pane, player pane, and sidebar.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../public/demo.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

function transcriptLayout(open: boolean) {
	const dom = new JSDOM(`
		<style>${css}</style>
		<div id="transcript" class="${open ? "with-gm" : ""}">
			<div class="turn-row">
				<div class="turn-aside"></div>
				<div class="turn-content"></div>
			</div>
		</div>
	`);
	const window = dom.window;
	const get = (selector: string) => window.getComputedStyle(window.document.querySelector(selector)!);
	return { get };
}

describe("transcript columns", () => {
	it("uses one ordinary content column while the GM pane is closed", () => {
		const { get } = transcriptLayout(false);
		// A zero-width grid track is not equivalent. Since the hidden aside no longer
		// participates in placement, the content becomes the first item and lands in it.
		assert.equal(get(".turn-row").display, "block");
		assert.equal(get(".turn-aside").display, "none");
	});

	it("uses the two-column grid only while the GM pane is open", () => {
		const { get } = transcriptLayout(true);
		assert.equal(get(".turn-row").display, "grid");
		assert.notEqual(get(".turn-aside").display, "none");
	});
});

describe("full-width composer", () => {
	it("sits below the complete pane row rather than inside the chat pane", () => {
		// #game is a vertical flex container. A direct child after .panes spans the same
		// game width as that entire row: private pane, player pane, and sidebar.
		const dom = new JSDOM(html);
		const form = dom.window.document.querySelector("#say-form")!;
		assert.equal(form.parentElement?.id, "game");
		assert.equal(form.previousElementSibling?.className, "panes");
	});

	it("contains one flex row for the textarea and button", () => {
		const dom = new JSDOM(`<style>${css}</style><form id="say-form"><div class="composer-fields"></div></form>`);
		const window = dom.window;
		const form = window.getComputedStyle(window.document.querySelector("#say-form")!);
		const fields = window.getComputedStyle(window.document.querySelector(".composer-fields")!);
		assert.equal(form.display, "block");
		assert.equal(fields.display, "flex");
	});
});
