/**
 * Composing tiles into a map.
 *
 * The payoff of the standard format: because every tile is the same size and
 * every connector sits at an edge centre, laying tiles on a lattice makes them
 * line up with no matching logic at all.
 *
 * The result is itself a {@link Tile}, which means the ASCII and SVG projections
 * work on a whole dungeon unchanged — and the equivalence guarantee they carry
 * extends to composed maps for free, rather than needing a second set of
 * renderers and a second set of tests.
 *
 * Tiles overlap by one cell so neighbours share a wall rather than drawing two.
 * That is what makes an assembled map read as one dungeon instead of a grid of
 * boxes, and it is why the merge rule below matters.
 */

import type { CellKind } from "./cells.ts";
import { connects } from "./cells.ts";
import { STANDARD_TILE_SIZE } from "./standard.ts";
import { renderAscii, type Tile, type TileSource } from "./tile.ts";

/**
 * Resolve two cells that land on the same coordinate in an overlap.
 *
 * The rule, in order:
 *
 * 1. Identical kinds merge to themselves.
 * 2. `void` yields to anything real, so an irregular cave tile does not punch a
 *    hole in its neighbour's wall.
 * 3. **Two connectors merge only if both sides connect**, and the more specific
 *    kind wins (a door beside a floor gives a door).
 * 4. Otherwise the seam is **sealed to wall**.
 *
 * Rule 4 is the important one. If tile A has a south door and tile B's north
 * edge is solid, the honest answer is a wall: a door opening onto rock is a lie
 * the map would tell every time someone looked at it. Sealing means an
 * assembled map never shows an exit that does not go anywhere.
 */
export function mergeCells(a: CellKind, b: CellKind): CellKind {
	if (a === b) return a;
	if (a === "void") return b;
	if (b === "void") return a;

	if (connects(a) && connects(b)) {
		// Prefer the deliberate opening over plain floor.
		if (a === "floor") return b;
		if (b === "floor") return a;
		return a;
	}

	return "wall";
}

export interface ComposeOptions {
	/** Tile edge length. Defaults to the standard 7. */
	readonly size?: number;
	/**
	 * How many cells adjacent tiles share. 1 means a shared wall, which is
	 * almost always what you want. 0 butts them together with doubled walls.
	 */
	readonly overlap?: number;
	readonly id?: string;
	readonly name?: string;
}

export interface ComposedMap extends Tile {
	/** Lattice dimensions, in tiles. */
	readonly cols: number;
	readonly rows: number;
	/** Which tile occupies each lattice cell, by id. `null` for a gap. */
	readonly placement: readonly (readonly (string | null)[])[];
	readonly tileSize: number;
	readonly overlap: number;
}

/**
 * Lay a lattice of tiles out into one large tile.
 *
 * `lattice[row][col]` may be `null` to leave a gap, which composes as void and
 * therefore draws nothing.
 *
 * ```ts
 * const map = composeTiles([
 *   [hall, corridor, room],
 *   [corridor, null, stair],
 * ]);
 * renderAscii(map);  // the whole dungeon as text
 * renderSvg(map);    // the same dungeon as vectors
 * ```
 */
export function composeTiles(
	lattice: readonly (readonly (Tile | null)[])[],
	options: ComposeOptions = {},
): ComposedMap {
	const size = options.size ?? STANDARD_TILE_SIZE;
	const overlap = options.overlap ?? 1;

	if (lattice.length === 0 || lattice.every((row) => row.length === 0)) {
		throw new RangeError("composeTiles: lattice is empty");
	}
	if (overlap < 0 || overlap >= size) {
		throw new RangeError(`composeTiles: overlap must be between 0 and ${size - 1}, got ${overlap}`);
	}

	const rows = lattice.length;
	const cols = Math.max(...lattice.map((row) => row.length));

	for (const row of lattice) {
		for (const tile of row) {
			if (tile && (tile.width !== size || tile.height !== size)) {
				throw new RangeError(
					`composeTiles: tile "${tile.id}" is ${tile.width}×${tile.height}, expected ${size}×${size}. ` +
						"Compose only works on same-sized tiles; check it with standardTileProblems first.",
				);
			}
		}
	}

	const stride = size - overlap;
	const width = cols * stride + overlap;
	const height = rows * stride + overlap;

	const cells: CellKind[][] = Array.from({ length: height }, () =>
		Array.from({ length: width }, (): CellKind => "void"),
	);

	for (const [row, tiles] of lattice.entries()) {
		for (const [col, tile] of tiles.entries()) {
			if (!tile) continue;
			const originX = col * stride;
			const originY = row * stride;
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const targetY = originY + y;
					const targetX = originX + x;
					cells[targetY][targetX] = mergeCells(cells[targetY][targetX], tile.cells[y][x]);
				}
			}
		}
	}

	return {
		id: options.id ?? "composed-map",
		name: options.name ?? `${cols}×${rows} map`,
		tags: ["composed"],
		note: undefined,
		width,
		height,
		cells: cells.map((row) => Object.freeze(row)),
		cols,
		rows,
		placement: lattice.map((row) =>
			Object.freeze(Array.from({ length: cols }, (_, col) => row[col]?.id ?? null)),
		),
		tileSize: size,
		overlap,
	};
}

/** The lattice cell a composed-map coordinate falls in. */
export function tileAt(map: ComposedMap, x: number, y: number): { col: number; row: number; id: string | null } {
	const stride = map.tileSize - map.overlap;
	const col = Math.min(map.cols - 1, Math.floor(x / stride));
	const row = Math.min(map.rows - 1, Math.floor(y / stride));
	return { col, row, id: map.placement[row]?.[col] ?? null };
}

/**
 * Serialise any tile, composed maps included, back to a tile source so it can be
 * saved as text and parsed again later. Round-trips through `parseTile`.
 */
export function toTileSource(tile: Tile): TileSource {
	return {
		id: tile.id,
		name: tile.name,
		tags: tile.tags,
		note: tile.note,
		art: renderAscii(tile).split("\n"),
	};
}
