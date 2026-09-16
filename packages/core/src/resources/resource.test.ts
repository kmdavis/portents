import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertResource,
	assertSetting,
	isNamespacedId,
	isResourceSegment,
	MAX_RESOURCE_CHARACTERS,
	resourceAudience,
	resourceProblems,
	settingProblems,
	type ResourceDocument,
} from "./resource.ts";

const resource = (overrides: Partial<ResourceDocument> = {}): ResourceDocument => ({
	schemaVersion: 1,
	id: "portents/greywater/place/riverside-shrine",
	settingId: "portents/greywater",
	kind: "place",
	name: "Old Riverside Shrine",
	aliases: ["riverside shrine", "old shrine"],
	tags: ["river", "ward"],
	links: ["portents/greywater/faction/river-cult"],
	audience: ["gm"],
	body: "The shrine predates the present river cult.",
	...overrides,
});

describe("resource identity", () => {
	it("accepts stable lowercase path-like ids", () => {
		assert.equal(isNamespacedId("portents/greywater"), true);
		assert.equal(isNamespacedId("portents/greywater/npc/nesta-2"), true);
	});

	it("rejects unnamespaced, uppercase, empty, and traversal-shaped ids", () => {
		for (const id of ["nesta", "Portents/greywater", "portents//nesta", "portents/../nesta", "/portents/nesta"]) {
			assert.equal(isNamespacedId(id), false, id);
		}
	});

	it("allows open resource kinds without allowing paths", () => {
		assert.equal(isResourceSegment("family-tree"), true);
		assert.equal(isResourceSegment("npc"), true);
		assert.equal(isResourceSegment("NPC"), false);
		assert.equal(isResourceSegment("places/city"), false);
	});
});

describe("setting contract", () => {
	it("accepts a system-neutral setting", () => {
		assert.deepEqual(
			settingProblems({ schemaVersion: 1, id: "portents/greywater", name: "Greywater", summary: "A river province." }),
			[],
		);
	});

	it("requires a known version, namespace, name and summary", () => {
		const problems = settingProblems({ schemaVersion: 2 as 1, id: "greywater", name: " ", summary: "" });
		assert.ok(problems.some((problem) => problem.includes("schemaVersion")));
		assert.ok(problems.some((problem) => problem.includes("namespaced")));
		assert.ok(problems.some((problem) => problem.includes("name")));
		assert.ok(problems.some((problem) => problem.includes("summary")));
	});

	it("throws one error containing every contract problem", () => {
		assert.throws(
			() => assertSetting({ schemaVersion: 1, id: "bad", name: "", summary: "" }),
			/id must[\s\S]*name must[\s\S]*summary must/,
		);
	});
});

describe("resource contract", () => {
	it("accepts arbitrary Markdown in a small typed envelope", () => {
		assert.equal(assertResource(resource()).body, "The shrine predates the present river cult.");
	});

	it("requires a packaged resource id to live beneath its setting id", () => {
		const problems = resourceProblems(resource({ id: "somewhere/else/place/shrine" }));
		assert.deepEqual(problems, ['packaged resource id must start with settingId plus "/": portents/greywater/']);
	});

	it("allows a campaign-only document with no setting", () => {
		assert.deepEqual(
			resourceProblems(resource({ id: "campaign/hollow-oath/note/house-ruling", settingId: undefined })),
			[],
		);
	});

	it("allows a campaign development to point at packaged canon", () => {
		assert.deepEqual(
			resourceProblems(
				resource({
					id: "campaign/hollow-oath/npc/nesta-after-flood",
					settingId: undefined,
					supersedes: "portents/greywater/npc/nesta",
				}),
			),
			[],
		);
	});

	it("defaults missing visibility to GM-only", () => {
		assert.deepEqual(resourceAudience(resource({ audience: undefined })), ["gm"]);
		assert.deepEqual(resourceAudience(resource({ audience: ["all"] })), ["all"]);
	});

	it("accepts participant-specific visibility", () => {
		assert.deepEqual(resourceProblems(resource({ audience: ["gm", "participant/alice"] })), []);
	});

	it("rejects all combined with a narrower audience", () => {
		assert.ok(resourceProblems(resource({ audience: ["all", "gm"] })).some((problem) => problem.includes("cannot be combined")));
	});

	it("rejects malformed links, visibility, and supersedes ids", () => {
		const problems = resourceProblems(
			resource({ links: ["Nesta"], audience: ["participant/Alice" as "gm"], supersedes: "nesta" }),
		);
		assert.ok(problems.some((problem) => problem.includes("link must")));
		assert.ok(problems.some((problem) => problem.includes("invalid audience")));
		assert.ok(problems.some((problem) => problem.includes("supersedes")));
	});

	it("reports duplicate metadata values", () => {
		const problems = resourceProblems(resource({ aliases: ["shrine", "shrine"], tags: ["river", "river"] }));
		assert.ok(problems.some((problem) => problem.includes("aliases contains duplicates")));
		assert.ok(problems.some((problem) => problem.includes("tags contains duplicates")));
	});

	it("reserves envelope keys from additive metadata", () => {
		assert.deepEqual(resourceProblems(resource({ metadata: { weather: "rain" } })), []);
		assert.ok(resourceProblems(resource({ metadata: { name: "Other" } })).some((problem) => problem.includes("reserved key")));
	});

	it("bounds a topic so one file cannot become the old world.md again", () => {
		assert.deepEqual(resourceProblems(resource({ body: "x".repeat(MAX_RESOURCE_CHARACTERS) })), []);
		assert.ok(resourceProblems(resource({ body: "x".repeat(MAX_RESOURCE_CHARACTERS + 1) })).some((problem) => problem.includes("split it")));
	});
});
