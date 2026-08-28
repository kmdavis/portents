import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRegistry } from "../packs/registry.ts";
import type { RandomSource } from "../ports/random.ts";
import type { Table } from "../tables/table.ts";
import {
	formatYesNo,
	gmMove,
	howMany,
	LIKELIHOODS,
	meaning,
	missingOracleTables,
	ORACLE_TABLES,
	reaction,
	sceneCheck,
	yesNo,
} from "./oracle.ts";

/** Minimal stand-ins for the tables a real pack supplies. */
function table(id: string, text: string): Table {
	return { id, name: id, provenance: { source: "test" }, entries: [{ text }] };
}

const registry = createRegistry([
	{
		id: "test",
		tables: [
			table(ORACLE_TABLES.complications, "the way back is flooded"),
			table(ORACLE_TABLES.actions, "conceal"),
			table(ORACLE_TABLES.subjects, "a debt"),
			table(ORACLE_TABLES.sceneSkew, "there is an audience"),
			table(ORACLE_TABLES.sceneInterrupt, "the roof gives way"),
			table(ORACLE_TABLES.gmMoves, "the clock ticks"),
		],
	},
]);

/**
 * Forces the first roll (the oracle's d100 or d6) and then behaves sanely, so
 * nested table lookups still land inside their range.
 */
function fixed(value: number): RandomSource {
	let first = true;
	return {
		int: (min, max) => {
			if (first) {
				first = false;
				return value;
			}
			return Math.min(max, min);
		},
		float: () => value / 100,
		pick: (items) => items[0],
		shuffle: (items) => [...items],
		weighted: (items) => items[0],
	};
}

describe("yesNo", () => {
	it("answers yes below the threshold and no above it", () => {
		assert.match(yesNo("q", "even", { rng: fixed(20) }).answer, /^yes/);
		assert.match(yesNo("q", "even", { rng: fixed(80) }).answer, /^no/);
	});

	it("moves the threshold with the likelihood", () => {
		assert.match(yesNo("q", "likely", { rng: fixed(60) }).answer, /^yes/);
		assert.match(yesNo("q", "unlikely", { rng: fixed(60) }).answer, /^no/);
	});

	it("gives emphatic answers at the extremes", () => {
		assert.equal(yesNo("q", "even", { rng: fixed(5) }).answer, "yes, and");
		assert.equal(yesNo("q", "even", { rng: fixed(98) }).answer, "no, and");
	});

	it("qualifies the far edge of each band", () => {
		assert.equal(yesNo("q", "even", { rng: fixed(45) }).answer, "yes, but");
		assert.equal(yesNo("q", "even", { rng: fixed(58) }).answer, "no, but");
	});

	it("orders the thresholds from certain down to impossible", () => {
		const thresholds = LIKELIHOODS.map((l) => yesNo("q", l, { rng: fixed(50) }).threshold);
		assert.deepEqual(thresholds, [...thresholds].sort((a, b) => b - a));
	});

	it("rejects an unknown likelihood", () => {
		// @ts-expect-error deliberately wrong, to check the runtime guard
		assert.throws(() => yesNo("q", "probably"), /Unknown likelihood/);
	});

	it("pulls a complication on doubles", () => {
		const result = yesNo("q", "even", { rng: fixed(33), registry });
		assert.equal(result.twist, true);
		assert.equal(result.complication, "the way back is flooded");
	});

	it("does not twist on a non-double", () => {
		assert.equal(yesNo("q", "even", { rng: fixed(34) }).twist, false);
	});

	it("says so when a twist happens with no pack loaded", () => {
		// Silently dropping the twist would hide it entirely.
		const result = yesNo("q", "even", { rng: fixed(33) });
		assert.equal(result.twist, true);
		assert.match(result.complication!, /no content pack was supplied/);
	});

	it("reports a broken pack rather than dropping the twist", () => {
		const empty = createRegistry([{ id: "empty" }]);
		const result = yesNo("q", "even", { rng: fixed(33), registry: empty });
		assert.match(result.complication!, /could not draw a complication/);
	});

	it("produces both answers over many real rolls", () => {
		const answers = new Set<string>();
		for (let i = 0; i < 300; i++) answers.add(yesNo("q").answer.split(",")[0]);
		assert.deepEqual([...answers].sort(), ["no", "yes"]);
	});

	it("formats with its arithmetic on show", () => {
		const text = formatYesNo(yesNo("Is the gate guarded?", "likely", { rng: fixed(12) }));
		assert.match(text, /Is the gate guarded\?/);
		assert.match(text, /likely, d100 12 vs 70/);
	});
});

describe("reaction", () => {
	it("builds a valid expression for a zero modifier", () => {
		// A modifier of 0 once produced the invalid expression "2d6+".
		assert.match(reaction(0).rolls[0], /^2d6 = \d+$/);
	});

	it("handles positive and negative modifiers", () => {
		assert.match(reaction(3).rolls[0], /^2d6\+3 = \d+$/);
		assert.match(reaction(-2).rolls[0], /^2d6-2 = \d+$/);
	});

	it("maps the ladder from hostile to enthusiastic", () => {
		assert.match(reaction(-20).text, /Hostile/);
		assert.match(reaction(20).text, /Enthusiastic/);
	});
});

describe("the pack-backed kinds", () => {
	it("returns an action and a subject for meaning", () => {
		const result = meaning({ registry, rng: fixed(1) });
		assert.equal(result.text, "conceal / a debt");
		assert.equal(result.rolls.length, 2);
	});

	it("labels a scene as expected, skewed or interrupted", () => {
		assert.match(sceneCheck({ registry, rng: fixed(1) }).text, /^As expected/);
		assert.match(sceneCheck({ registry, rng: fixed(4) }).text, /^Skewed — there is an audience$/);
		assert.match(sceneCheck({ registry, rng: fixed(6) }).text, /^Interrupted — the roof gives way$/);
	});

	it("returns a GM move", () => {
		assert.equal(gmMove({ registry }).text, "the clock ticks");
	});

	it("counts with the requested dice", () => {
		for (let i = 0; i < 50; i++) {
			const total = Number(howMany("2d4").text);
			assert.ok(total >= 2 && total <= 8, `2d4 gave ${total}`);
		}
	});

	it("never repeats the outcome inside the dice trace", () => {
		// The tool prints both fields; repeating the outcome doubled the output.
		for (const result of [sceneCheck({ registry }), meaning({ registry }), gmMove({ registry })]) {
			const outcome = result.text.replace(/^(Skewed|Interrupted|As expected) — /, "").trim();
			for (const trace of result.rolls) {
				assert.ok(!trace.includes(outcome), `trace "${trace}" restates "${outcome}"`);
			}
		}
	});

	it("says which table is missing rather than failing obscurely", () => {
		assert.throws(() => meaning(), /needs a content pack for the "oracle-actions" table/);
		assert.throws(() => gmMove(), /needs a content pack for the "gm-moves" table/);
		const empty = createRegistry([{ id: "empty" }]);
		assert.throws(() => meaning({ registry: empty }), /Unknown table "oracle-actions"/);
	});
});

describe("missingOracleTables", () => {
	it("is empty for a complete pack", () => {
		assert.deepEqual(missingOracleTables(registry), []);
	});

	it("lists what a thin pack lacks", () => {
		const partial = createRegistry([{ id: "partial", tables: [table(ORACLE_TABLES.gmMoves, "x")] }]);
		const missing = missingOracleTables(partial);
		assert.ok(missing.includes("oracle-actions"));
		assert.ok(!missing.includes("gm-moves"));
	});
});
