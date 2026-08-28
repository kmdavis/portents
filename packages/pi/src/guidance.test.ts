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

import { commonContent } from "@portents/content";
import { createRegistry } from "@portents/core";

import { availableSystems, GUIDANCE_TOPICS, guidanceTopic, sessionGuidance } from "./guidance.ts";

/** The real bundled registry, so this tests what a session actually gets. */
const registry = createRegistry(commonContent);
const guidanceFor = (system: string, edition?: string) => sessionGuidance(registry, system, edition);

describe("guidance selection", () => {
	const cases: Array<{ system: string; edition?: string; id: string }> = [
		{ system: "5e", id: "dnd-5e-2024" },
		{ system: "5e", edition: "2024", id: "dnd-5e-2024" },
		{ system: "5e", edition: "2014", id: "dnd-5e-2014" },
		{ system: "d&d 5e", id: "dnd-5e-2024" },
		{ system: "dnd 5e", edition: "2014", id: "dnd-5e-2014" },
		{ system: "pf2e", id: "pf2e-remaster" },
		{ system: "pf2e", edition: "remaster", id: "pf2e-remaster" },
		{ system: "pf2e", edition: "legacy", id: "pf2e-legacy" },
		{ system: "Pathfinder 2E", edition: "legacy", id: "pf2e-legacy" },
		{ system: "pf1e", id: "pf1e" },
		{ system: "generic", id: "generic" },
		{ system: "Troika", id: "none" },
		{ system: "Call of Cthulhu", id: "none" },
	];

	for (const { system, edition, id } of cases) {
		it(`maps ${JSON.stringify(system)}${edition ? ` (${edition})` : ""} to ${id}`, () => {
			const line = edition ? `${system} (${edition})` : system;
			const found = registry.guidanceFor(line) ?? registry.guidanceFor(system);
			if (id === "none") {
				assert.equal(found, undefined, `${line} matched ${found?.id}, but nothing should claim it`);
			} else {
				assert.equal(found?.id, id);
			}
		});
	}

	it("defaults to the newer printing, never the older one", () => {
		// The rule the prose states, asserted rather than trusted.
		assert.equal(registry.guidanceFor("5e")?.id, "dnd-5e-2024");
		assert.equal(registry.guidanceFor("pf2e")?.id, "pf2e-remaster");
	});

	it("says so when nothing claims the system, rather than serving 5E's", () => {
		// Inventing rules for someone else's system is worse than admitting there are
		// none, and quietly serving 5E's would be worst of all.
		const text = guidanceFor("Call of Cthulhu");
		assert.match(text, /none loaded for "Call of Cthulhu"/);
		assert.match(text, /say plainly that they are rulings/);
		assert.doesNotMatch(text, /weapon mastery/i);
		assert.doesNotMatch(text, /force barrage/i);
	});
});

describe("guidance content", () => {
	it("serves each system its own printing and not the other", () => {
		const five = guidanceFor("5e", "2024");
		const legacy = guidanceFor("pf2e", "legacy");
		const remaster = guidanceFor("pf2e", "remaster");

		assert.match(five, /weapon mastery/i);
		assert.doesNotMatch(five, /force barrage/i);

		// The distinguishing fact of each PF2E printing.
		assert.match(remaster, /force barrage/i);
		assert.match(legacy, /original names|Core Rulebook/i);
		assert.doesNotMatch(legacy, /force barrage/i);
	});

	it("always includes the core loop", () => {
		for (const system of ["5e", "pf2e", "pf1e", "generic", "Some Homebrew"]) {
			const text = guidanceFor(system);
			assert.match(text, /The scene loop/, `${system} lost the core guidance`);
			assert.match(text, /portents_oracle/, `${system} lost the oracle instruction`);
		}
	});

	it("names the deep topics without inlining them", () => {
		const text = guidanceFor("5e");
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

	it("keeps system rules out of the harness guidance", () => {
		// The boundary this refactor exists to create: core.md describes how to run a
		// session, the content packs describe the rules. A rule that drifts back in here
		// is a rule that then disagrees with the pack shipping the sheet scaffold.
		const core = guidanceFor("generic").split("---")[0];
		for (const term of [/\b5E\b/i, /\bPF2E\b/i, /\b2024\b/, /\b2014\b/, /remaster/i, /Pathfinder/i, /advantage/i]) {
			assert.doesNotMatch(core, term, `system-specific material is back in core.md: ${term}`);
		}
	});

	it("offers the systems the registry actually has", () => {
		// Derived, not hardcoded: installing a pack for another system should make it
		// offerable without editing this package.
		const systems = availableSystems(registry);
		assert.ok(systems.length >= 6, `only ${systems.length} systems offered`);
		assert.ok(
			systems.some((entry) => entry.includes("5e")),
			`no fifth-edition entry in: ${systems.join(", ")}`,
		);
		assert.ok(systems.some((entry) => entry.includes("pf2e")));
		assert.ok(systems.some((entry) => entry.includes("generic")));
	});

	it("is deterministic, which is what keeps the prompt cached", () => {
		// The standing briefing goes in the system prompt. If it varied at all, the
		// provider's cached prefix would break on every turn.
		assert.equal(guidanceFor("5e", "2024"), guidanceFor("5e", "2024"));
	});
});
