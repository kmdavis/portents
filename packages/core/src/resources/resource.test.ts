import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertResource,
	assertSetting,
	formatResourceList,
	isNamespacedId,
	isResourceSegment,
	MAX_RESOURCE_CHARACTERS,
	parseResourceDocument,
	queryResourceRecords,
	resourceAudience,
	resourceProblems,
	stringifyResourceDocument,
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

describe("resource Markdown", () => {
	it("round-trips the envelope, prose, and unknown additive frontmatter", () => {
		const original = resource({
			audience: ["gm", "participant/alice"],
			supersedes: "portents/greywater/place/old-shrine",
			metadata: { weather: "rain", clues: ["bell", "token"], state: { danger: 3 } },
			body: "## What Nesta knows\n\nThe token is false.\n",
		});
		assert.deepEqual(parseResourceDocument(stringifyResourceDocument(original)), original);
	});

	it("accepts a scalar as a one-item source list", () => {
		const parsed = parseResourceDocument([
			"---",
			"schemaVersion: 1",
			"id: portents/greywater/place/shrine",
			"settingId: portents/greywater",
			"kind: place",
			"name: Shrine",
			"tags: river",
			"---",
			"",
			"Old stones.",
		].join("\n"));
		assert.deepEqual(parsed.tags, ["river"]);
	});

	it("rejects missing, malformed, and future envelopes", () => {
		assert.throws(() => parseResourceDocument("Just prose."), /schemaVersion[\s\S]*namespaced[\s\S]*kind[\s\S]*name/);
		assert.throws(
			() => parseResourceDocument("---\nschemaVersion: 2\nid: portents/x/note/y\nkind: note\nname: Y\n---\n"),
			/schemaVersion must be 1/,
		);
	});

	it("refuses an oversized file before parsing it", () => {
		assert.throws(() => parseResourceDocument("x".repeat(MAX_RESOURCE_CHARACTERS + 1)), /split it/);
	});
});

describe("deterministic resource query", () => {
	const packRecord = (document: ResourceDocument) => ({ origin: "pack" as const, packId: "greywater", immutable: true as const, resource: document });
	const campaignRecord = (document: ResourceDocument) => ({
		origin: "campaign" as const,
		campaignSlug: "hollow-oath",
		path: `${document.kind}/local.md`,
		immutable: false as const,
		resource: document,
	});

	it("ranks exact names, aliases, ids, tags, and body in that order", () => {
		const records = [
			packRecord(resource({ id: "portents/greywater/npc/body", kind: "npc", name: "Body", body: "Nesta waits here." })),
			packRecord(resource({ id: "portents/greywater/npc/tag", kind: "npc", name: "Tag", tags: ["Nesta"], body: "x" })),
			packRecord(resource({ id: "portents/greywater/npc/alias", kind: "npc", name: "Alias", aliases: ["Nesta"], body: "x" })),
			packRecord(resource({ id: "portents/greywater/npc/nesta", kind: "npc", name: "Nesta", body: "x" })),
		];
		assert.deepEqual(queryResourceRecords(records, { text: "Nesta" }).map((record) => record.resource.name), [
			"Nesta",
			"Alias",
			"Tag",
			"Body",
		]);
	});

	it("requires every query term and normalizes case and accents", () => {
		const records = [packRecord(resource({ name: "Café Shrine", body: "Beside the river." }))];
		assert.equal(queryResourceRecords(records, { text: "CAFE river" }).length, 1);
		assert.equal(queryResourceRecords(records, { text: "cafe mountain" }).length, 0);
	});

	it("filters kind, setting, visibility, and limit", () => {
		const records = [
			packRecord(resource({ id: "portents/greywater/npc/nesta", kind: "npc", name: "Nesta", audience: ["gm"] })),
			packRecord(resource({ id: "portents/greywater/place/shrine", kind: "place", name: "Shrine", audience: ["all"] })),
		];
		assert.deepEqual(queryResourceRecords(records, { kind: "place", audience: "participant/alice", limit: 1 }).map((record) => record.resource.name), ["Shrine"]);
		assert.equal(queryResourceRecords(records, { settingId: "other/setting" }).length, 0);
	});

	it("puts campaign developments before pack canon at an equal rank", () => {
		const pack = packRecord(resource({ id: "portents/greywater/npc/nesta", kind: "npc", name: "Nesta", body: "Canon." }));
		const local = campaignRecord(resource({ id: "campaign/hollow-oath/npc/nesta", settingId: undefined, kind: "npc", name: "Nesta", body: "Now missing." }));
		assert.deepEqual(queryResourceRecords([pack, local], { text: "Nesta" }).map((record) => record.origin), ["campaign", "pack"]);
	});

	it("formats enough identity to choose an exact read", () => {
		const text = formatResourceList([campaignRecord(resource({ id: "campaign/hollow-oath/npc/nesta", settingId: undefined, kind: "npc", name: "Nesta" }))]);
		assert.match(text, /campaign\/hollow-oath\/npc\/nesta/);
		assert.match(text, /Nesta.*npc.*campaign:npc\/local\.md/);
		assert.match(text, /exact `id`/);
		assert.equal(formatResourceList([]), "No matching setting or campaign resources.");
	});

	it("uses stable id order instead of insertion order for ties", () => {
		const a = packRecord(resource({ id: "portents/greywater/npc/a", kind: "npc", name: "A", body: "river" }));
		const b = packRecord(resource({ id: "portents/greywater/npc/b", kind: "npc", name: "B", body: "river" }));
		assert.deepEqual(queryResourceRecords([b, a], { text: "river" }).map((record) => record.resource.id), [a.resource.id, b.resource.id]);
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
