import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	assertStandardTile,
	connectorPositions,
	edgeCentre,
	isStandardTile,
	STANDARD_TILE_SIZE,
	standardEdges,
	standardTileProblems,
} from "./standard.ts";
import { parseTile } from "./tile.ts";

const conforming = parseTile({
	id: "ok",
	name: "OK",
	art: ["###+###", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
});

describe("the standard format", () => {
	it("is 7 square", () => {
		assert.equal(STANDARD_TILE_SIZE, 7);
	});

	it("puts the single edge centre at index 3", () => {
		assert.equal(edgeCentre(), 3);
		assert.equal(edgeCentre(5), 2);
		assert.equal(edgeCentre(9), 4);
	});

	it("refuses an even size, which has no single centre", () => {
		assert.throws(() => edgeCentre(6), /must be odd/);
	});

	it("places connectors opposite each other", () => {
		const p = connectorPositions();
		assert.deepEqual(p.north, [3, 0]);
		assert.deepEqual(p.south, [3, 6]);
		assert.deepEqual(p.west, [0, 3]);
		assert.deepEqual(p.east, [6, 3]);
		// The property that makes tiles fit: north and south share an x, east and
		// west share a y, so a door always meets a door.
		assert.equal(p.north[0], p.south[0]);
		assert.equal(p.west[1], p.east[1]);
	});
});

describe("standardTileProblems", () => {
	it("passes a conforming tile", () => {
		assert.deepEqual(standardTileProblems(conforming), []);
		assert.equal(isStandardTile(conforming), true);
	});

	it("rejects the wrong size", () => {
		const small = parseTile({ id: "small", name: "Small", art: ["#+#", "+.+", "#+#"] });
		assert.match(standardTileProblems(small)[0], /is 3×3, but every standard tile must be 7×7/);
	});

	it("reports size once and stops, rather than misreporting positions", () => {
		const wide = parseTile({ id: "wide", name: "Wide", art: ["+.........+"] });
		assert.equal(standardTileProblems(wide).length, 1);
	});

	it("rejects an off-centre door", () => {
		const offset = parseTile({
			id: "offset",
			name: "Offset",
			// Door at x=1 on the north edge instead of x=3.
			art: ["#+#####", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
		});
		const problems = standardTileProblems(offset);
		assert.equal(problems.length, 1);
		assert.match(problems[0], /door at \(1,0\) on the north edge/);
		assert.match(problems[0], /must be at the edge centre, x=3/);
	});

	it("rejects open floor on a boundary away from the centre", () => {
		const leaky = parseTile({
			id: "leaky",
			name: "Leaky",
			art: ["###+###", "#.....#", "#.....#", "+.....+", "#.....#", ".......", "###+###"],
		});
		// Row 5 is all floor, so its two boundary cells leak.
		const problems = standardTileProblems(leaky);
		assert.ok(problems.some((p) => /floor at \(0,5\) on the west edge/.test(p)), problems.join("; "));
		assert.ok(problems.some((p) => /floor at \(6,5\) on the east edge/.test(p)), problems.join("; "));
	});

	it("rejects a connector in a corner, which can never line up", () => {
		const corner = parseTile({
			id: "corner",
			name: "Corner",
			art: ["+##+###", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
		});
		const problems = standardTileProblems(corner);
		assert.ok(problems.some((p) => /connector in the corner at \(0,0\)/.test(p)), problems.join("; "));
	});

	it("rejects a sealed tile that can never be placed", () => {
		const sealed = parseTile({
			id: "sealed",
			name: "Sealed",
			art: ["#######", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", "#######"],
		});
		assert.ok(standardTileProblems(sealed).some((p) => /no exits/.test(p)));
	});

	it("lists every problem at once rather than stopping at the first", () => {
		const bad = parseTile({
			id: "bad",
			name: "Bad",
			art: ["+#+####", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", "####+##"],
		});
		assert.ok(standardTileProblems(bad).length >= 3, standardTileProblems(bad).join("; "));
	});

	it("honours a custom size", () => {
		const five = parseTile({ id: "five", name: "Five", art: ["##+##", "#...#", "+...+", "#...#", "##+##"] });
		assert.deepEqual(standardTileProblems(five, { size: 5 }), []);
		assert.match(standardTileProblems(five)[0], /must be 7×7/);
	});

	it("assertStandardTile names the tile and every problem", () => {
		const offset = parseTile({
			id: "offset",
			name: "Offset",
			art: ["#+#####", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
		});
		assert.throws(() => assertStandardTile(offset), /Tile "offset" is not a standard tile/);
		assert.doesNotThrow(() => assertStandardTile(conforming));
	});
});

describe("standardEdges", () => {
	it("reads the four fixed positions", () => {
		assert.deepEqual(standardEdges(conforming), ["north", "east", "south", "west"]);
	});

	it("reports only the edges that connect", () => {
		const corridor = parseTile({
			id: "corridor",
			name: "Corridor",
			art: ["#######", "#######", "#######", "+.....+", "#######", "#######", "#######"],
		});
		assert.deepEqual(standardEdges(corridor), ["east", "west"]);
	});
});

describe("connectors must be mutually reachable", () => {
	it("rejects a corridor blocked in the middle", () => {
		// The bug this check exists for: the tile declares east and west, so a
		// generator uses it as a through-route, and the dungeon quietly splits.
		const blocked = parseTile({
			id: "blocked",
			name: "Blocked",
			art: ["#######", "#######", "#######", "+..v..+", "#######", "#######", "#######"],
		});
		const problems = standardTileProblems(blocked);
		assert.equal(problems.length, 1, problems.join("; "));
		assert.match(problems[0], /declares a west connector that cannot be walked to from the east one/);
		assert.match(problems[0], /disconnect a generated dungeon/);
	});

	it("accepts a corridor crossable via a hazard you can step on", () => {
		const pits = parseTile({
			id: "pits",
			name: "Pits",
			art: ["#######", "#######", "#######", "+.o.o.+", "#######", "#######", "#######"],
		});
		assert.deepEqual(standardTileProblems(pits), []);
	});

	it("accepts a room where the route goes around an obstacle", () => {
		const ring = parseTile({
			id: "ring",
			name: "Ring",
			art: ["###+###", "#.....#", "#.vvv.#", "+.vvv.+", "#.vvv.#", "#.....#", "###+###"],
		});
		assert.deepEqual(standardTileProblems(ring), []);
	});

	it("says nothing about a tile with only one connector", () => {
		const deadEnd = parseTile({
			id: "dead",
			name: "Dead",
			art: ["#######", "#######", "#######", "+..####", "#######", "#######", "#######"],
		});
		assert.deepEqual(standardTileProblems(deadEnd), []);
	});

	it("reports each unreachable connector separately", () => {
		const split = parseTile({
			id: "split",
			name: "Split",
			art: ["###+###", "##v.v##", "##v.v##", "+vv.vv+", "##v.v##", "##v.v##", "###+###"],
		});
		// North and south share the central column; east and west are cut off.
		const problems = standardTileProblems(split);
		assert.equal(problems.length, 2, problems.join("; "));
	});
});
