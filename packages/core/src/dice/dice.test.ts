import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	analyze,
	chanceOf,
	diceSummary,
	formatRoll,
	MAX_REPEATS,
	parse,
	percentileOf,
	roll,
	rollExpression,
	splitRepeat,
} from "./index.ts";
import { seededRandomSource } from "../ports/random.ts";

/** Roller that returns a fixed queue of faces, then cycles. */
function fixedRng(values: number[]) {
	let i = 0;
	const nextValue = () => values[i++ % values.length];
	return {
		int: (min: number, max: number) => {
			const v = nextValue();
			assert.ok(v >= min && v <= max, `fixed value ${v} outside [${min}, ${max}]`);
			return v;
		},
		float: () => 0.5,
		pick: <T>(items: readonly T[]) => items[0],
		shuffle: <T>(items: readonly T[]) => [...items],
		weighted: <T>(items: readonly T[]) => items[0],
	};
}

describe("parse", () => {
	it("reads count, sides and modifiers", () => {
		const expr = parse("4d6kh3+2");
		assert.equal(expr.dice.length, 1);
		assert.equal(expr.dice[0].count, 4);
		assert.equal(expr.dice[0].sides, 6);
		assert.deepEqual(expr.dice[0].mods, [{ type: "kh", count: 3 }]);
	});

	it("defaults count to 1", () => {
		assert.equal(parse("d20").dice[0].count, 1);
	});

	it("maps d% to d100 and dF to fudge", () => {
		assert.equal(parse("d%").dice[0].sides, 100);
		assert.equal(parse("2dF").dice[0].fudge, true);
	});

	it("captures a # label", () => {
		assert.equal(parse("1d20+5 # perception").label, "perception");
	});

	it("rejects garbage", () => {
		assert.throws(() => parse("hello"), /Cannot parse/);
		assert.throws(() => parse("2d6+"), /Unexpected end/);
		assert.throws(() => parse("(2d6"), /Missing "\)"/);
		assert.throws(() => parse("2d6kh3)"), /Unexpected "\)"/);
	});

	it("refuses absurd dice pools", () => {
		assert.throws(() => parse("99999d6"), /Refusing to roll/);
	});
});

describe("roll", () => {
	it("sums plain dice with a flat modifier", () => {
		const result = rollExpression(parse("3d6+2"), { rng: fixedRng([4, 5, 6]) });
		assert.equal(result.total, 17);
		assert.deepEqual(result.groups[0].kept, [4, 5, 6]);
	});

	it("keeps highest", () => {
		const result = rollExpression(parse("4d6kh3"), { rng: fixedRng([1, 6, 3, 5]) });
		assert.equal(result.total, 14);
		assert.deepEqual(result.groups[0].dropped, [1]);
	});

	it("keeps lowest for disadvantage", () => {
		const result = rollExpression(parse("2d20kl1"), { rng: fixedRng([18, 3]) });
		assert.equal(result.total, 3);
	});

	it("drops lowest", () => {
		const result = rollExpression(parse("4d6dl1"), { rng: fixedRng([2, 2, 5, 6]) });
		assert.equal(result.total, 13);
	});

	it("handles duplicate values in keep/drop without losing dice", () => {
		const result = rollExpression(parse("4d6kh3"), { rng: fixedRng([6, 6, 6, 6]) });
		assert.equal(result.total, 18);
		assert.equal(result.groups[0].kept.length, 3);
		assert.equal(result.groups[0].dropped.length, 1);
	});

	it("rerolls once", () => {
		const result = rollExpression(parse("2d6r1"), { rng: fixedRng([1, 4, 5]) });
		assert.equal(result.total, 9);
		assert.deepEqual(result.groups[0].rerolled, [1]);
	});

	it("rerolls recursively", () => {
		const result = rollExpression(parse("1d6rr<3"), { rng: fixedRng([1, 2, 6]) });
		assert.equal(result.total, 6);
		assert.deepEqual(result.groups[0].rerolled, [1, 2]);
	});

	it("explodes on max face by default", () => {
		const result = rollExpression(parse("1d6x"), { rng: fixedRng([6, 6, 2]) });
		assert.equal(result.total, 14);
		assert.deepEqual(result.groups[0].rolls, [6, 6, 2]);
	});

	it("explodes once with xo", () => {
		const result = rollExpression(parse("1d6xo"), { rng: fixedRng([6, 6, 6]) });
		assert.equal(result.total, 12);
	});

	it("clamps with min and max", () => {
		assert.equal(rollExpression(parse("1d20min10"), { rng: fixedRng([3]) }).total, 10);
		assert.equal(rollExpression(parse("1d20max10"), { rng: fixedRng([19]) }).total, 10);
	});

	it("counts successes", () => {
		const result = rollExpression(parse("5d10cs>=7"), { rng: fixedRng([7, 2, 10, 6, 8]) });
		assert.equal(result.total, 3);
	});

	it("subtracts a dice group", () => {
		const result = rollExpression(parse("1d8-1d4"), { rng: fixedRng([7, 3]) });
		assert.equal(result.total, 4);
	});

	it("respects operator precedence", () => {
		const result = rollExpression(parse("2+1d6*3"), { rng: fixedRng([4]) });
		assert.equal(result.total, 14);
	});

	it("honours parentheses and floor()", () => {
		const result = rollExpression(parse("floor((2d6+3)/2)"), { rng: fixedRng([3, 4]) });
		assert.equal(result.total, 5);
	});

	it("supports min()/max() functions", () => {
		assert.equal(rollExpression(parse("max(1d6, 4)"), { rng: fixedRng([2]) }).total, 4);
		assert.equal(rollExpression(parse("min(1d6, 4)"), { rng: fixedRng([2]) }).total, 2);
	});

	it("rolls fudge dice in -1..1", () => {
		const result = roll("4dF");
		assert.ok(result.total >= -4 && result.total <= 4);
		for (const v of result.groups[0].rolls) assert.ok(v >= -1 && v <= 1);
	});

	it("flags natural max and natural min on kept dice", () => {
		assert.equal(rollExpression(parse("1d20"), { rng: fixedRng([20]) }).hasMax, true);
		assert.equal(rollExpression(parse("1d20"), { rng: fixedRng([1]) }).hasMin, true);
		assert.equal(rollExpression(parse("1d20"), { rng: fixedRng([11]) }).hasMax, false);
	});

	it("does not flag a dropped 20 as a natural max", () => {
		const result = rollExpression(parse("2d20kl1"), { rng: fixedRng([20, 4]) });
		assert.equal(result.hasMax, false);
	});

	it("rejects division by zero", () => {
		assert.throws(() => roll("1d6/0"), /Division by zero/);
	});

	it("stays inside the declared range over many rolls", () => {
		for (let i = 0; i < 500; i++) {
			const total = roll("3d6+2").total;
			assert.ok(total >= 5 && total <= 20, `3d6+2 produced ${total}`);
		}
	});

	it("uses every face of a d6 across many rolls", () => {
		const seen = new Set<number>();
		for (let i = 0; i < 400; i++) seen.add(roll("1d6").total);
		assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
	});
});

describe("splitRepeat", () => {
	it("reads the Roll20-style N# prefix", () => {
		assert.deepEqual(splitRepeat("6#4d6kh3"), { times: 6, expression: "4d6kh3" });
	});

	it("accepts Nx as well", () => {
		assert.deepEqual(splitRepeat("6x4d6kh3"), { times: 6, expression: "4d6kh3" });
	});

	it("tolerates spaces around the separator", () => {
		assert.deepEqual(splitRepeat(" 3 # 1d20+5 "), { times: 3, expression: "1d20+5" });
	});

	it("defaults to one roll", () => {
		assert.deepEqual(splitRepeat("4d6kh3"), { times: 1, expression: "4d6kh3" });
	});

	it("does not mistake the explode modifier for a repeat", () => {
		assert.deepEqual(splitRepeat("1d6x"), { times: 1, expression: "1d6x" });
		assert.deepEqual(splitRepeat("2d6xo6"), { times: 1, expression: "2d6xo6" });
	});

	it("does not mistake a label for a repeat", () => {
		assert.deepEqual(splitRepeat("4d6kh3 # stats"), { times: 1, expression: "4d6kh3 # stats" });
	});

	it("keeps a label that follows a repeat", () => {
		const { times, expression } = splitRepeat("6#4d6kh3 # ability scores");
		assert.equal(times, 6);
		assert.equal(parse(expression).label, "ability scores");
	});

	it("refuses an absurd repeat count", () => {
		assert.throws(() => splitRepeat("999#1d6"), /Refusing to repeat/);
		assert.throws(() => splitRepeat("0#1d6"), /at least 1/);
	});

	it("allows exactly the limit", () => {
		assert.equal(splitRepeat(`${MAX_REPEATS}#1d6`).times, MAX_REPEATS);
	});

	it("produces independent rolls when applied", () => {
		const { times, expression } = splitRepeat("6#4d6kh3");
		const totals = Array.from({ length: times }, () => roll(expression).total);
		assert.equal(totals.length, 6);
		for (const total of totals) assert.ok(total >= 3 && total <= 18, `4d6kh3 gave ${total}`);
		// Six identical totals is possible but vanishingly unlikely; a shared result
		// would mean the expression was rolled once and copied.
		const attempts = Array.from({ length: 20 }, () =>
			Array.from({ length: 6 }, () => roll(expression).total),
		);
		assert.ok(
			attempts.some((set) => new Set(set).size > 1),
			"repeated rolls are not independent",
		);
	});
});

describe("formatting", () => {
	it("shows dropped dice struck through", () => {
		const result = rollExpression(parse("4d6kh3"), { rng: fixedRng([1, 6, 3, 5]) });
		assert.equal(formatRoll(result), "4d6kh3: [~~1~~, 6, 3, 5] = **14**");
	});

	it("keeps a single die terse", () => {
		const result = rollExpression(parse("1d20"), { rng: fixedRng([14]) });
		assert.equal(formatRoll(result), "1d20: [14] = **14**");
	});

	it("includes the label", () => {
		const result = rollExpression(parse("1d20+5 # stealth"), { rng: fixedRng([9] ) });
		assert.equal(formatRoll(result), "1d20+5 # stealth (stealth): [9] + 5 = **14**");
	});

	it("summarises dice for logs", () => {
		assert.equal(diceSummary(parse("4d6kh3+1d4")), "4d6kh3, 1d4");
	});
});

describe("analyze", () => {
	it("computes 2d6 exactly", () => {
		const dist = analyze("2d6");
		assert.equal(dist.isSimulated, false);
		assert.equal(dist.min, 2);
		assert.equal(dist.max, 12);
		assert.ok(Math.abs(dist.mean - 7) < 1e-9);
		assert.ok(Math.abs((dist.probabilities.get(7) ?? 0) - 6 / 36) < 1e-9);
	});

	it("sums to probability 1", () => {
		const total = [...analyze("3d6+2").probabilities.values()].reduce((a, b) => a + b, 0);
		assert.ok(Math.abs(total - 1) < 1e-9);
	});

	it("simulates when keep/drop is involved", () => {
		const dist = analyze("4d6kh3", 20_000);
		assert.equal(dist.isSimulated, true);
		// True mean of 4d6 keep highest 3 is 12.2446.
		assert.ok(Math.abs(dist.mean - 12.24) < 0.15, `mean was ${dist.mean}`);
	});

	it("computes hit chance against a DC", () => {
		const dist = analyze("1d20+5");
		assert.ok(Math.abs(chanceOf(dist, 15, "atLeast") - 0.55) < 1e-9);
	});

	it("places a roll in its distribution", () => {
		const dist = analyze("2d6");
		assert.ok(percentileOf(dist, 7) > 40 && percentileOf(dist, 7) < 60);
		assert.ok(percentileOf(dist, 12) > 95);
	});
});

describe("seeded rng", () => {
	it("reproduces the same rolls for the same seed", () => {
		const a = rollExpression(parse("6d20"), { rng: seededRandomSource("mimic") });
		const b = rollExpression(parse("6d20"), { rng: seededRandomSource("mimic") });
		assert.deepEqual(a.groups[0].rolls, b.groups[0].rolls);
	});

	it("differs across seeds", () => {
		const a = rollExpression(parse("6d20"), { rng: seededRandomSource("mimic") });
		const b = rollExpression(parse("6d20"), { rng: seededRandomSource("beholder") });
		assert.notDeepEqual(a.groups[0].rolls, b.groups[0].rolls);
	});
});
