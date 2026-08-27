import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CellKind } from "./cells.ts";
import { composeTiles, mergeCells, tileAt, toTileSource } from "./layout.ts";
import { readSvgCells, renderSvg } from "./svg.ts";
import { STANDARD_TILE_SIZE } from "./standard.ts";
import { parseTile, renderAscii, type Tile } from "./tile.ts";

const room = parseTile({
	id: "room",
	name: "Room",
	art: ["###+###", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
});

const corridor = parseTile({
	id: "corridor",
	name: "Corridor",
	art: ["#######", "#######", "#######", "+.....+", "#######", "#######", "#######"],
});

const sealedNorth = parseTile({
	id: "sealed-north",
	name: "Sealed North",
	art: ["#######", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
});

describe("mergeCells", () => {
	it("keeps identical kinds", () => {
		assert.equal(mergeCells("wall", "wall"), "wall");
		assert.equal(mergeCells("floor", "floor"), "floor");
	});

	it("lets anything real win over void", () => {
		assert.equal(mergeCells("void", "wall"), "wall");
		assert.equal(mergeCells("floor", "void"), "floor");
	});

	it("merges two connectors, preferring the deliberate opening", () => {
		assert.equal(mergeCells("door", "floor"), "door");
		assert.equal(mergeCells("floor", "archway"), "archway");
	});

	it("seals a door that meets a wall", () => {
		// The important rule: an assembled map must never show an exit into rock.
		assert.equal(mergeCells("door", "wall"), "wall");
		assert.equal(mergeCells("wall", "door"), "wall");
	});

	it("seals a connector that meets a hazard", () => {
		assert.equal(mergeCells("door", "chasm"), "wall");
	});
});

describe("composeTiles", () => {
	it("shares a wall between neighbours by default", () => {
		const map = composeTiles([[room, room]]);
		// Two 7-wide tiles overlapping by one column.
		assert.equal(map.width, 13);
		assert.equal(map.height, 7);
		assert.equal(map.cols, 2);
		assert.equal(map.rows, 1);
	});

	it("butts tiles together when overlap is zero", () => {
		const map = composeTiles([[room, room]], { overlap: 0 });
		assert.equal(map.width, 14);
	});

	it("joins two rooms into one doorway at the seam", () => {
		const map = composeTiles([[room, room]]);
		// Left tile's east door and right tile's west door land on x=6, y=3.
		assert.equal(map.cells[3][6], "door");
		// And the interiors either side are floor, so it is genuinely passable.
		assert.equal(map.cells[3][5], "floor");
		assert.equal(map.cells[3][7], "floor");
	});

	it("seals a seam where only one side has a door", () => {
		// room has a south door; sealedNorth does not have a north door.
		const map = composeTiles([[room], [sealedNorth]]);
		assert.equal(map.cells[6][3], "wall", "a door onto a walled neighbour must be sealed");
	});

	it("leaves a gap as void, which draws nothing", () => {
		const map = composeTiles([[room, null]]);
		assert.equal(map.cells[3][10], "void");
		const drawn = readSvgCells(renderSvg(map));
		assert.ok(
			drawn.every((cell) => cell.x <= 6),
			"a gap should draw no cells",
		);
	});

	it("pads a ragged lattice", () => {
		const map = composeTiles([[room, room], [room]]);
		assert.equal(map.cols, 2);
		assert.deepEqual(map.placement[1], ["room", null]);
	});

	it("records what was placed where", () => {
		const map = composeTiles([[room, corridor]]);
		assert.deepEqual(map.placement, [["room", "corridor"]]);
	});

	it("rejects an empty lattice", () => {
		assert.throws(() => composeTiles([]), /lattice is empty/);
		assert.throws(() => composeTiles([[]]), /lattice is empty/);
	});

	it("rejects a mismatched tile with a useful message", () => {
		const small = parseTile({ id: "small", name: "Small", art: ["#+#", "+.+", "#+#"] });
		assert.throws(() => composeTiles([[room, small]]), /tile "small" is 3×3, expected 7×7/);
		assert.throws(() => composeTiles([[room, small]]), /standardTileProblems/);
	});

	it("rejects a nonsensical overlap", () => {
		assert.throws(() => composeTiles([[room]], { overlap: -1 }), /overlap must be between/);
		assert.throws(() => composeTiles([[room]], { overlap: 7 }), /overlap must be between/);
	});

	it("is itself a tile, so both projections work unchanged", () => {
		const map: Tile = composeTiles([
			[room, corridor, room],
			[corridor, room, corridor],
		]);

		// The same equivalence guarantee as a single tile, on a whole dungeon.
		const fromAscii = renderAscii(map)
			.split("\n")
			.map((row) => [...row]);
		assert.equal(fromAscii.length, map.height);
		assert.equal(fromAscii[0].length, map.width);

		const fromSvg: CellKind[][] = Array.from({ length: map.height }, () =>
			Array.from({ length: map.width }, (): CellKind => "void"),
		);
		for (const cell of readSvgCells(renderSvg(map))) fromSvg[cell.y][cell.x] = cell.kind as CellKind;
		assert.deepEqual(fromSvg, map.cells.map((row) => [...row]));
	});

	it("round-trips a composed map through text", () => {
		const map = composeTiles([
			[room, corridor],
			[corridor, room],
		]);
		const reparsed = parseTile(toTileSource(map));
		assert.deepEqual(reparsed.cells, map.cells);
		assert.equal(renderAscii(reparsed), renderAscii(map));
	});

	it("scales to a lattice big enough to be a dungeon", () => {
		const lattice = Array.from({ length: 4 }, (_, r) =>
			Array.from({ length: 5 }, (_, c) => ((r + c) % 2 === 0 ? room : corridor)),
		);
		const map = composeTiles(lattice);
		const stride = STANDARD_TILE_SIZE - 1;
		assert.equal(map.width, 5 * stride + 1);
		assert.equal(map.height, 4 * stride + 1);
		assert.equal(renderAscii(map).split("\n").length, map.height);
	});
});

describe("tileAt", () => {
	it("maps a coordinate back to its lattice cell", () => {
		const map = composeTiles([
			[room, corridor],
			[corridor, room],
		]);
		assert.deepEqual(tileAt(map, 1, 1), { col: 0, row: 0, id: "room" });
		assert.deepEqual(tileAt(map, 8, 1), { col: 1, row: 0, id: "corridor" });
		assert.deepEqual(tileAt(map, 8, 8), { col: 1, row: 1, id: "room" });
	});

	it("clamps a coordinate on the far seam into the last tile", () => {
		const map = composeTiles([[room, corridor]]);
		assert.equal(tileAt(map, map.width - 1, 3).col, 1);
	});
});
