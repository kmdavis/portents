import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTile, type Tile } from "../tiles/tile.ts";
import { cellKey, computeFov, hasLineOfSight, reachableCells } from "./visibility.ts";

/** Build a tile from art and give a helper for asking about a cell. */
function scene(art: string[]): { tile: Tile; seen: (fov: Set<number>, x: number, y: number) => boolean } {
	const tile = parseTile({ id: "scene", name: "Scene", art });
	return { tile, seen: (fov, x, y) => fov.has(cellKey(x, y, tile.width)) };
}

describe("computeFov", () => {
	it("always includes the viewer's own square", () => {
		const { tile, seen } = scene(["#####", "#...#", "#...#", "#...#", "#####"]);
		assert.ok(seen(computeFov(tile, [{ x: 2, y: 2 }]), 2, 2));
	});

	it("lights a whole open room, including its walls", () => {
		const { tile, seen } = scene(["#####", "#...#", "#...#", "#...#", "#####"]);
		const fov = computeFov(tile, [{ x: 2, y: 2 }]);
		for (let y = 0; y < 5; y++) {
			for (let x = 0; x < 5; x++) {
				assert.ok(seen(fov, x, y), `(${x},${y}) should be visible in an open room`);
			}
		}
	});

	it("leaves no speckled holes in an open room", () => {
		// The classic ray-casting failure: cells no ray happens to pass through.
		const { tile, seen } = scene([
			"###########",
			"#.........#",
			"#.........#",
			"#.........#",
			"#.........#",
			"#.........#",
			"###########",
		]);
		const fov = computeFov(tile, [{ x: 5, y: 3 }]);
		for (let y = 1; y <= 5; y++) {
			for (let x = 1; x <= 9; x++) {
				assert.ok(seen(fov, x, y), `(${x},${y}) is a hole in the field of view`);
			}
		}
	});

	it("does not see through a wall", () => {
		const { tile, seen } = scene(["#######", "#..#..#", "#..#..#", "#######"]);
		const fov = computeFov(tile, [{ x: 1, y: 1 }]);
		assert.ok(seen(fov, 2, 1), "own side of the wall");
		assert.ok(!seen(fov, 4, 1), "should not see past a wall");
		assert.ok(!seen(fov, 5, 2), "should not see past a wall");
	});

	it("does not see through a closed door", () => {
		const { tile, seen } = scene(["#####", "#.+.#", "#####"]);
		const fov = computeFov(tile, [{ x: 1, y: 1 }]);
		assert.ok(seen(fov, 2, 1), "the door itself is visible");
		assert.ok(!seen(fov, 3, 1), "should not see through a closed door");
	});

	it("sees through an archway, which has no door in it", () => {
		const { tile, seen } = scene(["#####", "#.A.#", "#####"]);
		assert.ok(seen(computeFov(tile, [{ x: 1, y: 1 }]), 3, 1));
	});

	it("sees across a chasm, which blocks movement but not sight", () => {
		const { tile, seen } = scene(["#######", "#.vvv.#", "#######"]);
		assert.ok(seen(computeFov(tile, [{ x: 1, y: 1 }]), 5, 1));
	});

	it("sees past a pillar on both sides", () => {
		// Standing back from a pillar, it hides only what is directly behind it.
		const { tile, seen } = scene([
			"#######",
			"#.....#",
			"#..O..#",
			"#.....#",
			"#.....#",
			"#######",
		]);
		const fov = computeFov(tile, [{ x: 3, y: 4 }]);
		assert.ok(seen(fov, 3, 2), "the pillar itself is visible");
		assert.ok(seen(fov, 2, 1), "should see past the pillar on the left");
		assert.ok(seen(fov, 4, 1), "should see past the pillar on the right");
		assert.ok(!seen(fov, 3, 1), "directly behind the pillar should be hidden");
	});

	it("hides a corner from someone in the adjoining corridor", () => {
		const { tile, seen } = scene([
			"#######",
			"#.....#",
			"#####.#",
			"#####.#",
			"#######",
		]);
		// Standing at the west end of the top corridor, the bottom of the leg is
		// around a corner.
		const fov = computeFov(tile, [{ x: 1, y: 1 }]);
		assert.ok(seen(fov, 5, 1), "along the corridor");
		assert.ok(!seen(fov, 5, 3), "around the corner should be hidden");
	});

	it("sees into a room from a doorway but not along the wall behind", () => {
		const { tile, seen } = scene([
			"#########",
			"#.......#",
			"####+####",
			"#.......#",
			"#########",
		]);
		const fov = computeFov(tile, [{ x: 4, y: 2 }]);
		assert.ok(seen(fov, 4, 1), "straight ahead");
		assert.ok(seen(fov, 4, 3), "straight behind");
	});

	it("respects a sight radius, and lights a disc rather than a square", () => {
		const art = Array.from({ length: 15 }, (_, y) =>
			y === 0 || y === 14 ? "#".repeat(15) : `#${".".repeat(13)}#`,
		);
		const { tile, seen } = scene(art);
		const fov = computeFov(tile, [{ x: 7, y: 7 }], { radius: 3 });
		assert.ok(seen(fov, 7, 4), "3 cells straight up is within radius");
		assert.ok(!seen(fov, 7, 3), "4 cells up is beyond radius");
		assert.ok(!seen(fov, 10, 10), "the diagonal corner of the square is beyond a disc");
	});

	it("unions the fields of view of several viewers", () => {
		const { tile, seen } = scene(["#######", "#..#..#", "#..#..#", "#######"]);
		const alone = computeFov(tile, [{ x: 1, y: 1 }]);
		const together = computeFov(tile, [
			{ x: 1, y: 1 },
			{ x: 5, y: 1 },
		]);
		assert.ok(!seen(alone, 5, 2), "one viewer cannot see the far side");
		assert.ok(seen(together, 5, 2), "two viewers between them can");
		assert.ok(seen(together, 2, 2), "and still see the near side");
	});

	it("treats void as opaque, so nothing shows through a gap in the map", () => {
		const { tile, seen } = scene(["#####  #####", "#...#  #...#", "#####  #####"]);
		const fov = computeFov(tile, [{ x: 1, y: 1 }]);
		assert.ok(!seen(fov, 9, 1), "should not see across a void gap");
	});

	it("can omit walls for a floor-only field of view", () => {
		const { tile, seen } = scene(["#####", "#...#", "#####"]);
		const fov = computeFov(tile, [{ x: 2, y: 1 }], { includeWalls: false });
		assert.ok(seen(fov, 1, 1));
		assert.ok(!seen(fov, 0, 1), "walls excluded");
	});

	it("accepts an opacity override, so a door can be opened for one calculation", () => {
		const { tile, seen } = scene(["#####", "#.+.#", "#####"]);
		const closed = computeFov(tile, [{ x: 1, y: 1 }]);
		const opened = computeFov(tile, [{ x: 1, y: 1 }], {
			isOpaqueAt: (_x, _y, kind) => kind !== "door" && kind !== "floor",
		});
		assert.ok(!seen(closed, 3, 1));
		assert.ok(seen(opened, 3, 1), "an opened door should let sight through");
	});

	it("ignores a viewer outside the map", () => {
		const { tile } = scene(["#####", "#...#", "#####"]);
		assert.equal(computeFov(tile, [{ x: 99, y: 99 }]).size, 0);
	});

	it("is symmetric for open ground", () => {
		// If A can see B across an open room, B can see A.
		const { tile } = scene([
			"#########",
			"#.......#",
			"#.......#",
			"#.......#",
			"#########",
		]);
		const a = { x: 1, y: 1 };
		const b = { x: 7, y: 3 };
		assert.equal(hasLineOfSight(tile, a, b), hasLineOfSight(tile, b, a));
		assert.ok(hasLineOfSight(tile, a, b));
	});
});

describe("reachableCells", () => {
	it("walks through open floor", () => {
		const { tile, seen } = scene(["#####", "#...#", "#####"]);
		const reachable = reachableCells(tile, { x: 1, y: 1 }, 5);
		assert.ok(seen(reachable, 3, 1));
	});

	it("does not walk into a chasm, though it can be seen across", () => {
		const { tile, seen } = scene(["#######", "#.vvv.#", "#######"]);
		const reachable = reachableCells(tile, { x: 1, y: 1 }, 10);
		assert.ok(!seen(reachable, 3, 1), "a chasm is not walkable");
		assert.ok(!seen(reachable, 5, 1), "and blocks the route beyond");
		assert.ok(hasLineOfSight(tile, { x: 1, y: 1 }, { x: 5, y: 1 }), "but is transparent");
	});

	it("walks through a door, which blocks sight but not movement", () => {
		const { tile, seen } = scene(["#####", "#.+.#", "#####"]);
		assert.ok(seen(reachableCells(tile, { x: 1, y: 1 }, 5), 3, 1));
	});

	it("respects the step budget", () => {
		const { tile, seen } = scene(["########", "#......#", "########"]);
		const reachable = reachableCells(tile, { x: 1, y: 1 }, 2);
		assert.ok(seen(reachable, 3, 1));
		assert.ok(!seen(reachable, 5, 1));
	});
});
