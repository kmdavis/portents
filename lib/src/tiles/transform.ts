/**
 * Rotating and mirroring tiles.
 *
 * The standard format makes these safe: a square grid with connectors at edge
 * centres maps onto itself under a quarter turn, so a rotated standard tile is
 * still a standard tile with its connectors still centred. That means an author
 * writes one bend and gets all four, one T-junction and gets all four — which is
 * what lets the generator satisfy any connection pattern from a small set.
 *
 * Cell kinds are orientation-free by design. A `>` stairs-down cell means "down"
 * regardless of which way the tile is turned, and the SVG draws each cell
 * upright, so no glyph or symbol needs rotating with the grid.
 */

import type { CellKind } from "./cells.ts";
import type { Tile } from "./tile.ts";

/** Quarter turns clockwise. */
export type QuarterTurns = 0 | 1 | 2 | 3;

function normaliseTurns(turns: number): QuarterTurns {
	return (((turns % 4) + 4) % 4) as QuarterTurns;
}

/**
 * Rotate a tile clockwise by quarter turns.
 *
 * The id gains a suffix so a rotated tile is traceable back to its source and
 * two rotations of the same tile never collide in a set: `bend@90`.
 */
export function rotateTile(tile: Tile, turns: number): Tile {
	const quarter = normaliseTurns(turns);
	if (quarter === 0) return tile;

	const { width, height } = tile;
	// A quarter turn swaps the axes.
	const newWidth = quarter % 2 === 1 ? height : width;
	const newHeight = quarter % 2 === 1 ? width : height;

	const cells: CellKind[][] = Array.from({ length: newHeight }, () =>
		Array.from({ length: newWidth }, (): CellKind => "void"),
	);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const mapped = rotatePoint(x, y, width, height, quarter);
			cells[mapped.y][mapped.x] = tile.cells[y][x];
		}
	}

	return {
		id: `${tile.id}@${quarter * 90}`,
		name: `${tile.name} (${quarter * 90}°)`,
		tags: tile.tags,
		note: tile.note,
		width: newWidth,
		height: newHeight,
		cells: cells.map((row) => Object.freeze(row)),
	};
}

/** Where `(x, y)` lands after `turns` clockwise quarter turns of a `width × height` grid. */
export function rotatePoint(
	x: number,
	y: number,
	width: number,
	height: number,
	turns: number,
): { x: number; y: number } {
	switch (normaliseTurns(turns)) {
		case 0:
			return { x, y };
		case 1:
			return { x: height - 1 - y, y: x };
		case 2:
			return { x: width - 1 - x, y: height - 1 - y };
		case 3:
			return { x: y, y: width - 1 - x };
	}
}

/** Mirror a tile left-to-right. */
export function mirrorTile(tile: Tile): Tile {
	return {
		id: `${tile.id}@mirror`,
		name: `${tile.name} (mirrored)`,
		tags: tile.tags,
		note: tile.note,
		width: tile.width,
		height: tile.height,
		cells: tile.cells.map((row) => Object.freeze([...row].reverse())),
	};
}

/**
 * A tile and all four of its rotations, deduplicated.
 *
 * A rotationally symmetric tile — a four-way hall, say — yields one entry rather
 * than four identical ones, so a generator picking uniformly is not biased
 * towards symmetric tiles.
 */
export function rotations(tile: Tile): Tile[] {
	const seen = new Map<string, Tile>();
	for (const turns of [0, 1, 2, 3] as const) {
		const rotated = rotateTile(tile, turns);
		const signature = rotated.cells.map((row) => row.join("")).join("\n");
		if (!seen.has(signature)) seen.set(signature, rotated);
	}
	return [...seen.values()];
}

/** Every distinct orientation of every tile in a set. */
export function withRotations(tiles: readonly Tile[]): Tile[] {
	return tiles.flatMap(rotations);
}
