import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSection } from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "@portents/web";

import { campaignAction, sheetAction } from "./actions.ts";

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
