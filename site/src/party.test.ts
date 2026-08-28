/**
 * Party display arithmetic.
 *
 * Small, but the input is free text a player can hand-edit in their own sheet, so it
 * has to survive whatever is actually in there rather than the shape we hope for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isHurt, PARTY_STAT_KEYS } from "./party.ts";

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
