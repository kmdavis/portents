/**
 * What can be tested without a browser.
 *
 * `svgToPngBlob` and friends need a canvas, which Node does not have, so the
 * rasterising itself is covered only by the manual page. That is a real gap and
 * it is stated in the README rather than papered over with a fake canvas that
 * would prove nothing.
 *
 * `svgDimensions` is pure string parsing, so it is tested properly here — and it
 * is the part most likely to break, since it has to cope with whatever the SVG
 * renderer emits.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSvg } from "../../tiles/svg.ts";
import { parseTile } from "../../tiles/tile.ts";
import { svgDimensions, svgToPngBlob } from "./raster.ts";

const tile = parseTile({ id: "t", name: "T", art: ["###+###", "+.....+", "###+###"] });

describe("svgDimensions", () => {
	it("reads the size of a real rendered tile", () => {
		assert.deepEqual(svgDimensions(renderSvg(tile, { cellSize: 10 })), { width: 70, height: 30 });
	});

	it("tracks the cell size", () => {
		assert.deepEqual(svgDimensions(renderSvg(tile, { cellSize: 32 })), { width: 224, height: 96 });
	});

	it("reads the size of a cropped render", () => {
		const svg = renderSvg(tile, { cellSize: 10, viewport: { x: 0, y: 0, width: 3, height: 2 } });
		assert.deepEqual(svgDimensions(svg), { width: 30, height: 20 });
	});

	it("includes the legend in the height, so the PNG is not clipped", () => {
		const plain = svgDimensions(renderSvg(tile, { cellSize: 10 }));
		const legended = svgDimensions(renderSvg(tile, { cellSize: 10, legend: true }));
		assert.ok(legended.height > plain.height, "a legend should make the document taller");
		assert.equal(legended.width, plain.width);
	});

	it("falls back to the viewBox when there is no width or height", () => {
		assert.deepEqual(svgDimensions('<svg viewBox="0 0 120 80"></svg>'), { width: 120, height: 80 });
	});

	it("handles a decimal size", () => {
		assert.deepEqual(svgDimensions('<svg width="12.5" height="7.25"></svg>'), { width: 12.5, height: 7.25 });
	});

	it("explains itself when the size cannot be determined", () => {
		assert.throws(() => svgDimensions("<svg></svg>"), /Could not determine the SVG size/);
	});
});

describe("svgToPngBlob without a browser", () => {
	it("fails with an actionable message rather than a cryptic one", async () => {
		// Node has neither OffscreenCanvas nor document. Someone hitting this on a
		// server should be told what to use instead.
		await assert.rejects(() => svgToPngBlob(renderSvg(tile)), (error: Error) => {
			assert.match(error.message, /No canvas available/);
			assert.match(error.message, /@resvg\/resvg-js/, "should name a Node alternative");
			return true;
		});
	});
});
