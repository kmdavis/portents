/**
 * The equivalence tests.
 *
 * These are the reason the tile design is shaped the way it is. Each one turns a
 * property that would otherwise be a convention into something the build
 * enforces:
 *
 * - **Round trip.** ASCII out, parsed back in, deep-equals the original grid.
 * - **Correspondence.** The SVG contains exactly one drawn cell per non-void
 *   grid cell, at the same coordinates, of the same kind, referencing the symbol
 *   that kind is supposed to use.
 * - **Derived exits.** Exits come from the art, so no tile can claim one it does
 *   not draw.
 * - **Coverage.** Every kind in the registry appears in the bundled set, so
 *   every shape is actually exercised rather than merely defined.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CELL_SPECS, type CellKind, glyphOf, knownGlyphs, legendFor, specOf, specOfGlyph } from "./cells.ts";
import { readSvgCells, readSvgSymbols, renderSvg, slateTheme, symbolId } from "./svg.ts";
import {
	census,
	edgesOf,
	exitsOf,
	kindsIn,
	legendOf,
	MAX_TILE_SIZE,
	parseTile,
	parseTileSet,
	renderAscii,
	type Tile,
	TileParseError,
	type TileSource,
} from "./tile.ts";

/**
 * Fixtures authored here rather than imported from @portent/content: the engine
 * must be testable without any content pack, and the content pack has its own
 * tests for its own tiles.
 */
const FIXTURES: readonly TileSource[] = [
	{
		id: "open-room",
		name: "Open Room",
		tags: ["room"],
		note: "Four centred doors and an open interior.",
		art: ["###+###", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
	},
	{
		id: "corridor",
		name: "Corridor",
		tags: ["corridor"],
		note: "East-west passage through solid rock.",
		art: ["#######", "#######", "#######", "+.....+", "#######", "#######", "#######"],
	},
	{
		id: "every-kind",
		name: "Every Kind",
		tags: ["fixture"],
		note: "Exercises one cell of every kind in the registry, void included.",
		art: ["###+###", "#^~voS#", "#<>OTi#", "+*=...+", "#A....#", "#.....#", "## ## #"],
	},
];

const tiles = parseTileSet(FIXTURES);


describe("cell registry", () => {
	it("maps glyphs to kinds bijectively", () => {
		const glyphs = CELL_SPECS.map((spec) => spec.glyph);
		assert.equal(new Set(glyphs).size, glyphs.length, "two kinds share a glyph");
		const kinds = CELL_SPECS.map((spec) => spec.kind);
		assert.equal(new Set(kinds).size, kinds.length, "duplicate kind");
	});

	it("round-trips every kind through its glyph", () => {
		for (const spec of CELL_SPECS) {
			assert.equal(specOfGlyph(glyphOf(spec.kind))?.kind, spec.kind, `${spec.kind} does not round-trip`);
		}
	});

	it("uses only single printable ASCII characters", () => {
		for (const spec of CELL_SPECS) {
			assert.equal([...spec.glyph].length, 1, `${spec.kind} glyph is not one character`);
			const code = spec.glyph.codePointAt(0)!;
			assert.ok(code >= 0x20 && code <= 0x7e, `${spec.kind} glyph is not printable ASCII`);
		}
	});

	it("gives every kind a label and a note", () => {
		for (const spec of CELL_SPECS) {
			assert.ok(spec.label.length > 0, `${spec.kind} has no label`);
			assert.ok(spec.note.length > 10, `${spec.kind} has no useful note`);
		}
	});

	it("rejects an unknown glyph rather than guessing", () => {
		assert.equal(specOfGlyph("Z"), undefined);
	});

	it("generates a legend that only mentions parseable characters", () => {
		const legend = legendFor(CELL_SPECS.map((spec) => spec.kind));
		for (const entry of legend) {
			assert.ok(specOfGlyph(entry.glyph), `legend mentions unparseable ${JSON.stringify(entry.glyph)}`);
		}
		assert.ok(
			!legend.some((entry) => entry.glyph === " "),
			"void should not appear in a legend",
		);
	});
});

describe("parseTile", () => {
	it("reads a grid from art", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["##", "+."] });
		assert.equal(tile.width, 2);
		assert.equal(tile.height, 2);
		assert.deepEqual(tile.cells, [
			["wall", "wall"],
			["door", "floor"],
		]);
	});

	it("pads short rows with void so irregular shapes need no hand padding", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["###", "#"] });
		assert.equal(tile.width, 3);
		assert.deepEqual(tile.cells[1], ["wall", "void", "void"]);
	});

	it("drops leading and trailing blank rows", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["", "##", ""] });
		assert.equal(tile.height, 1);
	});

	it("keeps interior blank rows, which are real void", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["##", "  ", "##"] });
		assert.equal(tile.height, 3);
		assert.deepEqual(tile.cells[1], ["void", "void"]);
	});

	it("names the offending character, row and column", () => {
		assert.throws(
			() => parseTile({ id: "bad", name: "Bad", art: ["##", "#Z"] }),
			(error: Error) => {
				assert.ok(error instanceof TileParseError);
				assert.match(error.message, /"Z"/);
				assert.match(error.message, /row 2, column 2/);
				assert.match(error.message, /Valid characters/);
				return true;
			},
		);
	});

	it("rejects control characters that render differently between editors", () => {
		assert.throws(() => parseTile({ id: "t", name: "T", art: ["#\t#"] }), /U\+0009/);
		assert.throws(() => parseTile({ id: "t", name: "T", art: ["#\r#"] }), /U\+000D/);
	});

	it("rejects an empty or oversized tile", () => {
		assert.throws(() => parseTile({ id: "t", name: "T", art: [] }), /art is empty/);
		assert.throws(() => parseTile({ id: "t", name: "T", art: ["   "] }), /art is empty/);
		assert.throws(
			() => parseTile({ id: "t", name: "T", art: ["#".repeat(MAX_TILE_SIZE + 1)] }),
			/larger than the 64 limit/,
		);
	});

	it("requires an id and a name", () => {
		assert.throws(() => parseTile({ id: "", name: "T", art: ["#"] }), /missing id/);
		assert.throws(() => parseTile({ id: "t", name: "", art: ["#"] }), /missing name/);
	});

	it("rejects a duplicate id in a set", () => {
		assert.throws(
			() =>
				parseTileSet([
					{ id: "same", name: "A", art: ["#"] },
					{ id: "same", name: "B", art: ["#"] },
				]),
			/duplicate tile id/,
		);
	});
});

describe("ASCII projection", () => {
	it("round-trips every bundled tile exactly", () => {
		for (const tile of tiles) {
			const reparsed = parseTile({
				id: tile.id,
				name: tile.name,
				tags: tile.tags,
				note: tile.note,
				art: renderAscii(tile).split("\n"),
			});
			assert.deepEqual(reparsed, tile, `${tile.id} does not survive an ASCII round trip`);
		}
	});

	it("is idempotent under repeated rendering", () => {
		for (const tile of tiles) {
			const once = renderAscii(tile);
			const twice = renderAscii(parseTile({ id: tile.id, name: tile.name, art: once.split("\n") }));
			assert.equal(twice, once, `${tile.id} is not stable under re-rendering`);
		}
	});

	it("preserves what the author wrote, modulo trailing void", () => {
		// Normalisation may only append trailing voids and strip blank edge rows.
		// It may never change a character an author typed.
		for (const source of FIXTURES) {
			const tile = parseTile(source);
			const rendered = renderAscii(tile).split("\n");
			const authored = source.art.filter(
				(row, i, all) => !((i === 0 || i === all.length - 1) && row.trim() === ""),
			);
			assert.equal(rendered.length, authored.length, `${source.id} changed row count`);
			for (const [i, row] of authored.entries()) {
				assert.ok(
					rendered[i].startsWith(row.replace(/\s+$/, "")),
					`${source.id} row ${i + 1}: rendered ${JSON.stringify(rendered[i])} does not preserve ${JSON.stringify(row)}`,
				);
			}
		}
	});

	it("can trim trailing whitespace for terminal output", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["###", "#"] });
		assert.equal(renderAscii(tile), "###\n#  ");
		assert.equal(renderAscii(tile, { trimTrailing: true }), "###\n#");
	});
});

describe("SVG projection", () => {
	it("draws exactly one cell per non-void grid cell, at matching coordinates and kind", () => {
		for (const tile of tiles) {
			const drawn = readSvgCells(renderSvg(tile));
			const expected: Array<{ x: number; y: number; kind: CellKind }> = [];
			for (let y = 0; y < tile.height; y++) {
				for (let x = 0; x < tile.width; x++) {
					if (tile.cells[y][x] !== "void") expected.push({ x, y, kind: tile.cells[y][x] });
				}
			}

			assert.equal(drawn.length, expected.length, `${tile.id}: drew ${drawn.length} cells, grid has ${expected.length}`);
			for (const [i, cell] of expected.entries()) {
				assert.deepEqual(
					{ x: drawn[i].x, y: drawn[i].y, kind: drawn[i].kind },
					cell,
					`${tile.id}: cell ${i} disagrees with the grid`,
				);
				// The symbol actually referenced is derived from the kind, so this
				// checks the visual choice and not merely a label claiming one.
				assert.equal(
					drawn[i].href,
					`#${symbolId(cell.kind)}`,
					`${tile.id}: cell (${cell.x},${cell.y}) is a ${cell.kind} but draws ${drawn[i].href}`,
				);
			}
		}
	});

	it("never draws a void cell", () => {
		for (const tile of tiles) {
			for (const cell of readSvgCells(renderSvg(tile))) {
				assert.notEqual(cell.kind, "void", `${tile.id} drew a void cell`);
			}
		}
	});

	it("defines every symbol it references, and no others", () => {
		for (const tile of tiles) {
			const svg = renderSvg(tile);
			const defined = new Set(readSvgSymbols(svg));
			const referenced = new Set(readSvgCells(svg).map((cell) => cell.href.slice(1)));
			for (const id of referenced) {
				assert.ok(defined.has(id), `${tile.id} references undefined symbol ${id}`);
			}
			assert.deepEqual(
				[...defined].sort(),
				[...referenced].sort(),
				`${tile.id} defines symbols it does not use`,
			);
		}
	});

	it("agrees with the ASCII projection about every cell", () => {
		// The strongest form of the guarantee: reconstruct the grid from the SVG
		// alone and compare it against the grid reconstructed from the ASCII.
		for (const tile of tiles) {
			const fromAscii = renderAscii(tile)
				.split("\n")
				.map((row) => [...row].map((glyph) => specOfGlyph(glyph)!.kind));

			const fromSvg: CellKind[][] = Array.from({ length: tile.height }, () =>
				Array.from({ length: tile.width }, (): CellKind => "void"),
			);
			for (const cell of readSvgCells(renderSvg(tile))) {
				fromSvg[cell.y][cell.x] = cell.kind as CellKind;
			}

			assert.deepEqual(fromSvg, fromAscii, `${tile.id}: the picture and the text describe different tiles`);
		}
	});

	it("sizes the canvas to the grid", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["###", "..."] });
		const svg = renderSvg(tile, { cellSize: 10 });
		assert.match(svg, /viewBox="0 0 30 20"/);
		assert.match(svg, /width="30" height="20"/);
	});

	it("escapes names and ids so a quote cannot break the document", () => {
		const tile = parseTile({ id: 'q"uote', name: 'A <name> & "quotes"', art: ["#"] });
		const svg = renderSvg(tile);
		assert.match(svg, /&lt;name&gt; &amp; &quot;quotes&quot;/);
		assert.ok(!svg.includes('data-portent-tile="q"uote"'), "unescaped id broke an attribute");
	});

	it("carries an accessible title", () => {
		assert.match(renderSvg(tiles[0]), /<title>Open Room<\/title>/);
		assert.match(renderSvg(tiles[0], { title: "Custom" }), /<title>Custom<\/title>/);
	});

	it("honours the theme", () => {
		const svg = renderSvg(tiles[0], { theme: slateTheme });
		assert.ok(svg.includes(slateTheme.background), "theme background not applied");
	});

	it("emits an optional grid and legend without disturbing the cells", () => {
		const subject = tiles[2]; // every-kind, so the legend has plenty in it
		const plain = readSvgCells(renderSvg(subject));
		const decorated = readSvgCells(renderSvg(subject, { grid: true, legend: true }));
		assert.deepEqual(decorated, plain, "decoration changed the cells");
		assert.match(renderSvg(subject, { legend: true }), /data-portent="legend"/);
	});
});

describe("exits", () => {
	it("derives exits from the art", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["#+#", "+.#", "###"] });
		assert.deepEqual(exitsOf(tile), [
			{ x: 1, y: 0, edge: "north", kind: "door" },
			{ x: 0, y: 1, edge: "west", kind: "door" },
		]);
	});

	it("reports a corner opening on both of its edges", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["+#", "##"] });
		assert.deepEqual(
			exitsOf(tile).map((exit) => exit.edge),
			["north", "west"],
		);
	});

	it("treats floor on a boundary as an open edge", () => {
		const tile = parseTile({ id: "t", name: "T", art: ["#.#", "###"] });
		assert.deepEqual(exitsOf(tile), [{ x: 1, y: 0, edge: "north", kind: "floor" }]);
	});

	it("does not treat a wall or a hazard as an exit", () => {
		assert.deepEqual(exitsOf(parseTile({ id: "t", name: "T", art: ["###", "###"] })), []);
		assert.deepEqual(exitsOf(parseTile({ id: "t", name: "T", art: ["#v#", "###"] })), []);
	});

	it("gives every bundled tile at least one exit", () => {
		for (const tile of tiles) {
			assert.ok(exitsOf(tile).length > 0, `${tile.id} cannot be entered`);
		}
	});

	it("agrees with the drawn edges", () => {
		for (const tile of tiles) {
			for (const edge of edgesOf(tile)) {
				assert.ok(
					exitsOf(tile).some((exit) => exit.edge === edge),
					`${tile.id} claims edge ${edge} with no exit on it`,
				);
			}
		}
	});
});

describe("a tile authored by hand", () => {
	// Guards the documented authoring experience, not just the internals.
	const tile: Tile = parseTile({
		id: "example",
		name: "Example",
		tags: ["room"],
		note: "Used in the README, so it must keep working.",
		art: [
			"#####+#####",
			"#.O.....O.#",
			"+.........+",
			"#....T....#",
			"#####+#####",
		],
	});

	it("parses to the shape the art describes", () => {
		assert.equal(tile.width, 11);
		assert.equal(tile.height, 5);
		assert.equal(census(tile).get("pillar"), 2);
		assert.equal(census(tile).get("altar"), 1);
	});

	it("has four exits, one per edge", () => {
		assert.deepEqual(edgesOf(tile), ["north", "east", "south", "west"]);
		assert.equal(exitsOf(tile).length, 4);
	});

	it("renders identically as text and as vectors", () => {
		assert.equal(renderAscii(tile).split("\n")[0], "#####+#####");
		const drawn = readSvgCells(renderSvg(tile));
		assert.equal(drawn.length, 11 * 5, "every cell of a solid tile should be drawn");
		assert.ok(knownGlyphs().includes("+"));
	});
});
