import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSection } from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "@portents/web";

import { campaignAction, recallAction, rememberAction, sheetAction } from "./actions.ts";

async function sessionWithCampaign(name = "Parity") {
	const storage = new MemoryStorage();
	const session = new WebSession({ storage });
	await campaignAction(session, {
		action: "create",
		name,
		system: "generic",
		premise: "A missing bell.",
		tone: "Gothic mystery.",
		safety: "Veil harm to children.",
	});
	return { session, storage };
}

describe("browser campaign action parity", () => {
	it("keeps the setup fields the shared guidance tells the GM to write", async () => {
		const { session } = await sessionWithCampaign();
		assert.match((await session.campaign!.overviewSection("Premise")) ?? "", /missing bell/);
		assert.match((await session.campaign!.overviewSection("Tone")) ?? "", /Gothic mystery/);
		assert.match((await session.campaign!.overviewSection("Table agreements")) ?? "", /Veil harm/);
	});

	it("accepts both open and load during the adapter transition", async () => {
		const { storage } = await sessionWithCampaign("Open Alias");
		for (const action of ["open", "load"]) {
			const session = new WebSession({ storage });
			const result = await campaignAction(session, { action, name: "open-alias" });
			assert.match(result, /# Open Alias/);
			assert.equal(session.campaign?.slug, "open-alias");
		}
	});

	it("writes and reads legacy world sections", async () => {
		const { session } = await sessionWithCampaign();
		await campaignAction(session, { action: "world", section: "NPCs", body: "**Nesta.** Keeps the shrine." });
		assert.match(await campaignAction(session, { action: "world", section: "NPCs" }), /Nesta/);
		assert.match(await campaignAction(session, { action: "world" }), /## NPCs[\s\S]*Nesta/);
	});

	it("records system, scene time, and scene tension", async () => {
		const { session } = await sessionWithCampaign();
		await campaignAction(session, { action: "system", system: "5e (2014)" });
		await campaignAction(session, {
			action: "scene",
			summary: "At the shrine.",
			location: "Greywater",
			time: "dusk",
			tension: "tense",
		});
		assert.equal(session.campaign?.systemLine, "5e (2014)");
		assert.deepEqual(session.campaign?.scene, {
			summary: "At the shrine.",
			location: "Greywater",
			time: "dusk",
			tension: "tense",
		});
	});
});

describe("browser setting resources", () => {
	it("lists loaded settings and records one at campaign creation", async () => {
		const session = new WebSession({ storage: new MemoryStorage() });
		assert.match(await campaignAction(session, { action: "list" }), /Greywater.*portents\/greywater/);
		await campaignAction(session, { action: "create", name: "Setting Test", system: "generic", setting: "portents/greywater" });
		assert.equal(session.campaign?.settingId, "portents/greywater");
	});

	it("remembers, queries, and exactly reads one campaign topic", async () => {
		const session = new WebSession({ storage: new MemoryStorage() });
		await campaignAction(session, { action: "create", name: "Memory Test", system: "generic", setting: "portents/greywater" });
		const remembered = await rememberAction(session, {
			kind: "npc",
			name: "Nesta",
			aliases: ["shrine keeper"],
			links: ["portents/greywater/place/riverside-shrine"],
			body: "Nesta guards a forged river token.",
		});
		assert.match(remembered, /npc\/nesta\.md/);
		const listed = await recallAction(session, { query: "river" });
		assert.match(listed, /Old Riverside Shrine/);
		assert.match(listed, /Nesta/);
		const read = await recallAction(session, { id: "campaign/memory-test/npc/nesta" });
		assert.match(read, /forged river token/);
		const map = await recallAction(session, { id: "portents/greywater/map/region" });
		assert.match(map, /greywater-region\.webp/);
		assert.match(map, /Old Riverside Shrine/);
	});

	it("updates an existing path without changing its stable id", async () => {
		const { session } = await sessionWithCampaign("Update Memory");
		await rememberAction(session, { kind: "npc", name: "Nesta", body: "First state." });
		await rememberAction(session, { path: "npc/nesta.md", body: "Second state." });
		const record = await session.campaign!.readResource("npc/nesta.md");
		assert.equal(record?.resource.id, "campaign/update-memory/npc/nesta");
		assert.match(record?.resource.body ?? "", /Second state/);
	});
});

describe("browser sheet action parity", () => {
	it("sets and appends ordinary sheet sections", async () => {
		const { session } = await sessionWithCampaign();
		await sheetAction(session, { action: "create", character: "Nesta" });
		await sheetAction(session, { action: "set_section", character: "Nesta", section: "Notes", body: "First." });
		await sheetAction(session, { action: "append_section", character: "Nesta", section: "Notes", body: "Second." });
		const sheet = (await session.campaign!.readCharacter("Nesta"))!;
		assert.equal(getSection(sheet, "Notes"), "First.\nSecond.");
	});

	it("can deliberately change the main character", async () => {
		const { session } = await sessionWithCampaign();
		await sheetAction(session, { action: "create", character: "Nesta" });
		await sheetAction(session, { action: "create", character: "Alric" });
		await sheetAction(session, { action: "set_main", character: "Alric" });
		assert.equal(session.campaign?.activeCharacter, "Alric");
	});
});
