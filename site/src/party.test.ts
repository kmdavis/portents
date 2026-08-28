/**
 * Party display arithmetic.
 *
 * Small, but the input is free text a player can hand-edit in their own sheet, so it
 * has to survive whatever is actually in there rather than the shape we hope for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALWAYS_SHOWN, isHurt, PARTY_STAT_KEYS, statusOf } from "./party.ts";

describe("isHurt", () => {
	it("flags at or below half", () => {
		assert.equal(isHurt("13/26"), true);
		assert.equal(isHurt("12/26"), true);
		assert.equal(isHurt("0/26"), true);
	});

	it("does not flag above half", () => {
		assert.equal(isHurt("14/26"), false);
		assert.equal(isHurt("26/26"), false);
	});

	it("flags negative current hit points", () => {
		// Some tables track damage past zero, and a character on -3 is certainly hurt.
		assert.equal(isHurt("-3/26"), true);
	});

	it("tolerates whatever the player typed", () => {
		assert.equal(isHurt(" 13 / 26 "), true);
		assert.equal(isHurt("13/26 (bloodied)"), true);
	});

	it("does not flag what it cannot read", () => {
		// Better to leave a number uncoloured than to colour it on a guess.
		for (const value of ["", "26", "healthy", "26/0", "/26", "abc/def"]) {
			assert.equal(isHurt(value), false, `${JSON.stringify(value)} was flagged`);
		}
	});
});

describe("party stat keys", () => {
	it("covers the keys the bundled systems' sheets use", () => {
		// Fifth edition and both Pathfinder printings write different status keys; one
		// list serves all of them because absent keys are skipped.
		for (const key of ["HP", "AC", "Death Saves", "Hero Points", "Dying", "Wounded"]) {
			assert.ok(PARTY_STAT_KEYS.includes(key), `${key} would never be shown`);
		}
	});

	it("stays short enough for a small card", () => {
		assert.ok(PARTY_STAT_KEYS.length <= 10, "the card is not a sheet");
	});

	it("lists HP first, which is what a player looks for", () => {
		assert.equal(PARTY_STAT_KEYS[0], "HP");
	});
});

describe("always-shown keys", () => {
	it("includes HP and AC", () => {
		// Shown even when absent, so a missing value reads as "not recorded" rather than
		// vanishing. The alternative hides that the GM never wrote them down.
		assert.deepEqual([...ALWAYS_SHOWN], ["HP", "AC"]);
	});

	it("only names keys the card would show anyway", () => {
		for (const key of ALWAYS_SHOWN) {
			assert.ok(PARTY_STAT_KEYS.includes(key), `${key} is forced on but not in the key list`);
		}
	});
});

describe("reading status off a sheet", () => {
	it("finds keys nested under status, which is where they live", () => {
		// The bug: the card read data[key] and found nothing, so a character the fiction
		// called wounded displayed no hit points, and it looked like the GM's fault.
		const status = statusOf({ name: "Ossiran", status: { HP: "17/26", AC: "18" } });
		assert.equal(status.HP, "17/26");
		assert.equal(status.AC, "18");
	});

	it("also accepts top-level keys a player typed by hand", () => {
		// The sheet is the player's file. Someone writing HP at the root should not be
		// silently ignored.
		assert.equal(statusOf({ name: "x", HP: "9/9" }).HP, "9/9");
	});

	it("prefers the nested value when both exist", () => {
		// Nested is what the engine writes, so it is the current one.
		assert.equal(statusOf({ HP: "1/1", status: { HP: "17/26" } }).HP, "17/26");
	});

	it("coerces numbers, which YAML produces for a bare AC", () => {
		assert.equal(statusOf({ status: { AC: 18 } }).AC, "18");
	});

	it("survives a sheet with no status at all", () => {
		assert.deepEqual(statusOf({ name: "x" }), {});
		assert.deepEqual(statusOf(undefined), {});
		assert.deepEqual(statusOf({ status: "not an object" }), {});
	});
});
