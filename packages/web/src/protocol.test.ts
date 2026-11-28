import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHttpCommandClient } from "./http-client.ts";
import { createCommandClient, parseCommandResponse, ProtocolCommandError } from "./client.ts";
import {
	parseCommandRequest,
	ProtocolValidationError,
	PROTOCOL_VERSION,
	serializeCommandRequest,
} from "./protocol.ts";

describe("typed gameplay protocol", () => {
	it("accepts and serializes a supported standalone command", () => {
		const request = { version: PROTOCOL_VERSION, command: { type: "dice.roll", expression: "2d20kh1+5" } };
		assert.deepEqual(parseCommandRequest(request), request);
		assert.equal(serializeCommandRequest(request), JSON.stringify(request));
	});

	it("rejects unsupported versions with a stable error code", () => {
		assert.throws(
			() => parseCommandRequest({ version: PROTOCOL_VERSION + 1, command: { type: "campaign.list" } }),
			(error: unknown) => error instanceof ProtocolValidationError && error.code === "UNSUPPORTED_VERSION",
		);
	});

	it("requires campaign identity and rejects unknown operation fields", () => {
		assert.throws(
			() => parseCommandRequest({ version: PROTOCOL_VERSION, command: { type: "campaign.brief" } }),
			ProtocolValidationError,
		);
		assert.throws(
			() => parseCommandRequest({ version: PROTOCOL_VERSION, command: { type: "dice.roll", expression: "1d20", hidden: true } }),
			ProtocolValidationError,
		);
	});

	it("rejects non-JSON values and non-finite numeric arguments", () => {
		const cycle: { version: number; command: Record<string, unknown> } = {
			version: PROTOCOL_VERSION,
			command: { type: "campaign.create", name: "test", system: "generic" },
		};
		cycle.command.cycle = cycle;
		assert.throws(() => parseCommandRequest(cycle), ProtocolValidationError);
		assert.throws(
			() => parseCommandRequest({ version: PROTOCOL_VERSION, command: { type: "dice.odds", expression: "1d20", dc: Number.NaN } }),
			ProtocolValidationError,
		);
	});
	it("validates command metadata and returns committed revisions", async () => {
		const request = { type: "dice.roll" as const, expression: "1d20" };
		const client = createCommandClient(async (body) => {
			assert.deepEqual(JSON.parse(body), {
				version: PROTOCOL_VERSION,
				command: request,
				expectedRevision: 4,
				idempotencyKey: "request-1",
			});
			return { version: PROTOCOL_VERSION, result: { type: "roll", lines: ["1d20: [12] = **12**"], totals: [12], ledger: [] }, revision: 5 };
		});
		assert.deepEqual(await client.executeWithRevision(request, { expectedRevision: 4, idempotencyKey: "request-1" }), {
			result: { type: "roll", lines: ["1d20: [12] = **12**"], totals: [12], ledger: [] },
			revision: 5,
		});
		for (const metadata of [
			{ expectedRevision: -1 },
			{ expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
			{ idempotencyKey: "" },
			{ idempotencyKey: "x".repeat(257) },
		]) {
			assert.throws(() => parseCommandRequest({ version: PROTOCOL_VERSION, command: request, ...metadata }), ProtocolValidationError);
		}
		assert.throws(() => parseCommandResponse({ version: PROTOCOL_VERSION, result: { type: "empty" }, revision: -1 }), ProtocolValidationError);
	});

	it("posts authenticated commands to the normalized HTTP endpoint", async () => {
		const client = createHttpCommandClient({
			endpoint: "https://example.test/base/",
			credential: "secret",
			fetch: async (input, init) => {
				assert.equal(input, "https://example.test/base/api/commands");
				assert.equal(init?.method, "POST");
				assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret");
				assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
				assert.deepEqual(JSON.parse(String(init?.body)), {
					version: PROTOCOL_VERSION,
					command: { type: "campaign.list" },
				});
				return new Response(JSON.stringify({ version: PROTOCOL_VERSION, result: { type: "campaigns", campaigns: [] } }));
			},
		});
		assert.deepEqual(await client.execute({ type: "campaign.list" }), { type: "campaigns", campaigns: [] });
		assert.doesNotThrow(() => createHttpCommandClient({ endpoint: "http://127.0.0.1:7331", credential: "secret" }));
		assert.throws(
			() => createHttpCommandClient({ endpoint: "http://example.test", credential: "secret" }),
			/loopback/,
		);
	});
	it("validates typed client responses and preserves stable remote error codes", async () => {
		const request = { type: "dice.roll" as const, expression: "1d20" };
		const client = createCommandClient(async (body) => {
			assert.deepEqual(JSON.parse(body), { version: PROTOCOL_VERSION, command: request });
			return { version: PROTOCOL_VERSION, result: { type: "roll", lines: ["1d20: [12] = **12**"], totals: [12], ledger: [] } };
		});
		assert.deepEqual(await client.execute(request), {
			type: "roll",
			lines: ["1d20: [12] = **12**"],
			totals: [12],
			ledger: [],
		});
		assert.deepEqual((await client.execute(request)).totals, [12]);

		const failingClient = createCommandClient(async () => ({
			version: PROTOCOL_VERSION,
			error: { code: "STALE_REVISION", message: "stale" },
		}));
		await assert.rejects(
			() => failingClient.execute(request),
			(error: unknown) => error instanceof ProtocolCommandError && error.code === "STALE_REVISION",
		);
		const mismatchedClient = createCommandClient(async () => ({
			version: PROTOCOL_VERSION,
			result: { type: "empty" },
		}));
		await assert.rejects(
			() => mismatchedClient.execute(request),
			ProtocolValidationError,
		);
		assert.throws(
			() => parseCommandResponse({ version: PROTOCOL_VERSION, result: { type: "roll", lines: [], totals: [], ledger: [], fabricated: true } }),
			ProtocolValidationError,
		);
	});
	it("rejects inherited command names and malformed domain inputs", () => {
		for (const type of ["constructor", "toString", "__proto__"]) {
			assert.throws(
				() => parseCommandRequest({ version: PROTOCOL_VERSION, command: { type } }),
				(error: unknown) => error instanceof ProtocolValidationError && error.code === "INVALID_INPUT",
			);
		}

		const invalidInputs = [
			{ type: "remember", campaignId: "local", resource: {} },
			{ type: "remember", campaignId: "local", resource: { name: 123 } },
			{ type: "remember", campaignId: "local", resource: { kind: "note", name: "Valid", metadata: { nested: { invalid: null } } } },
			{ type: "oracle.answer", kind: "banana" },
			{ type: "oracle.answer", kind: "yes_no", likelihood: "sometimes" },
			{ type: "campaign.world", campaignId: "local", section: "Unknown" },
			{
				type: "map.moveActor",
				tile: { id: "room", name: "Room", art: ["###", "#.#", "###"] },
				actors: [{ id: "hero", name: "Hero", kind: "pc", x: 1, y: 1 }],
				actorId: "hero",
				x: 1.5,
				y: 1,
			},
		];
		for (const command of invalidInputs) {
			assert.throws(() => parseCommandRequest({ version: PROTOCOL_VERSION, command }), ProtocolValidationError);
		}
	});
	it("validates the serializable map-view movement command shape", () => {
		const command = {
			type: "map.moveActor",
			tile: { id: "small-room", name: "Small room", art: ["#####", "#...#", "#...#", "#...#", "#####"] },
			actors: [{ id: "hero", name: "Hero", kind: "pc", x: 1, y: 1 }],
			explored: [0],
			sightRadius: 2,
			actorId: "hero",
			x: 2,
			y: 1,
		};
		assert.deepEqual(parseCommandRequest({ version: PROTOCOL_VERSION, command }).command, command);
		const result = { type: "map-view", tile: command.tile, actors: command.actors, explored: [0], visible: [7], sightRadius: 2 };
		assert.deepEqual(parseCommandResponse({ version: PROTOCOL_VERSION, result }), { version: PROTOCOL_VERSION, result });
		assert.throws(() => parseCommandRequest({
			version: PROTOCOL_VERSION,
			command: { ...command, actors: [{ ...command.actors[0], kind: "unknown" }] },
		}), ProtocolValidationError);
	});
	});
