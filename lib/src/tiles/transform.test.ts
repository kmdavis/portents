import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { standardTileProblems } from "./standard.ts";
import { parseTile, renderAscii } from "./tile.ts";
import { mirrorTile, rotatePoint, rotateTile, rotations, withRotations } from "./transform.ts";

const bend = parseTile({
	id: "bend",
	name: "Bend",
	tags: ["corridor"],
	art: ["#######", "#######", "#######", "+...###", "###.###", "###.###", "###+###"],
});

const hall = parseTile({
	id: "hall",
	name: "Hall",
	art: ["###+###", "#.....#", "#.....#", "+.....+", "#.....#", "#.....#", "###+###"],
});

describe("rotatePoint", () => {
	it("is the identity at zero turns", () => {
		assert.deepEqual(rotatePoint(2, 5, 7, 7, 0), { x: 2, y: 5 });
	});

	it("turns clockwise", () => {
		// Top-left goes to top-right.
		assert.deepEqual(rotatePoint(0, 0, 7, 7, 1), { x: 6, y: 0 });
		assert.deepEqual(rotatePoint(6, 0, 7, 7, 1), { x: 6, y: 6 });
	});

	it("normalises turns outside 0-3", () => {
		assert.deepEqual(rotatePoint(1, 2, 7, 7, 4), rotatePoint(1, 2, 7, 7, 0));
		assert.deepEqual(rotatePoint(1, 2, 7, 7, -1), rotatePoint(1, 2, 7, 7, 3));
	});
});

describe("rotateTile", () => {
	it("returns the same object for zero turns", () => {
		assert.equal(rotateTile(bend, 0), bend);
	});

	it("four turns is the identity", () => {
		let turned = bend;
		for (let i = 0; i < 4; i++) turned = rotateTile(turned, 1);
		assert.equal(renderAscii(turned), renderAscii(bend));
	});

	it("moves a west-south bend to north-west", () => {
		const turned = rotateTile(bend, 1);
		// West door at (0,3) becomes north door at (3,0); south becomes west.
		assert.equal(turned.cells[0][3], "door");
		assert.equal(turned.cells[3][0], "door");
	});

	it("keeps a rotated tile standard", () => {
		for (const turns of [1, 2, 3]) {
			assert.deepEqual(standardTileProblems(rotateTile(bend, turns)), [], `${turns} turns`);
			assert.deepEqual(standardTileProblems(rotateTile(hall, turns)), [], `${turns} turns`);
		}
	});

	it("preserves the cell census", () => {
		const before = renderAscii(bend).replace(/\n/g, "").split("").sort().join("");
		const after = renderAscii(rotateTile(bend, 1)).replace(/\n/g, "").split("").sort().join("");
		assert.equal(after, before, "rotation changed which cells exist");
	});

	it("traces the rotation in the id and name", () => {
		assert.equal(rotateTile(bend, 1).id, "bend@90");
		assert.equal(rotateTile(bend, 3).id, "bend@270");
		assert.match(rotateTile(bend, 2).name, /180°/);
	});

	it("swaps the axes for a non-square tile", () => {
		const wide = parseTile({ id: "wide", name: "Wide", art: ["+..+"] });
		const turned = rotateTile(wide, 1);
		assert.equal(turned.width, 1);
		assert.equal(turned.height, 4);
	});
});

describe("mirrorTile", () => {
	it("reverses each row", () => {
		const mirrored = mirrorTile(bend);
		assert.equal(renderAscii(mirrored).split("\n")[3], "###...+");
	});

	it("is its own inverse", () => {
		assert.equal(renderAscii(mirrorTile(mirrorTile(bend))), renderAscii(bend));
	});

	it("keeps a mirrored tile standard", () => {
		assert.deepEqual(standardTileProblems(mirrorTile(bend)), []);
	});
});

describe("rotations", () => {
	it("gives four orientations of an asymmetric tile", () => {
		assert.equal(rotations(bend).length, 4);
	});

	it("deduplicates a symmetric tile, so uniform picking is not biased", () => {
		// A four-way hall looks the same from every side.
		assert.equal(rotations(hall).length, 1);
	});

	it("gives two orientations of a straight corridor", () => {
		const corridor = parseTile({
			id: "corridor",
			name: "Corridor",
			art: ["#######", "#######", "#######", "+.....+", "#######", "#######", "#######"],
		});
		assert.equal(rotations(corridor).length, 2);
	});

	it("produces distinct ids", () => {
		const ids = rotations(bend).map((tile) => tile.id);
		assert.equal(new Set(ids).size, ids.length);
	});

	it("expands a whole set", () => {
		const all = withRotations([bend, hall]);
		assert.equal(all.length, 5);
		assert.equal(new Set(all.map((tile) => tile.id)).size, 5);
	});
});
