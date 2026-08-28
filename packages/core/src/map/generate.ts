/**
 * Dungeon generation by tile matching.
 *
 * Connectivity first, tiles second. Most tile-based generators place a tile and
 * then try to find neighbours that fit, which paints itself into corners and
 * produces disconnected fragments. This does the opposite:
 *
 * 1. Carve a spanning tree over the lattice with a randomised depth-first walk.
 *    Every cell is reachable from every other cell because a spanning tree says
 *    so, before any tile has been chosen.
 * 2. Optionally add extra edges to make loops, because a dungeon that is a pure
 *    tree is a dungeon of dead ends.
 * 3. Each cell now has a required signature: the exact set of edges that must be
 *    open. Pick, seeded-randomly, a tile whose signature matches.
 *
 * Step 3 is only possible because of the standard tile format and rotation. A
 * signature is four bits, so there are sixteen; with rotations, one authored
 * tile per shape class — dead end, straight, bend, T, cross — covers all of
 * them. Which means a small hand-authored set generates every layout.
 */

import type { RandomSource } from "../ports/random.ts";
import { defaultRandomSource, seededRandomSource } from "../ports/random.ts";
import { connects } from "../tiles/cells.ts";
import { composeTiles, type ComposedMap } from "../tiles/layout.ts";
import { connectorPositions, STANDARD_TILE_SIZE, standardTileProblems } from "../tiles/standard.ts";
import type { Edge, Tile } from "../tiles/tile.ts";
import { withRotations } from "../tiles/transform.ts";

const EDGES: readonly Edge[] = ["north", "east", "south", "west"];

/** Bit per edge, so a signature is a number 0-15 and matching is an equality test. */
const EDGE_BIT: Record<Edge, number> = { north: 1, east: 2, south: 4, west: 8 };

const OPPOSITE: Record<Edge, Edge> = { north: "south", south: "north", east: "west", west: "east" };

const STEP: Record<Edge, readonly [number, number]> = {
	north: [0, -1],
	south: [0, 1],
	east: [1, 0],
	west: [-1, 0],
};

/** Which edges of a standard tile connect, as a bitmask. */
export function tileSignature(tile: Tile, size = STANDARD_TILE_SIZE): number {
	const positions = connectorPositions(size);
	let signature = 0;
	for (const edge of EDGES) {
		const [x, y] = positions[edge];
		if (connects(tile.cells[y][x])) signature |= EDGE_BIT[edge];
	}
	return signature;
}

export function describeSignature(signature: number): string {
	const parts = EDGES.filter((edge) => signature & EDGE_BIT[edge]);
	return parts.length > 0 ? parts.join("+") : "sealed";
}

export interface GenerateOptions {
	readonly cols: number;
	readonly rows: number;
	/** Seed for reproducibility. A map can be stored as a seed plus a size. */
	readonly seed?: string;
	readonly rng?: RandomSource;
	/**
	 * Chance of adding each candidate extra connection beyond the spanning tree,
	 * creating loops. 0 gives a pure tree of dead ends; 1 opens every wall.
	 * Default 0.15.
	 */
	readonly loopChance?: number;
	/**
	 * Fraction of lattice cells left empty. Gaps are carved before the spanning
	 * tree, so the remainder stays connected. Default 0.
	 */
	readonly gapChance?: number;
	/**
	 * How many ways in from outside the lattice. Default 1.
	 *
	 * A dungeon with no entrance is not a dungeon, and without this a one-cell
	 * lattice would need a tile with no exits at all — which cannot exist, since a
	 * sealed tile fails the standard format. An entrance door sits on the map
	 * boundary and opens outward.
	 */
	readonly entrances?: number;
	readonly size?: number;
	readonly id?: string;
	readonly name?: string;
}

export interface GeneratedDungeon {
	readonly map: ComposedMap;
	readonly seed: string;
	/** `lattice[row][col]`, matching the composed map's placement. */
	readonly lattice: readonly (readonly (Tile | null)[])[];
	/** Required signature per cell, for debugging a disappointing layout. */
	readonly signatures: readonly (readonly number[])[];
	/**
	 * Ways in, as lattice position plus the edge that opens outward, and the map
	 * coordinate of the doorway. Put the party on one of these.
	 */
	readonly entrances: readonly {
		readonly col: number;
		readonly row: number;
		readonly edge: Edge;
		readonly x: number;
		readonly y: number;
	}[];
}

export class GenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GenerationError";
	}
}

/**
 * Index the tile set by signature, including rotations.
 *
 * Exported because a caller may want to check coverage before generating, and
 * because the error message for a missing signature is much more useful than a
 * failed generation.
 */
export function indexBySignature(tiles: readonly Tile[], size = STANDARD_TILE_SIZE): Map<number, Tile[]> {
	const index = new Map<number, Tile[]>();
	for (const tile of withRotations(tiles)) {
		const problems = standardTileProblems(tile, { size });
		if (problems.length > 0) {
			throw new GenerationError(
				`Tile "${tile.id}" cannot be used for generation: ${problems.join("; ")}`,
			);
		}
		const signature = tileSignature(tile, size);
		const bucket = index.get(signature);
		if (bucket) bucket.push(tile);
		else index.set(signature, [tile]);
	}
	return index;
}

/** Signatures a set cannot produce, as readable names. Empty means full coverage. */
export function missingSignatures(tiles: readonly Tile[], size = STANDARD_TILE_SIZE): string[] {
	const index = indexBySignature(tiles, size);
	const missing: string[] = [];
	for (let signature = 1; signature < 16; signature++) {
		if (!index.has(signature)) missing.push(describeSignature(signature));
	}
	return missing;
}

export function generateDungeon(tiles: readonly Tile[], options: GenerateOptions): GeneratedDungeon {
	const size = options.size ?? STANDARD_TILE_SIZE;
	const cols = Math.max(1, Math.floor(options.cols));
	const rows = Math.max(1, Math.floor(options.rows));
	const seed = options.seed ?? Math.random().toString(36).slice(2, 10);
	const rng = options.rng ?? (options.seed ? seededRandomSource(seed) : defaultRandomSource());
	const loopChance = options.loopChance ?? 0.15;
	const gapChance = options.gapChance ?? 0;

	const index = indexBySignature(tiles, size);

	// ── 1. Decide which cells exist ──────────────────────────────────────────
	const present: boolean[][] = Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => true),
	);
	if (gapChance > 0) {
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (rng.float() < gapChance) present[row][col] = false;
			}
		}
	}
	// A gap-riddled lattice can strand cells, so keep only the largest connected
	// blob of present cells. Better a smaller connected dungeon than a bigger
	// broken one.
	keepLargestBlob(present, cols, rows);
	if (!present.some((row) => row.some(Boolean))) {
		// Everything was carved away; put one cell back rather than failing.
		present[Math.floor(rows / 2)][Math.floor(cols / 2)] = true;
	}

	// ── 2. Spanning tree over the present cells ──────────────────────────────
	const open: Array<Array<Set<Edge>>> = Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => new Set<Edge>()),
	);
	const visited: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

	const start = firstPresent(present, cols, rows)!;
	const stack: Array<[number, number]> = [start];
	visited[start[1]][start[0]] = true;

	while (stack.length > 0) {
		const [col, row] = stack[stack.length - 1];
		const candidates = EDGES.filter((edge) => {
			const [dx, dy] = STEP[edge];
			const nc = col + dx;
			const nr = row + dy;
			return (
				nc >= 0 && nr >= 0 && nc < cols && nr < rows && present[nr][nc] && !visited[nr][nc]
			);
		});

		if (candidates.length === 0) {
			stack.pop();
			continue;
		}

		const edge = rng.pick(candidates);
		const [dx, dy] = STEP[edge];
		const nc = col + dx;
		const nr = row + dy;
		open[row][col].add(edge);
		open[nr][nc].add(OPPOSITE[edge]);
		visited[nr][nc] = true;
		stack.push([nc, nr]);
	}

	// ── 3. Entrances from outside the lattice ────────────────────────────────
	const entranceCount = Math.max(0, Math.floor(options.entrances ?? 1));
	const entrances: Array<{ col: number; row: number; edge: Edge; x: number; y: number }> = [];
	if (entranceCount > 0) {
		// Every (cell, edge) pair that faces off the lattice.
		const candidates: Array<{ col: number; row: number; edge: Edge }> = [];
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (!present[row][col]) continue;
				for (const edge of EDGES) {
					const [dx, dy] = STEP[edge];
					const nc = col + dx;
					const nr = row + dy;
					const outside = nc < 0 || nr < 0 || nc >= cols || nr >= rows || !present[nr][nc];
					if (outside && !open[row][col].has(edge)) candidates.push({ col, row, edge });
				}
			}
		}
		const stride = size - 1;
		const positions = connectorPositions(size);
		for (const chosen of rng.shuffle(candidates).slice(0, entranceCount)) {
			open[chosen.row][chosen.col].add(chosen.edge);
			const [localX, localY] = positions[chosen.edge];
			entrances.push({
				...chosen,
				x: chosen.col * stride + localX,
				y: chosen.row * stride + localY,
			});
		}
	}

	// ── 4. Extra connections, for loops ──────────────────────────────────────
	if (loopChance > 0) {
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (!present[row][col]) continue;
				for (const edge of ["east", "south"] as const) {
					const [dx, dy] = STEP[edge];
					const nc = col + dx;
					const nr = row + dy;
					if (nc >= cols || nr >= rows || !present[nr][nc]) continue;
					if (open[row][col].has(edge)) continue;
					if (rng.float() >= loopChance) continue;
					open[row][col].add(edge);
					open[nr][nc].add(OPPOSITE[edge]);
				}
			}
		}
	}

	// ── 5. Choose a tile matching each cell's signature ──────────────────────
	const lattice: (Tile | null)[][] = [];
	const signatures: number[][] = [];

	for (let row = 0; row < rows; row++) {
		const latticeRow: (Tile | null)[] = [];
		const signatureRow: number[] = [];
		for (let col = 0; col < cols; col++) {
			if (!present[row][col]) {
				latticeRow.push(null);
				signatureRow.push(0);
				continue;
			}
			let signature = 0;
			for (const edge of open[row][col]) signature |= EDGE_BIT[edge];
			signatureRow.push(signature);

			const bucket = index.get(signature);
			if (!bucket || bucket.length === 0) {
				throw new GenerationError(
					`No tile connects exactly ${describeSignature(signature)}, needed at column ${col}, row ${row}. ` +
						`The set covers: ${[...index.keys()].map(describeSignature).sort().join(", ")}. ` +
						"Add a tile with that shape, or one that rotates into it.",
				);
			}
			latticeRow.push(rng.pick(bucket));
		}
		lattice.push(latticeRow);
		signatures.push(signatureRow);
	}

	const map = composeTiles(lattice, {
		size,
		id: options.id ?? `dungeon-${seed}`,
		name: options.name ?? `Dungeon ${seed}`,
	});

	return { map, seed, lattice, signatures, entrances };
}

function firstPresent(present: boolean[][], cols: number, rows: number): [number, number] | undefined {
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) if (present[row][col]) return [col, row];
	}
	return undefined;
}

/** Erase every present cell that is not in the largest orthogonally connected group. */
function keepLargestBlob(present: boolean[][], cols: number, rows: number): void {
	const seen: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
	let best: Array<[number, number]> = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			if (!present[row][col] || seen[row][col]) continue;
			const blob: Array<[number, number]> = [];
			const queue: Array<[number, number]> = [[col, row]];
			seen[row][col] = true;
			while (queue.length > 0) {
				const [c, r] = queue.pop()!;
				blob.push([c, r]);
				for (const [dx, dy] of Object.values(STEP)) {
					const nc = c + dx;
					const nr = r + dy;
					if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
					if (!present[nr][nc] || seen[nr][nc]) continue;
					seen[nr][nc] = true;
					queue.push([nc, nr]);
				}
			}
			if (blob.length > best.length) best = blob;
		}
	}

	const keep = new Set(best.map(([c, r]) => r * cols + c));
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			if (present[row][col] && !keep.has(row * cols + col)) present[row][col] = false;
		}
	}
}
