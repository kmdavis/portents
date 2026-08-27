/**
 * The standard tile format.
 *
 * A tile set is only useful if its tiles actually fit together. Two rules make
 * that true by construction rather than by luck:
 *
 * 1. **Every tile is the same size**, {@link STANDARD_TILE_SIZE} square.
 * 2. **Connectors sit at the centre of an edge, and nowhere else on the
 *    boundary.** With an odd size there is exactly one centre per edge, so a
 *    tile's east door is always opposite its neighbour's west door.
 *
 * Seven is the size because it is the smallest odd number that leaves a usable
 * 5×5 interior inside a wall ring, which is enough for pillars, a feature and
 * room to move around it. Five is too cramped for anything but a corridor; nine
 * makes a nine-tile map 25 columns wider than a terminal likes.
 *
 * Authoring by hand and hoping is not a plan, so {@link standardTileProblems}
 * checks a tile against the rules and the content package asserts it returns
 * nothing for every bundled tile.
 */

import { connects } from "./cells.ts";
import { type Edge, exitsOf, type Tile } from "./tile.ts";

export const STANDARD_TILE_SIZE = 7;

/** The one centre index of an edge, for a given tile size. */
export function edgeCentre(size: number = STANDARD_TILE_SIZE): number {
	if (size % 2 === 0) {
		throw new RangeError(`Tile size must be odd so each edge has a single centre; got ${size}`);
	}
	return (size - 1) / 2;
}

/** Where a connector must sit for each edge, as `[x, y]`. */
export function connectorPositions(size: number = STANDARD_TILE_SIZE): Record<Edge, [number, number]> {
	const centre = edgeCentre(size);
	return {
		north: [centre, 0],
		south: [centre, size - 1],
		west: [0, centre],
		east: [size - 1, centre],
	};
}

export interface StandardTileOptions {
	readonly size?: number;
}

/**
 * Everything wrong with a tile, as human-readable sentences. Empty means it
 * conforms.
 *
 * Returns a list rather than throwing on the first problem, so an author fixing
 * a tile sees all of it at once.
 */
export function standardTileProblems(tile: Tile, options: StandardTileOptions = {}): string[] {
	const size = options.size ?? STANDARD_TILE_SIZE;
	const problems: string[] = [];

	if (tile.width !== size || tile.height !== size) {
		problems.push(`is ${tile.width}×${tile.height}, but every standard tile must be ${size}×${size}`);
		// Positions below would be meaningless against the wrong grid.
		return problems;
	}

	const centre = edgeCentre(size);

	// Any connecting cell on the boundary that is not at an edge centre would
	// line up with solid wall on the neighbouring tile.
	for (let x = 0; x < size; x++) {
		for (const y of [0, size - 1]) {
			if (!connects(tile.cells[y][x]) || x === centre) continue;
			const edge = y === 0 ? "north" : "south";
			problems.push(
				`has a ${tile.cells[y][x]} at (${x},${y}) on the ${edge} edge; ` +
					`connectors must be at the edge centre, x=${centre}`,
			);
		}
	}
	for (let y = 0; y < size; y++) {
		for (const x of [0, size - 1]) {
			if (!connects(tile.cells[y][x]) || y === centre) continue;
			const edge = x === 0 ? "west" : "east";
			problems.push(
				`has a ${tile.cells[y][x]} at (${x},${y}) on the ${edge} edge; ` +
					`connectors must be at the edge centre, y=${centre}`,
			);
		}
	}

	if (exitsOf(tile).length === 0) {
		problems.push("has no exits, so it can never be placed");
	}

	// A corner is on two edges at once and can never be an edge centre, so it can
	// never legally connect. Called out separately because it is the easiest
	// mistake to make and the most confusing to debug.
	for (const [x, y] of [
		[0, 0],
		[size - 1, 0],
		[0, size - 1],
		[size - 1, size - 1],
	]) {
		if (connects(tile.cells[y][x])) {
			problems.push(`has a connector in the corner at (${x},${y}); corners can never line up with a neighbour`);
		}
	}

	return problems;
}

/** Whether a tile conforms to the standard format. */
export function isStandardTile(tile: Tile, options: StandardTileOptions = {}): boolean {
	return standardTileProblems(tile, options).length === 0;
}

/**
 * Throw with every problem listed. Use in a content pack's own tests or at load
 * time; `standardTileProblems` is the softer form for tooling.
 */
export function assertStandardTile(tile: Tile, options: StandardTileOptions = {}): void {
	const problems = standardTileProblems(tile, options);
	if (problems.length > 0) {
		throw new Error(`Tile "${tile.id}" is not a standard tile:\n  - ${problems.join("\n  - ")}`);
	}
}

/** Which edges a standard tile connects on. Cheap because positions are fixed. */
export function standardEdges(tile: Tile, options: StandardTileOptions = {}): Edge[] {
	const size = options.size ?? STANDARD_TILE_SIZE;
	const positions = connectorPositions(size);
	return (["north", "east", "south", "west"] as const).filter((edge) => {
		const [x, y] = positions[edge];
		return connects(tile.cells[y][x]);
	});
}
