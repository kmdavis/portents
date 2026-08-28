/**
 * Field of view.
 *
 * Recursive shadowcasting over eight octants. Each octant is scanned row by row
 * away from the origin, tracking the slope range still lit; an opaque cell
 * splits that range and the shadow it casts is carried into the following rows.
 * That is what makes pillars, doorways and corners behave the way a player
 * expects: standing beside a pillar you can see past it on both sides, and
 * standing in a doorway you can see the room beyond but not along the wall you
 * are standing in.
 *
 * Chosen over a naive ray cast because ray casting misses cells no ray happens
 * to hit, which shows up as speckled holes in the middle of a lit room.
 *
 * Opacity comes from the cell registry, not from passability: a chasm blocks
 * movement but not sight, and a closed door blocks sight but can be opened.
 */

import { type CellKind, isOpaque, isPassable } from "../tiles/cells.ts";
import type { Tile } from "../tiles/tile.ts";

/**
 * A set of cells, keyed by `y * width + x`.
 *
 * An integer set rather than a `Set<string>` because a field of view over a
 * large map touches tens of thousands of cells and string keys make that
 * allocation-heavy for no benefit.
 */
export type CellSet = Set<number>;

export function cellKey(x: number, y: number, width: number): number {
	return y * width + x;
}

export function cellFromKey(key: number, width: number): { x: number; y: number } {
	return { x: key % width, y: Math.floor(key / width) };
}

export interface Position {
	readonly x: number;
	readonly y: number;
}

export interface FovOptions {
	/**
	 * How far sight reaches, in cells. Omit for unlimited, which is the right
	 * default for a GM looking at a lit dungeon.
	 */
	readonly radius?: number;
	/**
	 * Treat the map edge as visible wall rather than nothing. Defaults to true so
	 * a lit room shows its own walls.
	 */
	readonly includeWalls?: boolean;
	/** Override opacity, e.g. to open a specific door for one calculation. */
	readonly isOpaqueAt?: (x: number, y: number, kind: CellKind) => boolean;
}

/** Eight octants as (dx along the row, dy along the column, transposed). */
const OCTANTS: ReadonlyArray<readonly [number, number, boolean]> = [
	[1, 1, false],
	[1, -1, false],
	[-1, 1, false],
	[-1, -1, false],
	[1, 1, true],
	[1, -1, true],
	[-1, 1, true],
	[-1, -1, true],
];

/**
 * Every cell visible from `origins`, as the union of each origin's field of view.
 *
 * Multiple origins because a party has several members, and what the party knows
 * is what any of them can see.
 */
export function computeFov(tile: Tile, origins: readonly Position[], options: FovOptions = {}): CellSet {
	const visible: CellSet = new Set();
	const radius = options.radius ?? Number.POSITIVE_INFINITY;
	const includeWalls = options.includeWalls ?? true;

	const opaqueAt = (x: number, y: number): boolean => {
		const kind = tile.cells[y][x];
		return options.isOpaqueAt ? options.isOpaqueAt(x, y, kind) : isOpaque(kind);
	};

	const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < tile.width && y < tile.height;

	const reveal = (x: number, y: number): void => {
		if (!inBounds(x, y)) return;
		if (!includeWalls && opaqueAt(x, y)) return;
		visible.add(cellKey(x, y, tile.width));
	};

	for (const origin of origins) {
		if (!inBounds(origin.x, origin.y)) continue;
		// You can always see your own square.
		visible.add(cellKey(origin.x, origin.y, tile.width));

		for (const [dx, dy, transposed] of OCTANTS) {
			scanOctant(1, 1, 0, origin, dx, dy, transposed, radius, opaqueAt, inBounds, reveal);
		}
	}

	return visible;
}

/**
 * Scan one octant.
 *
 * `startSlope` and `endSlope` bound the lit wedge. Depth counts rows away from
 * the origin. When an opaque cell is found, the wedge is split: the part before
 * it recurses immediately at the next depth, and the scan continues after it.
 */
function scanOctant(
	depth: number,
	startSlope: number,
	endSlope: number,
	origin: Position,
	dx: number,
	dy: number,
	transposed: boolean,
	radius: number,
	opaqueAt: (x: number, y: number) => boolean,
	inBounds: (x: number, y: number) => boolean,
	reveal: (x: number, y: number) => void,
): void {
	if (startSlope < endSlope) return;

	let nextStartSlope = startSlope;
	let previousWasOpaque = false;

	for (let row = depth; row <= radius; row++) {
		let anythingInBounds = false;

		for (let column = row; column >= 0; column--) {
			const upperSlope = (column + 0.5) / (row - 0.5);
			const lowerSlope = (column - 0.5) / (row + 0.5);

			if (lowerSlope > nextStartSlope) continue;
			if (upperSlope < endSlope) break;

			// Map octant coordinates back onto the grid.
			const offsetX = transposed ? column * dx : row * dx;
			const offsetY = transposed ? row * dy : column * dy;
			const x = origin.x + offsetX;
			const y = origin.y + offsetY;

			if (!inBounds(x, y)) continue;
			anythingInBounds = true;

			// Circular radius, so a torch lights a disc rather than a square.
			if (Number.isFinite(radius) && Math.hypot(offsetX, offsetY) > radius + 0.5) continue;

			reveal(x, y);

			const opaque = opaqueAt(x, y);
			if (previousWasOpaque) {
				if (opaque) {
					nextStartSlope = lowerSlope;
				} else {
					previousWasOpaque = false;
					startSlope = nextStartSlope;
				}
				continue;
			}

			if (!opaque) continue;

			// An opaque cell in open ground casts a shadow. Everything above it is
			// still lit, so recurse on that wedge before continuing below it.
			previousWasOpaque = true;
			scanOctant(
				row + 1,
				startSlope,
				upperSlope,
				origin,
				dx,
				dy,
				transposed,
				radius,
				opaqueAt,
				inBounds,
				reveal,
			);
			nextStartSlope = lowerSlope;
		}

		// Once a whole row is out of bounds or fully shadowed there is nothing beyond it.
		if (!anythingInBounds || previousWasOpaque) break;
	}
}

/** Whether a cell is in a computed set. */
export function isVisible(set: CellSet, x: number, y: number, width: number): boolean {
	return set.has(cellKey(x, y, width));
}

/** Straight-line visibility between two cells, for a single check. */
export function hasLineOfSight(tile: Tile, from: Position, to: Position, options: FovOptions = {}): boolean {
	const fov = computeFov(tile, [from], options);
	return fov.has(cellKey(to.x, to.y, tile.width));
}

/**
 * Cells reachable within `radius` steps, ignoring sight. For movement hints.
 *
 * Uses passability, not opacity: a chasm is transparent but you cannot walk into
 * it, and a closed door blocks sight but can be opened and walked through.
 */
export function reachableCells(tile: Tile, origin: Position, radius: number): CellSet {
	const out: CellSet = new Set();
	const queue: Array<Position & { cost: number }> = [{ ...origin, cost: 0 }];
	const seen = new Set<number>([cellKey(origin.x, origin.y, tile.width)]);

	while (queue.length > 0) {
		const current = queue.shift()!;
		out.add(cellKey(current.x, current.y, tile.width));
		if (current.cost >= radius) continue;
		for (const [dx, dy] of [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		]) {
			const x = current.x + dx;
			const y = current.y + dy;
			if (x < 0 || y < 0 || x >= tile.width || y >= tile.height) continue;
			const key = cellKey(x, y, tile.width);
			if (seen.has(key)) continue;
			const kind = tile.cells[y][x];
			if (kind === "void") continue;
			seen.add(key);
			if (isPassable(kind)) queue.push({ x, y, cost: current.cost + 1 });
		}
	}
	return out;
}
