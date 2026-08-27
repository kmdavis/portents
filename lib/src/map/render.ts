/**
 * Text rendering of a view: fog of war and tokens, as ASCII.
 *
 * Deliberately a separate function from `renderAscii`, and deliberately named
 * differently, because **this output is not a tile and must not be parsed back**.
 * A token glyph sits on top of the terrain glyph, so the character at a position
 * no longer says what the terrain is. `renderAscii(tile)` remains the
 * round-trippable source-of-truth projection; this is a display.
 *
 * Same three states as the SVG: unknown draws blank, explored draws the terrain,
 * visible draws terrain plus whoever is standing there.
 */

import { glyphOf } from "../tiles/cells.ts";
import type { Viewport } from "../tiles/svg.ts";
import { actorGlyph, cellState, type MapView, visibleActors } from "./view.ts";
import { cellKey } from "./visibility.ts";

export interface AsciiViewOptions {
	/** Crop to a rectangle of cells. */
	readonly viewport?: Viewport;
	/** Character for a cell nobody has seen. Default a space. */
	readonly unknownGlyph?: string;
	/** Draw tokens. Default true. */
	readonly tokens?: boolean;
	/** Strip trailing whitespace from each line. Default true. */
	readonly trimTrailing?: boolean;
}

export function renderAsciiView(view: MapView, options: AsciiViewOptions = {}): string {
	const unknown = options.unknownGlyph ?? " ";
	if ([...unknown].length !== 1) {
		throw new RangeError(`unknownGlyph must be exactly one character, got ${JSON.stringify(unknown)}`);
	}

	const crop = options.viewport ?? { x: 0, y: 0, width: view.map.width, height: view.map.height };
	const startX = Math.max(0, crop.x);
	const startY = Math.max(0, crop.y);
	const endX = Math.min(view.map.width, startX + crop.width);
	const endY = Math.min(view.map.height, startY + crop.height);

	const tokens = new Map<number, string>();
	if (options.tokens !== false) {
		for (const actor of visibleActors(view)) {
			tokens.set(cellKey(actor.x, actor.y, view.map.width), actorGlyph(actor));
		}
	}

	const lines: string[] = [];
	for (let y = startY; y < endY; y++) {
		let line = "";
		for (let x = startX; x < endX; x++) {
			const state = cellState(view, x, y);
			if (state === "unknown") {
				line += unknown;
				continue;
			}
			const token = state === "visible" ? tokens.get(cellKey(x, y, view.map.width)) : undefined;
			line += token ?? glyphOf(view.map.cells[y][x]);
		}
		lines.push(line);
	}

	return (options.trimTrailing === false ? lines : lines.map((line) => line.replace(/\s+$/, ""))).join("\n");
}
