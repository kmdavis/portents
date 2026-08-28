import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seededRandomSource } from "../ports/random.ts";
import { connects } from "../tiles/cells.ts";
import { connectorPositions, STANDARD_TILE_SIZE, standardTileProblems } from "../tiles/standard.ts";
import { parseTile, renderAscii, type Tile } from "../tiles/tile.ts";
import {
	describeSignature,
	generateDungeon,
	GenerationError,
	indexBySignature,
	missingSignatures,
	tileSignature,
} from "./generate.ts";
import { reachableCells } from "./visibility.ts";

/** The minimum viable set: one tile per shape class. Rotations do the rest. */
const SHAPE_CLASSES: readonly Tile[] = [
	parseTile({
		id: "dead-end",
		name: "Dead End",
		art: ["#######", "#######", "#######", "+..####", "#######", "#######", "#######"],
	}),
	parseTile({
		id: "straight",
		name: "Straight",
		art: ["#######", "#######", "#######", "+.....+", "#######", "#######", "#######"],
	}),
	parseTile({
		id: "bend",
		name: "Bend",
		art: ["#######", "#######", "#######", "+...###", "###.###", "###.###", "###+###"],
	}),
	parseTile({
		id: "tee",
		name: "Tee",
		art: ["#######", "#######", "#######", "+.....+", "###.###", "###.###", "###+###"],
	}),
	parseTile({
		id: "cross",
		name: "Cross",
		art: ["###+###", "###.###", "###.###", "+.....+", "###.###", "###.###", "###+###"],
	}),
];

describe("tileSignature", () => {
	it("reads which edges connect", () => {
		assert.equal(describeSignature(tileSignature(SHAPE_CLASSES[0])), "west");
		assert.equal(describeSignature(tileSignature(SHAPE_CLASSES[1])), "east+west");
		assert.equal(describeSignature(tileSignature(SHAPE_CLASSES[4])), "north+east+south+west");
	});

	it("agrees with the connector positions", () => {
		const positions = connectorPositions();
		for (const tile of SHAPE_CLASSES) {
			const signature = tileSignature(tile);
			for (const [edge, bit] of [
				["north", 1],
				["east", 2],
				["south", 4],
				["west", 8],
			] as const) {
				const [x, y] = positions[edge as keyof typeof positions];
				assert.equal(Boolean(signature & bit), connects(tile.cells[y][x]), `${tile.id} ${edge}`);
			}
		}
	});
});

describe("signature coverage", () => {
	it("covers all fifteen useful shapes from five authored tiles, via rotation", () => {
		// This is the payoff of the standard format: five tiles, sixteen shapes.
		assert.deepEqual(missingSignatures(SHAPE_CLASSES), []);
		assert.equal(indexBySignature(SHAPE_CLASSES).size, 15);
	});

	it("reports what a thin set cannot build", () => {
		const missing = missingSignatures([SHAPE_CLASSES[1]]); // straight only
		assert.ok(missing.length > 0);
		assert.ok(!missing.includes("east+west"), "the shape it does have");
		assert.ok(missing.includes("north+east+south+west"), "the shapes it does not");
	});

	it("refuses a non-standard tile with a reason", () => {
		const bad = parseTile({ id: "bad", name: "Bad", art: ["+.+"] });
		assert.throws(() => indexBySignature([bad]), GenerationError);
		assert.throws(() => indexBySignature([bad]), /cannot be used for generation/);
	});
});

describe("generateDungeon", () => {
	it("fills the lattice", () => {
		const { map, lattice } = generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 3, seed: "grimhold" });
		assert.equal(lattice.length, 3);
		assert.equal(lattice[0].length, 4);
		assert.equal(map.width, 4 * (STANDARD_TILE_SIZE - 1) + 1);
		assert.equal(map.height, 3 * (STANDARD_TILE_SIZE - 1) + 1);
	});

	it("is reproducible from a seed", () => {
		const a = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed: "mimic" });
		const b = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed: "mimic" });
		assert.equal(renderAscii(a.map), renderAscii(b.map));
	});

	it("differs across seeds", () => {
		const a = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed: "mimic" });
		const b = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed: "beholder" });
		assert.notEqual(renderAscii(a.map), renderAscii(b.map));
	});

	it("places a tile whose signature matches the carved connections exactly", () => {
		const { lattice, signatures } = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed: "vault" });
		for (const [row, tiles] of lattice.entries()) {
			for (const [col, tile] of tiles.entries()) {
				if (!tile) continue;
				assert.equal(
					tileSignature(tile),
					signatures[row][col],
					`(${col},${row}) tile ${tile.id} does not match its required shape`,
				);
			}
		}
	});

	it("produces a fully connected dungeon", () => {
		// The whole reason for carving connectivity before choosing tiles.
		for (const seed of ["a", "b", "c", "d", "e", "grimhold", "mimic"]) {
			const { map } = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed, loopChance: 0.2 });
			const floors: Array<{ x: number; y: number }> = [];
			for (let y = 0; y < map.height; y++) {
				for (let x = 0; x < map.width; x++) {
					const kind = map.cells[y][x];
					if (kind === "floor" || kind === "door") floors.push({ x, y });
				}
			}
			assert.ok(floors.length > 0, `seed ${seed} produced no floor`);
			const reachable = reachableCells(map, floors[0], map.width * map.height);
			const unreachable = floors.filter((cell) => !reachable.has(cell.y * map.width + cell.x));
			assert.deepEqual(unreachable, [], `seed ${seed} left ${unreachable.length} cells unreachable`);
		}
	});

	it("keeps every placed tile standard", () => {
		const { lattice } = generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 4, seed: "std" });
		for (const row of lattice) {
			for (const tile of row) {
				if (tile) assert.deepEqual(standardTileProblems(tile), [], tile.id);
			}
		}
	});

	it("opens no door onto rock", () => {
		for (const seed of ["a", "b", "c", "grimhold"]) {
			const { map } = generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 4, seed });
			// A door must have passable floor on two opposite sides.
			for (let y = 1; y < map.height - 1; y++) {
				for (let x = 1; x < map.width - 1; x++) {
					if (map.cells[y][x] !== "door") continue;
					const horizontal = map.cells[y][x - 1] !== "wall" && map.cells[y][x + 1] !== "wall";
					const vertical = map.cells[y - 1][x] !== "wall" && map.cells[y + 1][x] !== "wall";
					assert.ok(horizontal || vertical, `door at (${x},${y}) in seed ${seed} opens onto rock`);
				}
			}
		}
	});

	it("stays connected when gaps are carved", () => {
		for (const seed of ["g1", "g2", "g3"]) {
			const { map, lattice } = generateDungeon(SHAPE_CLASSES, {
				cols: 6,
				rows: 5,
				seed,
				gapChance: 0.3,
			});
			const placed = lattice.flat().filter(Boolean).length;
			assert.ok(placed > 0, "everything was carved away");

			const floors: Array<{ x: number; y: number }> = [];
			for (let y = 0; y < map.height; y++) {
				for (let x = 0; x < map.width; x++) {
					if (map.cells[y][x] === "floor" || map.cells[y][x] === "door") floors.push({ x, y });
				}
			}
			const reachable = reachableCells(map, floors[0], map.width * map.height);
			const unreachable = floors.filter((cell) => !reachable.has(cell.y * map.width + cell.x));
			assert.deepEqual(unreachable, [], `seed ${seed} stranded ${unreachable.length} cells`);
		}
	});

	it("makes loops when asked and dead ends when not", () => {
		const countDeadEnds = (loopChance: number): number => {
			const { lattice } = generateDungeon(SHAPE_CLASSES, { cols: 6, rows: 6, seed: "loops", loopChance });
			return lattice.flat().filter((tile) => tile && tileSignature(tile) && popcount(tileSignature(tile)) === 1)
				.length;
		};
		assert.ok(countDeadEnds(0) >= countDeadEnds(0.9), "loops should reduce dead ends");
	});

	it("handles a single-cell lattice, which is only possible because of the entrance", () => {
		// With no neighbours and no entrance the required shape would be "sealed",
		// and a sealed tile cannot exist under the standard format.
		const { lattice, entrances } = generateDungeon(SHAPE_CLASSES, { cols: 1, rows: 1, seed: "one" });
		assert.equal(lattice.length, 1);
		assert.ok(lattice[0][0], "the one cell should be filled");
		assert.equal(entrances.length, 1);
		assert.equal(tileSignature(lattice[0][0]!), 1 << ["north", "east", "south", "west"].indexOf(entrances[0].edge));
	});

	it("carves a way in", () => {
		const { map, entrances } = generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 3, seed: "door" });
		assert.equal(entrances.length, 1);
		const entrance = entrances[0];
		// The entrance is on the map boundary and is a connector.
		assert.ok(connects(map.cells[entrance.y][entrance.x]), "the entrance should be a doorway");
		const onBoundary =
			entrance.x === 0 || entrance.y === 0 || entrance.x === map.width - 1 || entrance.y === map.height - 1;
		assert.ok(onBoundary, `entrance at (${entrance.x},${entrance.y}) is not on the map boundary`);
	});

	it("can carve several entrances, or none", () => {
		assert.equal(generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 4, seed: "e3", entrances: 3 }).entrances.length, 3);
		assert.equal(generateDungeon(SHAPE_CLASSES, { cols: 4, rows: 4, seed: "e0", entrances: 0 }).entrances.length, 0);
	});

	it("reaches the whole dungeon from an entrance", () => {
		for (const seed of ["r1", "r2", "r3"]) {
			const { map, entrances } = generateDungeon(SHAPE_CLASSES, { cols: 5, rows: 4, seed });
			const reachable = reachableCells(map, entrances[0], map.width * map.height);
			let floors = 0;
			let unreachable = 0;
			for (let y = 0; y < map.height; y++) {
				for (let x = 0; x < map.width; x++) {
					if (map.cells[y][x] !== "floor" && map.cells[y][x] !== "door") continue;
					floors++;
					if (!reachable.has(y * map.width + x)) unreachable++;
				}
			}
			assert.ok(floors > 10, `seed ${seed} has almost no floor`);
			assert.equal(unreachable, 0, `seed ${seed}: ${unreachable} cells unreachable from the entrance`);
		}
	});

	it("accepts an explicit rng instead of a seed", () => {
		const a = generateDungeon(SHAPE_CLASSES, { cols: 3, rows: 3, rng: seededRandomSource("x") });
		const b = generateDungeon(SHAPE_CLASSES, { cols: 3, rows: 3, rng: seededRandomSource("x") });
		assert.equal(renderAscii(a.map), renderAscii(b.map));
	});

	it("explains itself when the tile set cannot satisfy a shape", () => {
		assert.throws(
			() => generateDungeon([SHAPE_CLASSES[1]], { cols: 3, rows: 3, seed: "thin" }),
			(error: Error) => {
				assert.ok(error instanceof GenerationError);
				assert.match(error.message, /No tile connects exactly/);
				assert.match(error.message, /The set covers/);
				assert.match(error.message, /Add a tile with that shape/);
				return true;
			},
		);
	});
});

function popcount(n: number): number {
	let count = 0;
	for (let i = 0; i < 4; i++) if (n & (1 << i)) count++;
	return count;
}
