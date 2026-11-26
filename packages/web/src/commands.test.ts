import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRoll, roll, seededRandomSource } from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "./session.ts";
import { executeCommand } from "./commands.ts";
import { PROTOCOL_VERSION } from "./protocol.ts";

const request = (command: Record<string, unknown>) => ({ version: PROTOCOL_VERSION, command });

describe("shared gameplay commands", () => {
	it("keeps ephemeral command rolls unrecorded even when a campaign is selected", async () => {
		const seed = "shared-command-parity";
		const session = new WebSession({ storage: new MemoryStorage(), seed });
		const campaign = await session.createCampaign("Parity", "generic");
		const expected = formatRoll(roll("2d20kh1+5", { rng: seededRandomSource(seed) }));

		const result = await executeCommand(session, request({ type: "dice.roll", expression: "2d20kh1+5" }));

		assert.equal(result.type, "roll");
		if (result.type !== "roll") return;
		assert.deepEqual(result.lines, [expected]);
		assert.deepEqual(result.totals, [roll("2d20kh1+5", { rng: seededRandomSource(seed) }).total]);
		assert.deepEqual(result.ledger, []);
		assert.equal(campaign.ledger.recent(10).length, 0);
	});

	it("records an explicitly campaign-scoped command and returns its canonical ledger reference", async () => {
		const session = new WebSession({ storage: new MemoryStorage(), seed: "recorded-command" });
		const campaign = await session.createCampaign("Recorded", "generic");
		const other = await session.createCampaign("Other", "generic");
		const result = await executeCommand(session, request({
			type: "dice.roll",
			expression: "1d20+5",
			campaignId: campaign.slug,
		}));

		assert.equal(result.type, "roll");
		if (result.type !== "roll") return;
		assert.equal(result.ledger.length, 1);
		assert.equal(result.ledger[0]?.id, session.campaign?.ledger.recent(1)[0]?.id);
		assert.equal(session.campaign?.ledger.recent(10).length, 1);
		assert.equal(session.campaign?.slug, campaign.slug);
		assert.equal(other.ledger.recent(10).length, 0);
	});
	it("returns ledger references for campaign deck, table, and oracle actions", async () => {
		const session = new WebSession({ storage: new MemoryStorage(), seed: "content-command" });
		const campaign = await session.createCampaign("Content", "generic");
		const deckId = session.deckIds()[0];
		const tableId = session.tableIds()[0];
		assert.ok(deckId);
		assert.ok(tableId);

		for (const command of [
			{ type: "deck.draw", deckId, campaignId: campaign.slug },
			{ type: "table.roll", tableId, campaignId: campaign.slug },
			{ type: "oracle.answer", kind: "yes_no", question: "Is it still raining?", campaignId: campaign.slug },
		]) {
			const result = await executeCommand(session, request(command));
			assert.equal(result.type, "text");
			if (result.type !== "text") continue;
			assert.equal(result.ledger?.length, 1);
			assert.ok(result.ledger?.[0]?.id);
		}

		assert.equal(campaign.ledger.recent(10).length, 3);
	});
	it("moves an actor through the shared map-view action and returns updated visibility", async () => {
		const session = new WebSession({ storage: new MemoryStorage(), seed: "map-move-command" });
		const tile = { id: "small-room", name: "Small room", art: ["#####", "#...#", "#...#", "#...#", "#####"] };
		const actor = { id: "hero", name: "Hero", kind: "pc" as const, x: 1, y: 1 };
		const result = await executeCommand(session, request({
			type: "map.moveActor",
			tile,
			actors: [actor],
			explored: [0],
			sightRadius: 1,
			actorId: "hero",
			x: 2,
			y: 1,
		}));

		assert.equal(result.type, "map-view");
		if (result.type !== "map-view") return;
		assert.deepEqual(result.actors, [{ ...actor, x: 2, y: 1 }]);
		assert.ok(result.explored.includes(0));
		assert.ok(result.visible.includes(7));
		await assert.rejects(
			() => executeCommand(session, request({
				type: "map.moveActor",
				tile,
				actors: [actor],
				actorId: "missing",
				x: 2,
				y: 1,
			})),
			(error: unknown) => error instanceof Error && "code" in error && error.code === "NOT_FOUND",
		);
	});
});
