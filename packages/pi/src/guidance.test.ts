/**
 * Guidance selection, tested directly rather than through a session.
 *
 * The extension suite has exactly one campaign and it is 5E, so every assertion
 * there about "the right system's guidance" passes whatever the resolver does. Two
 * mutations proved it: hardcoding 5E guidance for every system, and ignoring the
 * PF2E printing entirely, both left the whole suite green.
 *
 * That is the recurring shape -- a check whose positive case never occurs in the
 * fixtures is untested by construction -- so the cases below name every system.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GUIDANCE_TOPICS, guidanceTopic, sessionGuidance, systemGuidanceId } from "./guidance.ts";

describe("guidance selection", () => {
	const cases: Array<{ system: string; edition?: string; id: string }> = [
		{ system: "5e", id: "5e-2024" },
		{ system: "5e", edition: "2024", id: "5e-2024" },
		{ system: "5e", edition: "2014", id: "5e-2014" },
		{ system: "D&D", id: "5e-2024" },
		{ system: "dnd5e", edition: "2014", id: "5e-2014" },
		{ system: "pf2e", id: "pf2e-remaster" },
		{ system: "pf2e", edition: "remaster", id: "pf2e-remaster" },
		{ system: "pf2e", edition: "legacy", id: "pf2e-legacy" },
		{ system: "Pathfinder 2E", edition: "legacy", id: "pf2e-legacy" },
		{ system: "pf1e", id: "pf1e" },
		{ system: "generic", id: "generic" },
		{ system: "Troika", id: "generic" },
		{ system: "Call of Cthulhu", id: "generic" },
	];

	for (const { system, edition, id } of cases) {
		it(`maps ${JSON.stringify(system)}${edition ? ` (${edition})` : ""} to ${id}`, () => {
			assert.equal(systemGuidanceId(system, edition), id);
		});
	}

	it("defaults to the newer printing, never the older one", () => {
		// The rule the prose states, asserted rather than trusted.
		assert.equal(systemGuidanceId("5e"), "5e-2024");
		assert.equal(systemGuidanceId("pf2e"), "pf2e-remaster");
	});

	it("gives an unknown system generic guidance, not 5E's", () => {
		// Inventing rules for someone else's system is worse than admitting there are none.
		const text = sessionGuidance("Call of Cthulhu");
		assert.match(text, /System guidance: generic/);
		assert.doesNotMatch(text, /weapon mastery/i);
		assert.doesNotMatch(text, /force barrage/i);
	});
});

describe("guidance content", () => {
	it("serves each system its own printing and not the other", () => {
		const five = sessionGuidance("5e", "2024");
		const legacy = sessionGuidance("pf2e", "legacy");
		const remaster = sessionGuidance("pf2e", "remaster");

		assert.match(five, /weapon mastery/i);
		assert.doesNotMatch(five, /force barrage/i);

		// The distinguishing fact of each PF2E printing.
		assert.match(remaster, /force barrage/i);
		assert.match(legacy, /original names|Core Rulebook/i);
		assert.doesNotMatch(legacy, /force barrage/i);
	});

	it("always includes the core loop", () => {
		for (const system of ["5e", "pf2e", "pf1e", "generic", "Some Homebrew"]) {
			const text = sessionGuidance(system);
			assert.match(text, /The scene loop/, `${system} lost the core guidance`);
			assert.match(text, /portent_oracle/, `${system} lost the oracle instruction`);
		}
	});

	it("names the deep topics without inlining them", () => {
		const text = sessionGuidance("5e");
		for (const topic of GUIDANCE_TOPICS) {
			assert.ok(text.includes(topic), `${topic} is not offered`);
		}
		// Progressive disclosure: the walkthrough itself stays out of the prompt.
		assert.ok(text.length < 20_000, `standing guidance is ${text.length} chars — a topic was inlined`);
	});

	it("has every topic on disk", () => {
		for (const topic of GUIDANCE_TOPICS) {
			const body = guidanceTopic(topic);
			assert.ok(body && body.length > 200, `${topic} is missing or too short to be useful`);
		}
	});

	it("is deterministic, which is what keeps the prompt cached", () => {
		// The standing briefing goes in the system prompt. If it varied at all, the
		// provider's cached prefix would break on every turn.
		assert.equal(sessionGuidance("5e", "2024"), sessionGuidance("5e", "2024"));
	});
});
