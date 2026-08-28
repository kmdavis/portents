/**
 * Tiles — parsing authored art into a grid, and projecting that grid back out.
 *
 * A tile is authored *as* its ASCII art. The art is parsed once into an
 * immutable grid of {@link CellKind}, and every projection — ASCII, SVG, exits,
 * legend, and any future raster renderer — reads that one grid. ASCII is
 * therefore not a rendering that could disagree with the picture; it is the
 * authoring format, and the picture is derived from it.
 *
 * ## Art format
 *
 * Art is an array of strings, one per row. No dedenting happens, because a
 * leading space is a meaningful `void` cell and stripping it would silently
 * reshape the tile.
 *
 * - Every character must be in the cell registry. An unknown character throws
 *   with the list of valid ones rather than being guessed at.
 * - Tabs, carriage returns and any other control character are rejected: they
 *   render differently in different editors, and a tile that looks right in one
 *   place and wrong in another is exactly the failure this design exists to
 *   prevent.
 * - Rows shorter than the widest row are padded on the right with `void`. That
 *   is lossless — trailing void draws nothing — and it means an author need not
 *   pad irregular cave shapes by hand.
 * - Rows may not exceed {@link MAX_TILE_SIZE} in either direction.
 * - Leading and trailing entirely-blank rows are dropped, so a template literal
 *   can start on the line after the backtick.
 */

import { type CellKind, connects, glyphOf, knownGlyphs, legendFor, specOfGlyph } from "./cells.ts";

export const MAX_TILE_SIZE = 64;

/** What an author writes. */
export interface TileSource {
	/** Stable id, unique within a tile set. */
	readonly id: string;
	readonly name: string;
	/** Freeform classification: "junction", "corridor", "room", "hazard". */
	readonly tags?: readonly string[];
	/** One or two sentences of GM-facing colour. Not rendered into the grid. */
	readonly note?: string;
	/** The art, one string per row. */
	readonly art: readonly string[];
}

/** A parsed tile. Immutable; the single source every projection reads. */
export interface Tile {
	readonly id: string;
	readonly name: string;
	readonly tags: readonly string[];
	readonly note: string | undefined;
	readonly width: number;
	readonly height: number;
	/** `cells[y][x]`. Rectangular: every row is exactly `width` long. */
	readonly cells: readonly (readonly CellKind[])[];
}

export class TileParseError extends Error {
	readonly tileId: string;
	constructor(tileId: string, message: string) {
		super(`Tile ${JSON.stringify(tileId)}: ${message}`);
		this.name = "TileParseError";
		this.tileId = tileId;
	}
}

function describeGlyph(glyph: string): string {
	const code = glyph.codePointAt(0) ?? 0;
	const printable = code >= 0x20 && code <= 0x7e;
	return printable
		? JSON.stringify(glyph)
		: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Parse authored art into a grid. Throws {@link TileParseError} on anything ambiguous. */
export function parseTile(source: TileSource): Tile {
	const { id } = source;
	if (!id) throw new TileParseError(String(id), "missing id");
	if (!source.name) throw new TileParseError(id, "missing name");

	// Drop leading and trailing blank rows so template-literal authoring reads well.
	const rows = [...source.art];
	while (rows.length > 0 && rows[0].trim() === "") rows.shift();
	while (rows.length > 0 && rows[rows.length - 1].trim() === "") rows.pop();
	if (rows.length === 0) throw new TileParseError(id, "art is empty");

	const height = rows.length;
	const width = Math.max(...rows.map((row) => [...row].length));
	if (width === 0) throw new TileParseError(id, "art has no columns");
	if (width > MAX_TILE_SIZE || height > MAX_TILE_SIZE) {
		throw new TileParseError(id, `art is ${width}x${height}, larger than the ${MAX_TILE_SIZE} limit`);
	}

	const cells: CellKind[][] = [];
	for (const [y, row] of rows.entries()) {
		const chars = [...row];
		const line: CellKind[] = [];
		for (const [x, glyph] of chars.entries()) {
			const spec = specOfGlyph(glyph);
			if (!spec) {
				throw new TileParseError(
					id,
					`unknown character ${describeGlyph(glyph)} at row ${y + 1}, column ${x + 1}. ` +
						`Valid characters: ${knownGlyphs().map(describeGlyph).join(" ")}`,
				);
			}
			line.push(spec.kind);
		}
		// Pad short rows with void, which draws nothing.
		while (line.length < width) line.push("void");
		cells.push(line);
	}

	return {
		id,
		name: source.name,
		tags: source.tags ? [...source.tags] : [],
		note: source.note,
		width,
		height,
		cells: cells.map((row) => Object.freeze(row)),
	};
}

/**
 * The tile as ASCII, using the registry glyphs.
 *
 * Round-trips: `parseTile({ ...src, art: renderAscii(parseTile(src)).split("\n") })`
 * deep-equals `parseTile(src)`. The test suite asserts this for every tile.
 */
export function renderAscii(tile: Tile, opts: { trimTrailing?: boolean } = {}): string {
	const lines = tile.cells.map((row) => row.map(glyphOf).join(""));
	return (opts.trimTrailing ? lines.map((line) => line.replace(/\s+$/, "")) : lines).join("\n");
}

export type Edge = "north" | "south" | "east" | "west";

export interface Exit {
	readonly x: number;
	readonly y: number;
	readonly edge: Edge;
	readonly kind: CellKind;
}

/**
 * Where this tile can join another, derived from the grid.
 *
 * A cell yields an exit when it is on the grid boundary and its kind
 * `connects`. Corners on two boundaries yield two exits, one per edge, because
 * a corner door genuinely opens in two directions and a caller matching edges
 * needs both.
 *
 * Nothing is hand-declared, so a tile cannot claim an exit its art does not
 * have — which is precisely what the old prose-and-art tiles allowed.
 */
export function exitsOf(tile: Tile): Exit[] {
	const out: Exit[] = [];
	const add = (x: number, y: number, edge: Edge) => {
		const kind = tile.cells[y][x];
		if (connects(kind)) out.push({ x, y, edge, kind });
	};

	for (let x = 0; x < tile.width; x++) {
		add(x, 0, "north");
		if (tile.height > 1) add(x, tile.height - 1, "south");
	}
	for (let y = 0; y < tile.height; y++) {
		add(0, y, "west");
		if (tile.width > 1) add(tile.width - 1, y, "east");
	}

	return out.sort((a, b) => a.edge.localeCompare(b.edge) || a.y - b.y || a.x - b.x);
}

/** Which edges this tile can be entered from. */
export function edgesOf(tile: Tile): Edge[] {
	const edges = new Set(exitsOf(tile).map((exit) => exit.edge));
	return (["north", "east", "south", "west"] as const).filter((edge) => edges.has(edge));
}

/** Every kind present, in registry order, void excluded. */
export function kindsIn(tile: Tile): CellKind[] {
	const present = new Set<CellKind>();
	for (const row of tile.cells) for (const kind of row) present.add(kind);
	present.delete("void");
	return [...present];
}

/** A legend for exactly the kinds this tile uses. */
export function legendOf(tile: Tile): Array<{ glyph: string; label: string; note: string }> {
	return legendFor(kindsIn(tile));
}

/** Count of cells of each kind. Used by tests and by tile-set statistics. */
export function census(tile: Tile): Map<CellKind, number> {
	const counts = new Map<CellKind, number>();
	for (const row of tile.cells) {
		for (const kind of row) counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	return counts;
}

/** Parse a whole set, failing on a duplicate id. */
export function parseTileSet(sources: readonly TileSource[]): Tile[] {
	const seen = new Set<string>();
	return sources.map((source) => {
		if (seen.has(source.id)) throw new TileParseError(source.id, "duplicate tile id in set");
		seen.add(source.id);
		return parseTile(source);
	});
}
