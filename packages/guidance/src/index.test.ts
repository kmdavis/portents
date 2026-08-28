/**
 * The guidance package.
 *
 * Mostly generated strings, so the interesting assertions are about what the prose
 * must and must not contain -- the constraints that made this a package instead of
 * files in the pi extension.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CORE_GUIDANCE, GUIDANCE_TOPICS, guidanceTopic, isGuidanceTopic } from "./index.ts";

describe("core guidance", () => {
	it("ships the session loop", () => {
		assert.ok(CORE_GUIDANCE.length > 4000, `core guidance is only ${CORE_GUIDANCE.length} chars`);
		for (const heading of ["The scene loop", "Who rolls", "Session zero"]) {
			assert.ok(CORE_GUIDANCE.includes(heading), `core guidance lost "${heading}"`);
		}
	});

	it("states both dice rules, which prompting alone keeps losing", () => {
		// The two rules that are load-bearing for solo play, and the reason a ledger
		// exists at all.
		assert.match(CORE_GUIDANCE, /Never state a die result|every number you do state must be real/i);
		assert.match(CORE_GUIDANCE, /World generation: cite nothing/);
	});

	it("carries no system rules", () => {
		// The boundary this package exists to hold. System rules live on the content
		// packs, keyed by system, so a printing change touches one package.
		for (const term of [/\b5E\b/i, /\bPF2E\b/i, /\b2024\b/, /\b2014\b/, /remaster/i, /Pathfinder/i, /advantage/i]) {
			assert.doesNotMatch(CORE_GUIDANCE, term, `system-specific material leaked into core guidance: ${term}`);
		}
	});

	it("has no filesystem dependency, so a browser can use it", async () => {
		// The actual reason this is a package. `node:fs` here would put the demo site
		// back to duplicating the prose.
		const source = await import("./index.ts");
		assert.ok(source.CORE_GUIDANCE, "core guidance did not load");
		const { readFileSync } = await import("node:fs");
		const own = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
		const generated = readFileSync(new URL("./generated.ts", import.meta.url), "utf8");
		// Imports, not mentions. An earlier version of this assertion matched the
		// docblock explaining why `node:fs` is no longer used here, which is the kind of
		// false positive that gets a good test deleted.
		const imports = (text: string) => [...text.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
		for (const [label, text] of [
			["index.ts", own],
			["generated.ts", generated],
		] as const) {
			for (const specifier of imports(text)) {
				assert.ok(!specifier.startsWith("node:"), `${label} imports ${specifier}`);
			}
		}
	});
});

describe("topics", () => {
	it("ships the three deep topics", () => {
		assert.deepEqual([...GUIDANCE_TOPICS], ["character-creation", "combat", "solo-techniques"]);
	});

	it("returns a body for each", () => {
		for (const topic of GUIDANCE_TOPICS) {
			const body = guidanceTopic(topic);
			assert.ok(body && body.length > 500, `${topic} is missing or too short to be useful`);
			assert.match(body, /^#\s/, `${topic} does not start with a heading`);
		}
	});

	it("returns undefined for a topic that does not exist", () => {
		assert.equal(guidanceTopic("nonsense"), undefined);
		assert.equal(isGuidanceTopic("nonsense"), false);
		assert.equal(isGuidanceTopic("combat"), true);
	});

	it("is not fooled by inherited object properties", () => {
		// `TOPICS[topic]` on a plain object would happily return Object.prototype
		// members, so "constructor" would look like a valid topic.
		assert.equal(isGuidanceTopic("constructor"), false);
		assert.equal(isGuidanceTopic("toString"), false);
	});

	it("keeps system rules out of the topics too", () => {
		// combat.md is where they were, so this is the one most likely to regress.
		const combat = guidanceTopic("combat")!;
		assert.doesNotMatch(combat, /## 5E specifics/);
		assert.doesNotMatch(combat, /## PF2E specifics/);
		assert.match(combat, /system-specific turn structure is in this campaign's system guidance/i);
	});
});
