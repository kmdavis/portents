import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "@portents/web";

import { stateDigest } from "./agent.ts";

describe("browser session state", () => {
	it("carries the same volatile facts as the pi adapter", async () => {
		const session = new WebSession({ storage: new MemoryStorage() });
		const campaign = await session.createCampaign("Parity", "generic");
		await campaign.createCharacter({ name: "Nesta", status: { HP: "7/12", AC: 14 } });
		await campaign.setScene({ summary: "At the shrine.", location: "Greywater", time: "dusk", tension: "tense" });
		await campaign.setClock("Flood", 2, 6);
		await campaign.setPendingRoll({ expression: "1d20+3", reason: "Arcana", dc: 13 });

		const digest = (await stateDigest(session))!;
		assert.match(digest, /Nesta.*HP 7\/12.*AC 14/);
		assert.match(digest, /At the shrine.*Greywater.*dusk.*tense/);
		assert.match(digest, /Flood 2\/6/);
		assert.match(digest, /Waiting on the player.*1d20\+3.*Arcana.*DC 13/);
	});

	it("says nothing when no campaign is open", async () => {
		assert.equal(await stateDigest(new WebSession({ storage: new MemoryStorage() })), undefined);
	});
});
