/**
 * Tests for the fogged, cropped, token-bearing SVG.
 *
 * The plain-tile SVG tests live in `tiles/tiles.test.ts`. These cover what the
 * view adds, and in particular the two things that would leak information the
 * players should not have: drawing an unknown cell, and drawing a creature the
 * party cannot see.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSvgCells, readSvgTokens, renderSvg } from "../tiles/svg.ts";
import { parseTile } from "../tiles/tile.ts";
import { type Actor, actorGlyph, createView, moveActor, withActors } from "./view.ts";
import { cellKey } from "./visibility.ts";

const twoRooms = parseTile({
	id: "two-rooms",
	name: "Two Rooms",
	art: ["#########", "#...#...#", "#...+...#", "#...#...#", "#########"],
});

const pc: Actor = { id: "brannoc", name: "Brannoc", x: 2, y: 2, kind: "pc" };
const foe: Actor = { id: "goblin", name: "Goblin", x: 6, y: 2, kind: "foe" };

const mask = (view: ReturnType<typeof createView>) => ({
	visible: view.visible,
	explored: view.explored,
});

describe("viewport", () => {
	it("crops to a rectangle of cells", () => {
		const svg = renderSvg(twoRooms, { viewport: { x: 0, y: 0, width: 4, height: 2 }, cellSize: 10 });
		assert.match(svg, /viewBox="0 0 40 20"/);
		const cells = readSvgCells(svg);
		assert.equal(cells.length, 8);
	});

	it("keeps coordinates in map space, not crop space", () => {
		// So a caller can map a click back to a map cell without knowing the crop.
		const cells = readSvgCells(renderSvg(twoRooms, { viewport: { x: 4, y: 1, width: 3, height: 2 } }));
		assert.deepEqual(
			cells.map((cell) => `${cell.x},${cell.y}`),
			["4,1", "5,1", "6,1", "4,2", "5,2", "6,2"],
		);
	});

	it("positions cropped cells from the crop origin", () => {
		const svg = renderSvg(twoRooms, { viewport: { x: 4, y: 1, width: 2, height: 1 }, cellSize: 10 });
		// The first drawn cell sits at x=0 even though its map x is 4.
		assert.match(svg, /<use href="[^"]+" x="0" y="0"[^>]*data-x="4" data-y="1"/);
	});

	it("clamps an oversized or negative crop", () => {
		const all = readSvgCells(renderSvg(twoRooms)).length;
		assert.equal(readSvgCells(renderSvg(twoRooms, { viewport: { x: 0, y: 0, width: 999, height: 999 } })).length, all);
		assert.equal(readSvgCells(renderSvg(twoRooms, { viewport: { x: -5, y: -5, width: 999, height: 999 } })).length, all);
	});

	it("records the crop in the document, for a caller stitching tiles together", () => {
		const svg = renderSvg(twoRooms, { viewport: { x: 2, y: 1, width: 3, height: 2 }, cellSize: 16 });
		assert.match(svg, /data-crop-x="2" data-crop-y="1" data-cols="3" data-rows="2"/);
		assert.match(svg, /data-cell-size="16"/);
	});

	it("only defines symbols the crop actually uses", () => {
		// A crop of pure floor should not carry a door symbol.
		const svg = renderSvg(twoRooms, { viewport: { x: 1, y: 1, width: 3, height: 3 } });
		assert.ok(!svg.includes("portents-cell-door"), "an unused symbol was defined");
		assert.ok(svg.includes("portents-cell-floor"));
	});
});

describe("fog of war", () => {
	it("draws everything when no mask is given", () => {
		const cells = readSvgCells(renderSvg(twoRooms));
		assert.equal(cells.length, 9 * 5);
		assert.ok(cells.every((cell) => cell.state === "visible"));
	});

	it("never draws an unknown cell", () => {
		// The players' map must not leak the shape of a room they have not entered.
		const view = withActors(createView(twoRooms), [pc]);
		const cells = readSvgCells(renderSvg(twoRooms, { visibility: mask(view) }));
		for (const cell of cells) {
			assert.notEqual(cell.state, "unknown");
			assert.ok(
				view.visible.has(cellKey(cell.x, cell.y, twoRooms.width)) ||
					view.explored.has(cellKey(cell.x, cell.y, twoRooms.width)),
				`(${cell.x},${cell.y}) was drawn but is not known`,
			);
		}
		assert.ok(
			!cells.some((cell) => cell.x === 6 && cell.y === 2),
			"the room behind a closed door should not be drawn at all",
		);
	});

	it("dims an explored cell and marks its state", () => {
		let view = withActors(createView(twoRooms), [pc]);
		view = moveActor(view, "brannoc", { x: 6, y: 2 });
		const svg = renderSvg(twoRooms, { visibility: mask(view) });
		const cells = readSvgCells(svg);
		const remembered = cells.find((cell) => cell.x === 1 && cell.y === 1);
		assert.equal(remembered?.state, "explored");
		assert.match(svg, /opacity="0.42"[^>]*data-state="explored"|data-state="explored"/);
	});

	it("honours a custom explored opacity", () => {
		let view = withActors(createView(twoRooms), [pc]);
		view = moveActor(view, "brannoc", { x: 6, y: 2 });
		assert.match(renderSvg(twoRooms, { visibility: mask(view), exploredOpacity: 0.2 }), /opacity="0.2"/);
	});

	it("draws the whole map for a fully revealed view", () => {
		const view = createView(twoRooms, { revealAll: true });
		const cells = readSvgCells(renderSvg(twoRooms, { visibility: mask(view) }));
		assert.equal(cells.length, 9 * 5);
	});

	it("composes with a viewport", () => {
		const view = withActors(createView(twoRooms), [pc]);
		const cells = readSvgCells(
			renderSvg(twoRooms, { visibility: mask(view), viewport: { x: 4, y: 0, width: 5, height: 5 } }),
		);
		// The crop covers the far room, which is unknown, so almost nothing is drawn.
		assert.ok(cells.length < 10, `expected little to be visible, drew ${cells.length}`);
		assert.ok(cells.every((cell) => cell.x >= 4));
	});
});

describe("tokens", () => {
	it("draws a token on a visible cell", () => {
		const view = withActors(createView(twoRooms), [pc]);
		const tokens = readSvgTokens(renderSvg(twoRooms, { visibility: mask(view), tokens: view.actors }));
		assert.deepEqual(tokens, [{ id: "brannoc", x: 2, y: 2, kind: "pc" }]);
	});

	it("does not draw a creature the party cannot see", () => {
		const view = withActors(createView(twoRooms), [pc, foe]);
		const tokens = readSvgTokens(renderSvg(twoRooms, { visibility: mask(view), tokens: view.actors }));
		assert.deepEqual(
			tokens.map((token) => token.id),
			["brannoc"],
			"the goblin is behind a closed door and must not be drawn",
		);
	});

	it("does not draw a creature standing in an explored but unseen cell", () => {
		let view = withActors(createView(twoRooms), [{ ...pc, x: 6, y: 2 }, { ...foe, x: 7, y: 1 }]);
		view = moveActor(view, "brannoc", { x: 2, y: 2 });
		const tokens = readSvgTokens(renderSvg(twoRooms, { visibility: mask(view), tokens: view.actors }));
		assert.deepEqual(
			tokens.map((token) => token.id),
			["brannoc"],
			"terrain is remembered, creatures are not",
		);
	});

	it("draws every token when there is no fog", () => {
		const view = withActors(createView(twoRooms, { revealAll: true }), [pc, foe]);
		assert.equal(readSvgTokens(renderSvg(twoRooms, { tokens: view.actors })).length, 2);
	});

	it("omits a token outside the viewport", () => {
		const view = createView(twoRooms, { revealAll: true });
		const tokens = readSvgTokens(
			renderSvg(twoRooms, { tokens: [pc, foe], visibility: mask(view), viewport: { x: 0, y: 0, width: 4, height: 5 } }),
		);
		assert.deepEqual(tokens.map((token) => token.id), ["brannoc"]);
	});

	it("labels a token with the initial of its name, battle-map style", () => {
		// The SVG and the ASCII view deliberately differ: a picture labels tokens by
		// initial, text uses a fixed symbol per kind so columns line up.
		const svg = renderSvg(twoRooms, { tokens: [pc] });
		assert.match(svg, /<title>Brannoc<\/title>/);
		assert.match(svg, />B</, "expected the initial of the name");
	});

	it("accepts the ASCII symbol when a caller wants it on the picture", () => {
		const svg = renderSvg(twoRooms, { tokens: [{ ...pc, glyph: actorGlyph(pc) }] });
		assert.match(svg, />@</);
	});

	it("uses a custom glyph and colour", () => {
		const svg = renderSvg(twoRooms, { tokens: [{ ...pc, glyph: "B", colour: "#123456" }] });
		assert.match(svg, />B</);
		assert.match(svg, /fill="#123456"/);
	});

	it("escapes a hostile token name", () => {
		const svg = renderSvg(twoRooms, { tokens: [{ ...pc, id: 'a"b', name: '<script>' }] });
		assert.match(svg, /&lt;script&gt;/);
		assert.ok(!svg.includes('data-token="a"b"'));
	});

	it("leaves the cells untouched", () => {
		const withTokens = readSvgCells(renderSvg(twoRooms, { tokens: [pc, foe] }));
		const without = readSvgCells(renderSvg(twoRooms));
		assert.deepEqual(withTokens, without, "drawing tokens changed the terrain");
	});
});
