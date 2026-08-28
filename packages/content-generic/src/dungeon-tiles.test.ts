/**
 * Tests for the tile pack itself, as opposed to the engine that parses it.
 *
 * The engine's own equivalence tests live in `@portents/core`. What matters here
 * is that this data conforms: every tile is 7×7, every connector is centred,
 * every registry kind is exercised, and the two projections agree about each
 * tile in the pack.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CELL_SPECS,
	type CellKind,
	census,
	composeTiles,
	connectorPositions,
	describeSignature,
	generateDungeon,
	indexBySignature,
	missingSignatures,
	reachableCells,
	tileSignature,
	kindsIn,
	legendOf,
	parseTile,
	parseTileSet,
	readSvgCells,
	renderAscii,
	renderSvg,
	specOf,
	STANDARD_TILE_SIZE,
	standardEdges,
	standardTileProblems,
} from "@portents/core";
import { dungeonTiles } from "./dungeon-tiles.ts";

const tiles = parseTileSet(dungeonTiles);

describe("the dungeon tile pack", () => {
	it("parses", () => {
		assert.ok(tiles.length >= 20, `only ${tiles.length} tiles`);
	});

	it("conforms to the standard format, tile by tile", () => {
		const failures = tiles
			.map((tile) => ({ id: tile.id, problems: standardTileProblems(tile) }))
			.filter(({ problems }) => problems.length > 0)
			.map(({ id, problems }) => `${id}: ${problems.join("; ")}`);
		assert.deepEqual(failures, [], `\n${failures.join("\n")}`);
	});

	it("is uniformly 7 by 7", () => {
		for (const tile of tiles) {
			assert.equal(tile.width, STANDARD_TILE_SIZE, `${tile.id} width`);
			assert.equal(tile.height, STANDARD_TILE_SIZE, `${tile.id} height`);
		}
	});

	it("puts every door at the centre of its wall", () => {
		const positions = connectorPositions();
		for (const tile of tiles) {
			for (const edge of standardEdges(tile)) {
				const [x, y] = positions[edge];
				assert.equal(
					x === 0 || x === STANDARD_TILE_SIZE - 1 ? y : x,
					3,
					`${tile.id} ${edge} connector is not centred`,
				);
			}
		}
	});

	it("gives every tile at least one exit", () => {
		for (const tile of tiles) {
			assert.ok(standardEdges(tile).length > 0, `${tile.id} can never be placed`);
		}
	});

	it("exercises every cell kind in the registry", () => {
		// Otherwise an SVG shape can be defined and never looked at by anything.
		const used = new Set<CellKind>(["void"]);
		for (const tile of tiles) for (const kind of kindsIn(tile)) used.add(kind);
		const missing = CELL_SPECS.map((spec) => spec.kind).filter((kind) => !used.has(kind));
		assert.deepEqual(missing, [], `no tile uses: ${missing.join(", ")}`);
	});

	it("uses kebab-case ids, each unique", () => {
		const ids = tiles.map((tile) => tile.id);
		assert.equal(new Set(ids).size, ids.length, "duplicate id");
		for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${id} is not kebab-case`);
	});

	it("gives every tile a name, a note and at least one tag", () => {
		for (const tile of tiles) {
			assert.ok(tile.name.length > 2, `${tile.id} has no name`);
			assert.ok(tile.note && tile.note.length > 15, `${tile.id} has no useful note`);
			assert.ok(tile.tags.length > 0, `${tile.id} has no tags`);
		}
	});

	it("gives every tile somewhere to stand", () => {
		for (const tile of tiles) {
			assert.ok(
				kindsIn(tile).some((kind) => specOf(kind).passable),
				`${tile.id} has no walkable cell`,
			);
		}
	});

	it("legends only what each tile contains", () => {
		for (const tile of tiles) {
			const present = new Set(kindsIn(tile).map((kind) => specOf(kind).glyph));
			for (const entry of legendOf(tile)) {
				assert.ok(present.has(entry.glyph), `${tile.id} legends ${entry.glyph}, which it does not use`);
			}
		}
	});

	it("counts cells consistently with the grid", () => {
		for (const tile of tiles) {
			const total = [...census(tile).values()].reduce((a, b) => a + b, 0);
			assert.equal(total, tile.width * tile.height, `${tile.id} census does not cover the grid`);
		}
	});
});

describe("both projections agree about every tile in the pack", () => {
	it("round-trips through ASCII", () => {
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

	it("draws exactly the cells the grid holds", () => {
		for (const tile of tiles) {
			const fromAscii = renderAscii(tile)
				.split("\n")
				.map((row) => [...row]);
			const fromSvg: string[][] = Array.from({ length: tile.height }, () =>
				Array.from({ length: tile.width }, () => " "),
			);
			for (const cell of readSvgCells(renderSvg(tile))) {
				fromSvg[cell.y][cell.x] = specOf(cell.kind as CellKind).glyph;
			}
			assert.deepEqual(fromSvg, fromAscii, `${tile.id}: the picture and the text describe different tiles`);
		}
	});
});

describe("the pack can generate dungeons", () => {
	it("covers all fifteen connection shapes, so no layout is unbuildable", () => {
		// The generator carves connectivity first and then needs a tile for each
		// required shape. A gap here means some dungeons cannot be built at all.
		assert.deepEqual(missingSignatures(tiles), []);
	});

	it("reaches that coverage through rotation rather than 15 authored variants", () => {
		const authored = new Set(tiles.map((tile) => describeSignature(tileSignature(tile))));
		const withRotation = indexBySignature(tiles).size;
		assert.ok(
			authored.size < withRotation,
			`authored ${authored.size} shapes and rotation yields ${withRotation}; rotation should be doing work`,
		);
	});

	it("generates a connected dungeon reachable from its entrance", () => {
		for (const seed of ["grimhold", "mimic", "beholder"]) {
			const { map, entrances } = generateDungeon(tiles, { cols: 5, rows: 4, seed, loopChance: 0.2 });
			assert.equal(entrances.length, 1);
			const reachable = reachableCells(map, entrances[0], map.width * map.height);
			let floors = 0;
			let stranded = 0;
			for (let y = 0; y < map.height; y++) {
				for (let x = 0; x < map.width; x++) {
					const kind = map.cells[y][x];
					// Water and rubble are walkable; chasms and pits are not, so a tile
					// full of them can legitimately strand its own interior.
					if (kind !== "floor" && kind !== "door") continue;
					floors++;
					if (!reachable.has(y * map.width + x)) stranded++;
				}
			}
			assert.ok(floors > 20, `seed ${seed} produced almost no floor`);
			assert.equal(stranded, 0, `seed ${seed} stranded ${stranded} of ${floors} floor cells`);
		}
	});
});

describe("the pack composes into a map", () => {
	it("assembles a lattice where seams line up", () => {
		// The point of standardising: any tile beside any other tile fits.
		const lattice = [tiles.slice(0, 3), tiles.slice(3, 6), tiles.slice(6, 9)];
		const map = composeTiles(lattice);
		assert.equal(map.width, 3 * (STANDARD_TILE_SIZE - 1) + 1);
		assert.equal(map.height, 3 * (STANDARD_TILE_SIZE - 1) + 1);
		assert.equal(renderAscii(map).split("\n").length, map.height);
	});

	it("never leaves a door opening onto rock", () => {
		// Every pair of tiles, both orders, horizontally and vertically.
		for (const a of tiles) {
			for (const b of tiles) {
				for (const lattice of [[[a, b]], [[a], [b]]]) {
					const map = composeTiles(lattice);
					const seamIsHorizontal = lattice.length === 1;
					const x = seamIsHorizontal ? STANDARD_TILE_SIZE - 1 : 3;
					const y = seamIsHorizontal ? 3 : STANDARD_TILE_SIZE - 1;
					const seam = map.cells[y][x];
					if (seam === "wall" || seam === "void") continue;

					// If the seam is passable, both sides must genuinely open onto it.
					const edgeA = seamIsHorizontal ? "east" : "south";
					const edgeB = seamIsHorizontal ? "west" : "north";
					assert.ok(
						standardEdges(a).includes(edgeA) && standardEdges(b).includes(edgeB),
						`${a.id} beside ${b.id}: seam is ${seam} but one side does not connect`,
					);
				}
			}
		}
	});
});
