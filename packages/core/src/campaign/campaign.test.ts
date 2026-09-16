import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MemoryStorage } from "../adapters/memory/index.ts";
import type { Deck } from "../decks/deck.ts";
import { createRegistry } from "../packs/registry.ts";
import type { ResourceDocument } from "../resources/resource.ts";
import { parseDocument } from "../sheets/frontmatter.ts";
import { getSection, parseSheet, statusValue } from "../sheets/sheet.ts";
import { tickingClock } from "../ports/clock.ts";
import { seededRandomSource } from "../ports/random.ts";
import { Campaign, CampaignError, campaignKeys, slugify, WORLD_SECTIONS } from "./campaign.ts";

function deps(storage = new MemoryStorage()) {
	return {
		storage,
		clock: tickingClock("2026-03-01T18:00:00.000Z", 60_000),
		random: seededRandomSource("campaign-test"),
	};
}

const INPUT = {
	name: "The Bell of Wrenfield",
	system: "5e" as const,
	premise: "A drowned village rings its bell at midnight.",
	tone: "Damp, quiet, mounting dread.",
	safety: "- No harm to children.",
};

async function fresh() {
	const d = deps();
	return { d, campaign: await Campaign.create(d, INPUT) };
}

const SETTING_ID = "portents/greywater";
const SHRINE_ID = "portents/greywater/place/riverside-shrine";
const settingRegistry = createRegistry([{
	id: "greywater-pack",
	settings: [{ schemaVersion: 1, id: SETTING_ID, name: "Greywater", summary: "A rain-soaked river province." }],
	resources: [{
		schemaVersion: 1,
		id: SHRINE_ID,
		settingId: SETTING_ID,
		kind: "place",
		name: "Old Riverside Shrine",
		aliases: ["old shrine"],
		tags: ["river"],
		audience: ["gm"],
		body: "The shrine predates the present river cult.",
	}],
}]);

async function freshWithSetting() {
	const d = { ...deps(), registry: settingRegistry };
	return { d, campaign: await Campaign.create(d, { ...INPUT, settingId: SETTING_ID }) };
}

const campaignResource = (overrides: Partial<ResourceDocument> = {}): ResourceDocument => ({
	schemaVersion: 1,
	id: "campaign/the-bell-of-wrenfield/npc/nesta",
	kind: "npc",
	name: "Nesta",
	aliases: ["shrine keeper"],
	tags: ["river"],
	links: [SHRINE_ID],
	body: "Nesta keeps the shrine and distrusts forged tokens.",
	...overrides,
});

describe("slugify", () => {
	it("makes a directory name from a title", () => {
		assert.equal(slugify("The Bell of Wrenfield"), "the-bell-of-wrenfield");
	});

	it("strips accents and punctuation", () => {
		assert.equal(slugify("Café Brûlé!"), "cafe-brule");
	});

	it("collapses runs and trims edges", () => {
		assert.equal(slugify("  --A   B--  "), "a-b");
	});

	it("caps length without leaving a trailing dash", () => {
		const slug = slugify("word ".repeat(40));
		assert.ok(slug.length <= 60);
		assert.doesNotMatch(slug, /-$/);
	});

	it("refuses a name with nothing usable in it", () => {
		assert.throws(() => slugify("!!!"), CampaignError);
	});
});

describe("creating a campaign", () => {
	it("writes markdown a person can read, with no state.json", async () => {
		const { d } = await fresh();
		const keys = campaignKeys("the-bell-of-wrenfield");
		for (const key of [keys.overview, keys.journal, keys.world]) {
			assert.ok(await d.storage.exists(key), `missing ${key}`);
		}
		const all = await d.storage.list("");
		assert.deepEqual(all.filter((key) => key.endsWith(".json")), [], "no JSON state file should exist");
	});

	it("puts state in frontmatter and prose in the body", async () => {
		const { d } = await fresh();
		const text = (await d.storage.read(campaignKeys("the-bell-of-wrenfield").overview))!;
		const { data, body } = parseDocument(text);
		assert.equal(data.name, "The Bell of Wrenfield");
		assert.equal(data.slug, "the-bell-of-wrenfield");
		// One freeform line, not two keys, and no quoting of a year that looks numeric.
		assert.equal(data.system, "5e (2024)");
		assert.ok(!("edition" in data), "edition should not be a separate key");
		assert.match(text, /^system: 5e \(2024\)$/m);
		assert.match(body, /## Premise/);
		assert.match(body, /A drowned village rings its bell at midnight\./);
		assert.match(body, /No harm to children\./);
	});

	it("defaults 5e to the 2024 printing", async () => {
		const { campaign } = await fresh();
		assert.equal(campaign.edition, "2024");
	});

	it("defaults pf2e to the remaster", async () => {
		const campaign = await Campaign.create(deps(), { name: "Ashes", system: "pf2e" });
		assert.equal(campaign.edition, "remaster");
	});

	it("honours an explicitly older printing", async () => {
		const campaign = await Campaign.create(deps(), { name: "Old Ways", system: "5e (2014)" });
		assert.equal(campaign.edition, "2014");
		assert.equal(campaign.systemLine, "5e (2014)");
	});

	it("refuses a printing from another system rather than quietly falling back", async () => {
		// A silent fallback hands the player the wrong character creation rules with
		// no way to notice.
		await assert.rejects(
			() => Campaign.create(deps(), { name: "Mixed", system: "5e (remaster)" }),
			/is a printing of "pf2e", not "5e"/,
		);
	});

	it("catches a typo in the printing", async () => {
		await assert.rejects(
			() => Campaign.create(deps(), { name: "Typo", system: "5e (2025)" }),
			/Unknown printing "2025"/,
		);
	});

	it("accepts a system it has never heard of", async () => {
		// Sheets already take whatever keys a system needs; refusing to record an
		// unusual system would contradict that.
		const campaign = await Campaign.create(deps(), { name: "Arkham", system: "Call of Cthulhu 7e" });
		assert.equal(campaign.system, "Call of Cthulhu 7e");
		assert.equal(campaign.edition, undefined);
		assert.equal(campaign.systemLine, "Call of Cthulhu 7e");
		assert.deepEqual(await campaign.problems(), [], "an unknown system should not be nagged about printings");
	});

	it("keeps an unknown system's printing verbatim", async () => {
		const campaign = await Campaign.create(deps(), { name: "Doskvol", system: "Blades in the Dark (2nd printing)" });
		assert.equal(campaign.system, "Blades in the Dark");
		assert.equal(campaign.edition, "2nd printing");
	});

	it("takes the printing as a separate argument too", async () => {
		const campaign = await Campaign.create(deps(), { name: "Old Ways 2", system: "5e", edition: "2014" });
		assert.equal(campaign.systemLine, "5e (2014)");
	});

	it("refuses a system line and edition that disagree", async () => {
		await assert.rejects(
			() => Campaign.create(deps(), { name: "Conflict", system: "5e (2024)", edition: "2014" }),
			/pick one/,
		);
	});

	it("gives a generic system no edition", async () => {
		const campaign = await Campaign.create(deps(), { name: "Freeform", system: "generic" });
		assert.equal(campaign.edition, undefined);
	});

	it("stubs the prose sections it has no content for", async () => {
		const campaign = await Campaign.create(deps(), { name: "Bare", system: "generic" });
		assert.equal(await campaign.overviewSection("Premise"), "_TBD_");
	});

	it("creates every world section", async () => {
		const { campaign } = await fresh();
		const world = await campaign.readWorld();
		for (const section of WORLD_SECTIONS) assert.match(world, new RegExp(`## ${section}`));
	});

	it("refuses a duplicate", async () => {
		const { d } = await fresh();
		await assert.rejects(() => Campaign.create(d, INPUT), /already exists/);
	});

	it("refuses a nameless campaign, or one with no system at all", async () => {
		await assert.rejects(() => Campaign.create(deps(), { name: "  ", system: "5e" }), /needs a name/);
		await assert.rejects(() => Campaign.create(deps(), { name: "X", system: "  " }), /needs a system/);
	});
});

describe("opening and listing", () => {
	it("reopens from disk with state intact", async () => {
		const { d, campaign } = await fresh();
		await campaign.setScene({ summary: "On the causeway.", location: "Wrenfield", tension: "tense" });
		await campaign.setClock("The tide returns", 2, 6, "then the causeway floods");

		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.equal(reopened.name, "The Bell of Wrenfield");
		assert.equal(reopened.scene?.summary, "On the causeway.");
		assert.equal(reopened.scene?.tension, "tense");
		assert.deepEqual(reopened.clocks, [
			{ name: "The tide returns", filled: 2, segments: 6, note: "then the causeway floods" },
		]);
	});

	it("explains itself when the campaign is not there", async () => {
		await assert.rejects(() => Campaign.open(deps(), "nope"), /No campaign "nope"/);
	});

	it("notices a directory renamed without its frontmatter", async () => {
		const { d } = await fresh();
		const keys = campaignKeys("the-bell-of-wrenfield");
		const text = (await d.storage.read(keys.overview))!;
		await d.storage.write("campaigns/renamed/campaign.md", text);
		await assert.rejects(() => Campaign.open(d, "renamed"), /calls itself "the-bell-of-wrenfield"/);
	});

	it("lists campaigns newest activity first", async () => {
		const d = deps();
		await Campaign.create(d, { name: "First", system: "5e" });
		const second = await Campaign.create(d, { name: "Second", system: "pf2e" });
		await second.setScene({ summary: "Later." });
		const list = await Campaign.list(d);
		assert.deepEqual(list.map((entry) => entry.slug), ["second", "first"]);
		assert.equal(list[0].edition, "remaster");
		assert.equal(list[0].systemLine, "pf2e (remaster)");
		assert.equal(list[0].scene, "Later.");
	});

	it("lists a campaign with broken frontmatter rather than hiding it", async () => {
		// Skipping it silently would make it invisible and unrecoverable.
		const d = deps();
		await Campaign.create(d, { name: "Good", system: "5e" });
		await d.storage.write("campaigns/broken/campaign.md", "---\n\tbad: tab\n---\n");
		const list = await Campaign.list(d);
		assert.ok(list.some((entry) => entry.slug === "broken" && /unreadable/.test(entry.name)));
	});

	it("returns nothing for an empty home", async () => {
		assert.deepEqual(await Campaign.list(deps()), []);
	});
});

describe("changing the system after creation", () => {
	it("leaves exactly one rules line, not a stale one plus a new one", async () => {
		// Checked against the whole file, not just the Rules section: the stale line
		// lived under the h1, so a section-only assertion passed while campaign.md
		// still contradicted itself. That weaker test survived the bug's reversion.
		const { d, campaign } = await fresh();
		await campaign.setSystem("pf2e (remaster)");
		const file = (await d.storage.read(campaign.keys.overview))!;
		assert.match(file, /remaster/);
		assert.doesNotMatch(file, /Fifth-edition/, "the old rules line survived somewhere in campaign.md");
		assert.equal((file.match(/d20 fantasy/g) ?? []).length, 1, `more than one rules line:\n${file}`);
		assert.equal(campaign.systemLine, "pf2e (remaster)");
	});

	it("validates the new printing the same way creation does", async () => {
		const { campaign } = await fresh();
		await assert.rejects(() => campaign.setSystem("5e (2025)"), /Unknown printing/);
		assert.equal(campaign.systemLine, "5e (2024)", "a rejected change must not be written");
	});

	it("keeps a pending roll's kind, so answering it files the right prefix", async () => {
		const { campaign } = await fresh();
		await campaign.setPendingRoll({ expression: "1d20", reason: "Stealth", kind: "skill" });
		assert.equal(campaign.pendingRoll?.kind, "skill");
	});
});

describe("the scene", () => {
	it("is projected into marked prose from the frontmatter", async () => {
		const { d, campaign } = await fresh();
		await campaign.setScene({ summary: "On the causeway.", location: "Wrenfield", time: "midnight" });
		const text = (await d.storage.read(campaign.keys.overview))!;
		const { body } = parseDocument(text);
		assert.match(body, /## Current scene/);
		assert.match(body, /<!-- portents:generated scene -->/);
		assert.match(body, /On the causeway\./);
		assert.match(body, /\*\*Where\.\*\* Wrenfield/);
		assert.match(body, /\*\*When\.\*\* midnight/);
	});

	it("overwrites rather than accumulating", async () => {
		const { campaign } = await fresh();
		for (let i = 0; i < 5; i++) await campaign.setScene({ summary: `Scene ${i}.` });
		const text = await campaign.overviewSection("Current scene");
		assert.equal((text!.match(/Scene \d/g) ?? []).length, 1, text!);
		assert.match(text!, /Scene 4\./);
	});

	it("keeps the user's prose sections untouched", async () => {
		const { campaign } = await fresh();
		await campaign.setScene({ summary: "Anywhere." });
		assert.match((await campaign.overviewSection("Premise"))!, /drowned village/);
		assert.match((await campaign.overviewSection("Table agreements"))!, /No harm to children/);
	});

	it("needs a summary", async () => {
		const { campaign } = await fresh();
		await assert.rejects(() => campaign.setScene({ summary: "  " }), /needs a summary/);
	});
});

describe("clocks", () => {
	let campaign: Campaign;
	beforeEach(async () => {
		campaign = (await fresh()).campaign;
	});

	it("stores a whole clock as one readable line", async () => {
		await campaign.setClock("The tide returns", 2, 6, "then the causeway floods");
		const text = (await campaign.overviewSection("Clocks"))!;
		assert.match(text, /▰▰▱▱▱▱ 2\/6 — then the causeway floods/);
	});

	it("advances by steps", async () => {
		await campaign.setClock("Tide", 0, 4);
		assert.equal((await campaign.tickClock("Tide")).filled, 1);
		assert.equal((await campaign.tickClock("Tide", 2)).filled, 3);
	});

	it("clamps rather than overflowing", async () => {
		await campaign.setClock("Tide", 0, 4);
		assert.equal((await campaign.tickClock("Tide", 99)).filled, 4);
		assert.equal((await campaign.setClock("Tide", -5)).filled, 0);
	});

	it("keeps the segment count when advancing", async () => {
		await campaign.setClock("Tide", 1, 6);
		assert.equal((await campaign.tickClock("Tide")).segments, 6);
	});

	it("matches an existing clock case-insensitively", async () => {
		await campaign.setClock("Tide", 1, 6);
		await campaign.setClock("tide", 3);
		assert.equal(campaign.clocks.length, 1);
		assert.equal(campaign.clocks[0].name, "Tide", "the original capitalisation should win");
	});

	it("refuses a new clock with no segment count", async () => {
		await assert.rejects(() => campaign.setClock("Nameless", 1), /needs a segment count/);
	});

	it("refuses nonsense segments", async () => {
		await assert.rejects(() => campaign.setClock("X", 0, 0), /positive integer/);
		await assert.rejects(() => campaign.setClock("X", 0, 1.5), /positive integer/);
	});

	it("refuses to advance a clock that does not exist", async () => {
		await assert.rejects(() => campaign.tickClock("Ghost"), /No clock named/);
	});

	it("removes one, reporting whether it was there", async () => {
		await campaign.setClock("Tide", 1, 6);
		assert.equal(await campaign.removeClock("tide"), true);
		assert.deepEqual(campaign.clocks, []);
		assert.equal(await campaign.removeClock("tide"), false);
	});

	it("survives a hand-edited clock line", async () => {
		// The format exists so a person can advance a clock in a text editor.
		const { d } = await fresh();
		const keys = campaignKeys("the-bell-of-wrenfield");
		await d.storage.write(keys.overview, "---\nname: X\nslug: the-bell-of-wrenfield\nsystem: generic\nclocks:\n  Tide: 5/6 nearly\n---\n\n# X\n");
		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.deepEqual(reopened.clocks, [{ name: "Tide", filled: 5, segments: 6, note: "nearly" }]);
	});

	it("complains about a clock line it cannot read", async () => {
		const { d } = await fresh();
		const keys = campaignKeys("the-bell-of-wrenfield");
		await d.storage.write(keys.overview, "---\nname: X\nslug: the-bell-of-wrenfield\nsystem: generic\nclocks:\n  Tide: soon\n---\n\n# X\n");
		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.throws(() => reopened.clocks, /should look like "3\/6"/);
	});
});

describe("predefined setting selection", () => {
	it("records a setting independently from the rules system", async () => {
		const { campaign, d } = await freshWithSetting();
		assert.equal(campaign.settingId, SETTING_ID);
		assert.equal(campaign.systemLine, "5e (2024)");
		const overview = (await d.storage.read(campaign.keys.overview))!;
		assert.match(overview, /^setting: portents\/greywater$/m);
		assert.match(overview, /\*\*Greywater\.\*\* A rain-soaked river province\./);
		assert.match(await campaign.brief(), /\*\*Setting\.\*\* Greywater/);
	});

	it("can change or clear the setting without touching the system", async () => {
		const { campaign } = await freshWithSetting();
		await campaign.setSetting(undefined);
		assert.equal(campaign.settingId, undefined);
		assert.equal(campaign.systemLine, "5e (2024)");
		assert.match((await campaign.overviewSection("Setting")) ?? "", /No predefined setting/);
		await campaign.setSetting(SETTING_ID);
		assert.equal(campaign.settingId, SETTING_ID);
	});

	it("refuses a setting with no loaded registry or no matching manifest", async () => {
		await assert.rejects(() => Campaign.create(deps(), { ...INPUT, settingId: SETTING_ID }), /needs a loaded content registry/);
		await assert.rejects(
			() => Campaign.create({ ...deps(), registry: createRegistry([]) }, { ...INPUT, settingId: SETTING_ID }),
			/Unknown setting/,
		);
	});

	it("reports a setting that disappeared after the campaign was written", async () => {
		const { d, campaign } = await freshWithSetting();
		const reopened = await Campaign.open({ ...d, registry: createRegistry([]) }, campaign.slug);
		assert.ok((await reopened.problems()).some((problem) => problem.includes("is not loaded")));
	});
});

describe("topic resources", () => {
	it("writes one Markdown file under a known kind folder and reads it exactly", async () => {
		const { campaign, d } = await freshWithSetting();
		const written = await campaign.writeResource("npc/nesta.md", campaignResource({ metadata: { mood: "wary" } }));
		assert.equal(written.origin, "campaign");
		assert.equal(written.resource.metadata?.mood, "wary");
		assert.ok(await d.storage.exists("campaigns/the-bell-of-wrenfield/world/npc/nesta.md"));
		assert.equal((await campaign.readResource("npc/nesta.md"))?.resource.body, campaignResource().body + "\n");
	});

	it("lists by kind in stable storage order", async () => {
		const { campaign } = await freshWithSetting();
		await campaign.writeResource("npc/zara.md", campaignResource({ id: "campaign/the-bell-of-wrenfield/npc/zara", name: "Zara" }));
		await campaign.writeResource("npc/alric.md", campaignResource({ id: "campaign/the-bell-of-wrenfield/npc/alric", name: "Alric" }));
		await campaign.writeResource("place/causeway.md", campaignResource({ id: "campaign/the-bell-of-wrenfield/place/causeway", kind: "place", name: "Causeway" }));
		const npcs = await campaign.listResources("npc");
		assert.deepEqual(npcs.map((record) => record.path), ["npc/alric.md", "npc/zara.md"]);
	});

	it("rejects traversal, extra nesting, unsafe names, and non-Markdown paths", async () => {
		const { campaign } = await freshWithSetting();
		for (const path of ["../nesta.md", "npc/deep/nesta.md", "NPC/nesta.md", "npc/nesta.json", "/npc/nesta.md"]) {
			await assert.rejects(() => campaign.writeResource(path, campaignResource()), /Resource path|Resource kind/, path);
		}
	});

	it("requires campaign identity and a path matching the resource kind", async () => {
		const { campaign } = await freshWithSetting();
		await assert.rejects(() => campaign.writeResource("place/nesta.md", campaignResource()), /does not match path folder/);
		await assert.rejects(
			() => campaign.writeResource("npc/nesta.md", campaignResource({ id: "other/campaign/npc/nesta" })),
			/campaign resource id must start/,
		);
		await assert.rejects(
			() => campaign.writeResource("npc/nesta.md", campaignResource({ settingId: SETTING_ID, id: SHRINE_ID })),
			/must not claim to be immutable/,
		);
	});

	it("updates a derived path without dropping its stable id or omitted metadata", async () => {
		const { campaign } = await freshWithSetting();
		const first = await campaign.rememberResource({ kind: "npc", name: "Nesta", aliases: ["keeper"], body: "First." });
		const second = await campaign.rememberResource({ kind: "npc", name: "Nesta", body: "Second." });
		assert.equal(second.resource.id, first.resource.id);
		assert.deepEqual(second.resource.aliases, ["keeper"]);
		assert.equal(second.resource.body, "Second.\n");
	});

	it("queries selected setting canon and campaign developments together", async () => {
		const { campaign } = await freshWithSetting();
		await campaign.writeResource("npc/nesta.md", campaignResource({
			supersedes: SHRINE_ID,
			body: "Nesta confirms the shrine predates the present river cult.",
		}));
		const found = await campaign.queryResources({ text: "predates", audience: "gm" });
		assert.deepEqual(found.map((record) => record.origin), ["campaign", "pack"]);
		assert.deepEqual(found.map((record) => record.resource.name), ["Nesta", "Old Riverside Shrine"]);
	});

	it("reads a packaged resource by stable id without making it writable", async () => {
		const { campaign } = await freshWithSetting();
		const found = await campaign.resourceById(SHRINE_ID);
		assert.equal(found?.origin, "pack");
		assert.equal(found?.immutable, true);
		assert.match((await campaign.recallById(SHRINE_ID)) ?? "", /Origin:\*\* pack greywater-pack/);
	});

	it("recalls selected setting map metadata and pins by id", async () => {
		const mapRegistry = createRegistry([{
			id: "greywater-map-pack",
			settings: [settingRegistry.requireSetting(SETTING_ID)],
			resources: settingRegistry.resourcesForSetting(SETTING_ID),
			imageMaps: [{
				schemaVersion: 1,
				id: "portents/greywater/map/region",
				settingId: SETTING_ID,
				name: "Greywater Province",
				scope: "region",
				asset: { key: "maps/region.webp", mimeType: "image/webp", width: 1200, height: 510, alt: "A river province." },
				pins: [{ id: "shrine", x: 0.4, y: 0.7, label: "Shrine", resourceId: SHRINE_ID }],
			}],
		}]);
		const d = { ...deps(), registry: mapRegistry };
		const campaign = await Campaign.create(d, { ...INPUT, settingId: SETTING_ID });
		assert.equal(campaign.settingImageMaps()[0].packId, "greywater-map-pack");
		assert.match(await campaign.brief(), /Setting maps.*portents\/greywater\/map\/region/);
		const recalled = (await campaign.recallById("portents/greywater/map/region"))!;
		assert.match(recalled, /maps\/region\.webp/);
		assert.match(recalled, /Shrine.*portents\/greywater\/place\/riverside-shrine/);
	});

	it("does not include packs from a setting the campaign did not choose", async () => {
		const d = { ...deps(), registry: settingRegistry };
		const campaign = await Campaign.create(d, INPUT);
		assert.deepEqual(await campaign.queryResources({ text: "shrine" }), []);
	});

	it("surfaces malformed resource files instead of silently forgetting them", async () => {
		const { campaign, d } = await freshWithSetting();
		await d.storage.write(campaign.keys.resource("npc/broken.md"), "not frontmatter");
		await assert.rejects(() => campaign.listResources(), /Invalid resource/);
	});

	it("leaves legacy world.md readable beside topic resources", async () => {
		const { campaign } = await freshWithSetting();
		await campaign.addToWorld("NPCs", "**Legacy Nesta.** Still here.");
		await campaign.writeResource("npc/nesta.md", campaignResource());
		assert.match(await campaign.worldSection("NPCs"), /Legacy Nesta/);
		assert.equal((await campaign.listResources()).length, 1);
	});
});

describe("the journal", () => {
	it("appends and never rewrites", async () => {
		const { campaign } = await fresh();
		await campaign.journal("The causeway", "They crossed at low tide.");
		const afterFirst = await campaign.readJournal();
		await campaign.journal("The bell", "It rang once.");
		const afterSecond = await campaign.readJournal();
		assert.ok(afterSecond.startsWith(afterFirst), "an earlier entry changed");
	});

	it("timestamps each entry", async () => {
		const { campaign } = await fresh();
		await campaign.journal("One", "x");
		assert.match(await campaign.readJournal(), /_2026-03-01 \d\d:\d\d_/);
	});

	it("returns recent scenes newest last", async () => {
		const { campaign } = await fresh();
		for (const heading of ["One", "Two", "Three"]) await campaign.journal(heading, `body ${heading}`);
		const recent = await campaign.recentJournal(2);
		assert.match(recent, /## Two/);
		assert.match(recent, /## Three/);
		assert.doesNotMatch(recent, /## One/);
	});

	it("needs a heading", async () => {
		const { campaign } = await fresh();
		await assert.rejects(() => campaign.journal(" ", "x"), /needs a heading/);
	});
});

describe("the world", () => {
	it("appends to a section without disturbing the others", async () => {
		const { campaign } = await fresh();
		await campaign.addToWorld("NPCs", "**Nesta.** Keeps the shrine.");
		await campaign.addToWorld("Places", "**The causeway.** Passable at low tide.");
		await campaign.addToWorld("NPCs", "**The tollkeeper.** Knows what he did.");
		assert.match(await campaign.worldSection("NPCs"), /Nesta[\s\S]*tollkeeper/);
		assert.match(await campaign.worldSection("Places"), /causeway/);
		assert.doesNotMatch(await campaign.worldSection("Places"), /Nesta/);
	});

	it("replaces the _TBD_ stub on first write", async () => {
		const { campaign } = await fresh();
		await campaign.addToWorld("Threads", "The bell is a warning, not a summons.");
		assert.doesNotMatch(await campaign.worldSection("Threads"), /TBD/);
	});

	it("marks the campaign updated when its world changes", async () => {
		const { campaign, d } = await fresh();
		const before = parseDocument((await d.storage.read(campaign.keys.overview))!).data.updatedAt;
		await campaign.addToWorld("NPCs", "**Nesta.** Keeps the shrine.");
		const after = parseDocument((await d.storage.read(campaign.keys.overview))!).data.updatedAt;
		assert.notEqual(after, before);
	});

	it("refuses an unknown section", async () => {
		const { campaign } = await fresh();
		await assert.rejects(
			() => campaign.addToWorld("Weather" as "NPCs", "x"),
			/Unknown world section/,
		);
	});
});

describe("characters", () => {
	it("creates, lists and reads a sheet", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({
			name: "Brannoc Thistlewood",
			status: { HP: "26/26", "Temp HP": 0 },
			sections: ["Equipment"],
		});
		assert.deepEqual(await campaign.listCharacters(), ["brannoc-thistlewood"]);
		const sheet = await campaign.readCharacter("Brannoc Thistlewood");
		assert.equal(statusValue(sheet!, "HP"), "26/26");
		assert.ok(getSection(sheet!, "Equipment"));
	});

	it("makes the first character active", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Brannoc", status: { HP: "26/26" } });
		assert.equal(campaign.activeCharacter, "Brannoc");
	});

	it("can create one without making it active", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Brannoc" });
		await campaign.createCharacter({ name: "Sidekick" }, { active: false });
		assert.equal(campaign.activeCharacter, "Brannoc");
	});

	it("patches status and writes it straight back", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Brannoc", status: { HP: "26/26" } });
		await campaign.patchCharacter("Brannoc", { HP: "-7" });
		const reread = await campaign.readCharacter("Brannoc");
		assert.equal(statusValue(reread!, "HP"), "19/26");
	});

	it("refuses a duplicate character", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Brannoc" });
		await assert.rejects(() => campaign.createCharacter({ name: "Brannoc" }), /already exists/);
	});

	it("says so when patching someone who is not there", async () => {
		const { campaign } = await fresh();
		await assert.rejects(() => campaign.patchCharacter("Ghost", { HP: "-1" }), /No character "Ghost"/);
	});

	it("keeps sheets in their own campaign", async () => {
		const d = deps();
		const one = await Campaign.create(d, { name: "One", system: "5e" });
		const two = await Campaign.create(d, { name: "Two", system: "5e" });
		await one.createCharacter({ name: "Brannoc" });
		assert.deepEqual(await two.listCharacters(), []);
	});
});

describe("deck piles", () => {
	const deck: Deck = {
		id: "test-deck",
		name: "Test",
		description: "x",
		cards: Array.from({ length: 6 }, (_, i) => ({ name: `Card ${i}`, text: "x" })),
	};

	it("keeps a drawn card gone across sessions", async () => {
		const { d, campaign } = await fresh();
		const first = await campaign.draw(deck, 2);
		assert.equal(first.cards.length, 2);
		assert.equal(first.remaining, 4);

		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		const second = await reopened.draw(deck, 1);
		assert.equal(second.remaining, 3, "the pile did not persist");
		const drawnIds = [...first.cards, ...second.cards].map((card) => card.name);
		assert.equal(new Set(drawnIds).size, 3, "a card came back before a reshuffle");
	});

	it("counts draws", async () => {
		const { campaign } = await fresh();
		await campaign.draw(deck, 2);
		assert.equal(campaign.counters.draws, 2);
	});

	it("rebuilds a pile whose deck was edited rather than stranding the game", async () => {
		const { campaign } = await fresh();
		await campaign.draw(deck, 2);
		const bigger: Deck = { ...deck, cards: [...deck.cards, { name: "Card 6", text: "x" }] };
		const result = await campaign.draw(bigger, 1);
		assert.equal(result.total, 7);
	});

	it("recovers from a corrupt pile file with a reshuffle, not a crash", async () => {
		const { d, campaign } = await fresh();
		await campaign.draw(deck, 2);
		await d.storage.write(campaign.keys.piles, "{ not json");
		const result = await campaign.draw(deck, 1);
		assert.equal(result.remaining, 5, "should have reshuffled a full pile");
	});

	it("reshuffles on request", async () => {
		const { campaign } = await fresh();
		await campaign.draw(deck, 4);
		await campaign.reshuffle(deck);
		assert.equal((await campaign.draw(deck, 1)).remaining, 5);
	});

	it("says what is missing when there is no randomness", async () => {
		const campaign = await Campaign.create(
			{ storage: new MemoryStorage(), clock: tickingClock("2026-03-01T18:00:00.000Z") },
			{ name: "No RNG", system: "generic" },
		);
		await assert.rejects(() => campaign.draw(deck), /needs a RandomSource/);
	});
});

describe("the resume brief", () => {
	it("carries everything needed to pick the game back up", async () => {
		const { campaign } = await fresh();
		await campaign.setScene({ summary: "On the causeway at low tide.", location: "Wrenfield", tension: "tense" });
		await campaign.setClock("The tide returns", 4, 6);
		await campaign.createCharacter({ name: "Brannoc", status: { HP: "19/26", AC: 15 } });
		await campaign.journal("The causeway", "They crossed at low tide.");
		await campaign.ledger.append({ kind: "hit", actor: "goblin", reason: "shortbow", result: "16" });

		const brief = await campaign.brief();
		assert.match(brief, /# The Bell of Wrenfield/);
		// The printing echoes what the user wrote rather than being prettified,
		// which is the point of a freeform field.
		assert.match(brief, /Fifth-edition d20 fantasy, 2024 — the current core rules/);
		assert.match(brief, /On the causeway at low tide\./);
		assert.match(brief, /\*\*Brannoc\*\* — HP 19\/26/);
		assert.match(brief, /The tide returns.*4\/6/);
		assert.match(brief, /## Recently/);
		assert.match(brief, /They crossed at low tide\./);
		assert.match(brief, /`h-1`/);
	});

	it("tells the GM to ask rather than invent when there is no scene", async () => {
		const { campaign } = await fresh();
		assert.match(await campaign.brief(), /Ask the player where they left off rather than inventing one/);
	});

	it("surfaces an outstanding player roll", async () => {
		const { campaign } = await fresh();
		await campaign.setPendingRoll({ expression: "1d20+7", reason: "Stealth", dc: 15 });
		assert.match(await campaign.brief(), /still owes a roll: 1d20\+7 for Stealth \(DC 15\)/);
	});

	it("drops the pending roll once it is cleared", async () => {
		const { campaign } = await fresh();
		await campaign.setPendingRoll({ expression: "1d20", reason: "x" });
		await campaign.setPendingRoll(undefined);
		assert.equal(campaign.pendingRoll, undefined);
		assert.doesNotMatch(await campaign.brief(), /still owes a roll/);
	});

	it("reports problems in the brief, where they will be seen", async () => {
		const { campaign } = await fresh();
		await campaign.setClock("Doom", 6, 6);
		assert.match(await campaign.brief(), /clock "Doom" is full/);
	});

	it("works on a campaign with nothing in it yet", async () => {
		const campaign = await Campaign.create(deps(), { name: "Blank", system: "generic" });
		const brief = await campaign.brief();
		assert.match(brief, /# Blank/);
		assert.ok(brief.endsWith("\n"));
	});
});

describe("problems", () => {
	it("is quiet about a healthy campaign", async () => {
		const { campaign } = await fresh();
		await campaign.setScene({ summary: "x" });
		assert.deepEqual(await campaign.problems(), []);
	});

	it("notices a missing edition on a system that has printings", async () => {
		const { d } = await fresh();
		const keys = campaignKeys("the-bell-of-wrenfield");
		await d.storage.write(keys.overview, "---\nname: X\nslug: the-bell-of-wrenfield\nsystem: 5e\n---\n\n# X\n");
		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		const problems = await reopened.problems();
		assert.match(problems[0], /more than one printing but none is recorded/);
		assert.match(problems[0], /write it as "5e \(2024\)"/);
	});

	it("notices an active character with no sheet", async () => {
		const { campaign } = await fresh();
		await campaign.setActiveCharacter("Nobody");
		assert.ok((await campaign.problems()).some((p) => /"Nobody" has no sheet on disk/.test(p)));
	});

	it("inherits ledger problems", async () => {
		const { d, campaign } = await fresh();
		await d.storage.append(campaign.keys.rolls, "{ not json\n");
		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.ok((await reopened.problems()).some((p) => /not a valid entry/.test(p)));
	});
});

describe("durability", () => {
	it("writes through on every change rather than at session end", async () => {
		// A session ends when a laptop shuts, not when someone says goodbye.
		const { d, campaign } = await fresh();
		await campaign.setScene({ summary: "Written immediately." });
		const onDisk = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.equal(onDisk.scene?.summary, "Written immediately.");
	});

	it("keeps the overview parseable over many writes", async () => {
		const { d, campaign } = await fresh();
		for (let i = 0; i < 30; i++) {
			await campaign.setScene({ summary: `Scene ${i}.` });
			await campaign.setClock("Tide", i % 6, 6);
		}
		const text = (await d.storage.read(campaign.keys.overview))!;
		assert.doesNotMatch(text, /\n\n\n/, "blank lines accumulated");
		const reopened = await Campaign.open(d, "the-bell-of-wrenfield");
		assert.equal(reopened.scene?.summary, "Scene 29.");
		assert.equal(reopened.clocks.length, 1);
		assert.match(text, /drowned village/, "the user's premise was lost");
	});

	it("advances updatedAt", async () => {
		const { campaign, d } = await fresh();
		const before = parseDocument((await d.storage.read(campaign.keys.overview))!).data.updatedAt;
		await campaign.setScene({ summary: "Later." });
		const after = parseDocument((await d.storage.read(campaign.keys.overview))!).data.updatedAt;
		assert.notEqual(before, after);
	});

	it("round-trips a sheet written through the campaign", async () => {
		const { d, campaign } = await fresh();
		await campaign.createCharacter({ name: "Brannoc", status: { HP: "26/26", "Hit Dice": "3d10" } });
		const raw = (await d.storage.read(campaign.keys.character("Brannoc")))!;
		const sheet = parseSheet(raw);
		assert.equal(statusValue(sheet, "Hit Dice"), "3d10");
	});
});

describe("more than one character", () => {
	/**
	 * A sidekick must not displace the main character.
	 *
	 * The guidance now recommends one main character plus one or two sidekicks, and this
	 * is what made that recommendation dangerous: `createCharacter` activated every new
	 * character unless explicitly told not to, so creating a sidekick silently moved the
	 * active slot -- the sheet patched by default, and the one every briefing reports.
	 */
	it("keeps the first character active when later ones are added", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Ossiran Vale" });
		await campaign.createCharacter({ name: "Bram Holt" });
		await campaign.createCharacter({ name: "Wick" });

		assert.equal(campaign.activeCharacter, "Ossiran Vale");
		assert.deepEqual((await campaign.listCharacters()).sort(), ["bram-holt", "ossiran-vale", "wick"]);
	});

	it("still honours an explicit active flag", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "First" });
		await campaign.createCharacter({ name: "Second" }, { active: true });
		assert.equal(campaign.activeCharacter, "Second", "an explicit request was ignored");
	});

	it("never activates when told not to, even as the first character", async () => {
		const { campaign } = await fresh();
		await campaign.createCharacter({ name: "Nobody" }, { active: false });
		assert.equal(campaign.activeCharacter, undefined);
	});

	it("survives a reload with the right character active", async () => {
		// The active character is campaign state, so it has to be on disk rather than in
		// memory: a browser reload mid-session must not promote a sidekick.
		const { d, campaign } = await fresh();
		await campaign.createCharacter({ name: "Ossiran Vale" });
		await campaign.createCharacter({ name: "Bram Holt" });

		const reopened = await Campaign.open(d, campaign.slug);
		assert.equal(reopened.activeCharacter, "Ossiran Vale");
	});
});
