import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EntityNotFoundError, formatRoll, InvalidKeyError, roll, seededRandomSource, StorageError, StorageUnavailableError } from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "./session.ts";
import { executeCommand } from "./commands.ts";
import { PROTOCOL_VERSION, ProtocolValidationError } from "./protocol.ts";

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
		const written = await session.loadCampaign(campaign.slug);
		assert.equal(result.ledger[0]?.id, written.ledger.recent(1)[0]?.id);
		assert.equal(written.ledger.recent(10).length, 1);
		assert.equal(session.campaign?.slug, other.slug);
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

		assert.equal((await session.loadCampaign(campaign.slug)).ledger.recent(10).length, 3);
	});
	it("isolates overlapping commands scoped to different campaigns", async () => {
		const session = new WebSession({ storage: new MemoryStorage(), seed: "overlapping-campaigns" });
		const first = await session.createCampaign("First", "generic");
		const second = await session.createCampaign("Second", "generic");

		const [firstResult, secondResult] = await Promise.all([
			executeCommand(session, request({ type: "dice.roll", expression: "1d20", campaignId: first.slug })),
			executeCommand(session, request({ type: "dice.roll", expression: "1d20", campaignId: second.slug })),
		]);

		assert.equal(firstResult.type, "roll");
		assert.equal(secondResult.type, "roll");
		if (firstResult.type !== "roll" || secondResult.type !== "roll") return;
		const firstLedger = (await session.loadCampaign(first.slug)).ledger.recent(10);
		const secondLedger = (await session.loadCampaign(second.slug)).ledger.recent(10);
		assert.equal(firstLedger.length, 1);
		assert.equal(secondLedger.length, 1);
		assert.equal(firstLedger[0]?.id, firstResult.ledger[0]?.id);
		assert.equal(secondLedger[0]?.id, secondResult.ledger[0]?.id);
		assert.equal(session.campaign?.slug, second.slug);
	});

	it("round-trips externally mapped campaign IDs through list, create and commands", async () => {
		const session = new WebSession({ storage: new MemoryStorage() });
		const campaignIdentity = {
			toSlug: (id: string) => id.startsWith("public:") ? id.slice("public:".length) : "",
			toId: (slug: string) => `public:${slug}`,
		};
		const created = await executeCommand(session, request({
			type: "campaign.create",
			name: "Mapped Campaign",
			system: "generic",
		}), { campaignIdentity });
		assert.equal(created.type, "campaigns");
		if (created.type !== "campaigns") return;
		const id = created.campaigns[0]?.id;
		assert.equal(id, "public:mapped-campaign");

		const listed = await executeCommand(session, request({ type: "campaign.list" }), { campaignIdentity });
		assert.equal(listed.type, "campaigns");
		if (listed.type !== "campaigns" || !id) return;
		assert.equal(listed.campaigns[0]?.id, id);
		const brief = await executeCommand(session, request({ type: "campaign.brief", campaignId: id }), { campaignIdentity });
		assert.equal(brief.type, "text");
	});

	it("reports unexpected executor failures as internal errors", async () => {
		const session = new WebSession({ storage: new MemoryStorage() });
		session.map = () => { throw new Error("private implementation details"); };
		await assert.rejects(
			() => executeCommand(session, request({ type: "map.generate" })),
			(error: unknown) => error instanceof ProtocolValidationError &&
				error.code === "INTERNAL_ERROR" && error.message === "Unexpected command failure",
		);
	});

	it("maps typed lookup and storage errors without inspecting their messages", async () => {
		const storage = new MemoryStorage();
		const session = new WebSession({ storage });
		await assert.rejects(
			() => executeCommand(session, request({ type: "campaign.open", campaignId: "absent" })),
			(error: unknown) => error instanceof ProtocolValidationError && error.code === "NOT_FOUND" &&
				JSON.stringify(error.details) === JSON.stringify({ entity: "campaign", identifier: "absent" }),
		);

		const changedMessage = new EntityNotFoundError("campaign", "absent");
		changedMessage.message = "unrelated revised human wording";
		const messageSession = new WebSession({ storage: new MemoryStorage() });
		messageSession.loadCampaign = async () => { throw changedMessage; };
		await assert.rejects(
			() => executeCommand(messageSession, request({ type: "campaign.open", campaignId: "absent" })),
			(error: unknown) => error instanceof ProtocolValidationError && error.code === "NOT_FOUND" &&
				JSON.stringify(error.details) === JSON.stringify({ entity: "campaign", identifier: "absent" }),
		);

		const campaign = await session.createCampaign("typed-errors", "generic");
		await assert.rejects(
			() => executeCommand(session, request({
				type: "sheet.patchStatus", campaignId: campaign.slug, character: "absent", status: {},
			})),
			(error: unknown) => error instanceof ProtocolValidationError && error.code === "NOT_FOUND" &&
				JSON.stringify(error.details) === JSON.stringify({ entity: "character", identifier: "absent" }),
		);
		await assert.rejects(
			() => executeCommand(session, request({
				type: "recall", campaignId: campaign.slug, id: "missing/resource",
			})),
			(error: unknown) => error instanceof ProtocolValidationError && error.code === "NOT_FOUND" &&
				JSON.stringify(error.details) === JSON.stringify({ entity: "resource", identifier: "missing/resource" }),
		);

		session.map = () => { throw new Error("database not found: private implementation details"); };
		await assert.rejects(
			() => executeCommand(session, request({ type: "map.generate" })),
			(error: unknown) => error instanceof ProtocolValidationError &&
				error.code === "INTERNAL_ERROR" && error.message === "Unexpected command failure",
		);

		storage.read = async () => {
			const error = new StorageUnavailableError("human wording A", new Error("secret"), { operation: "read", key: "secret/path" });
			error.message = "human wording B";
			throw error;
		};
		await assert.rejects(
			() => executeCommand(session, request({ type: "campaign.list" })),
			(error: unknown) => error instanceof ProtocolValidationError &&
				error.code === "STORAGE_FAILURE" && error.message === "Storage operation failed" &&
				JSON.stringify(error.details) === JSON.stringify({ operation: "read" }),
		);
		storage.read = async () => { throw new StorageError("private backend message", "secret/path"); };
		await assert.rejects(
			() => executeCommand(session, request({ type: "campaign.list" })),
			(error: unknown) => error instanceof ProtocolValidationError &&
				error.code === "STORAGE_FAILURE" && error.message === "Storage operation failed" &&
				error.details === undefined,
		);
		storage.read = async () => { throw new InvalidKeyError("secret/path", "private validation detail"); };
		await assert.rejects(
			() => executeCommand(session, request({ type: "campaign.list" })),
			(error: unknown) => error instanceof ProtocolValidationError &&
				error.code === "INVALID_INPUT" && error.message === "Storage key is invalid" &&
				error.details === undefined,
		);
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
