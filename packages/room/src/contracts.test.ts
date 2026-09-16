import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertRoomState,
	participantResponded,
	responseWindowReady,
	roomStateProblems,
	type ResponseWindow,
	type RoomState,
} from "./contracts.ts";

const participants = [
	{ id: "alice", displayName: "Alice", roles: ["host", "player"] as const },
	{ id: "ben", displayName: "Ben", roles: ["player"] as const },
];

const window = (overrides: Partial<ResponseWindow> = {}): ResponseWindow => ({
	id: "round-4",
	request: { id: "intent-4", prompt: "What do you each do?" },
	mode: "all",
	requiredParticipantIds: ["alice", "ben"],
	responses: [],
	status: "collecting",
	...overrides,
});

const room = (overrides: Partial<RoomState> = {}): RoomState => ({
	schemaVersion: 1,
	id: "campaign/hollow-oath",
	revision: 0,
	participants,
	controllers: [
		{ characterId: "campaign/hollow-oath/character/ossiran", participantIds: ["alice"] },
		{ characterId: "campaign/hollow-oath/character/alric", participantIds: ["alice", "ben"] },
	],
	...overrides,
});

describe("response readiness", () => {
	it("all waits for every required participant to answer or pass", () => {
		const one = window({ responses: [{ participantId: "alice", kind: "response", body: "I bar the door." }] });
		assert.equal(responseWindowReady(one), false);
		assert.equal(
			responseWindowReady({ ...one, responses: [...one.responses, { participantId: "ben", kind: "pass" }] }),
			true,
		);
	});

	it("any becomes ready after the first answer or pass", () => {
		assert.equal(responseWindowReady(window({ mode: "any" })), false);
		assert.equal(responseWindowReady(window({ mode: "any", responses: [{ participantId: "ben", kind: "pass" }] })), true);
	});

	it("ordered ignores everyone except the active participant", () => {
		const ordered = window({ mode: "ordered", activeParticipantId: "ben" });
		assert.equal(
			responseWindowReady({ ...ordered, responses: [{ participantId: "alice", kind: "response", body: "Not my turn." }] }),
			false,
		);
		assert.equal(
			responseWindowReady({ ...ordered, responses: [{ participantId: "ben", kind: "response", body: "I strike." }] }),
			true,
		);
	});

	it("explicit host advance is ready; silence alone is not", () => {
		assert.equal(responseWindowReady(window()), false);
		assert.equal(responseWindowReady(window({ advancedBy: "alice" })), true);
	});

	it("reports whether one named participant answered", () => {
		const open = window({ responses: [{ participantId: "alice", kind: "pass" }] });
		assert.equal(participantResponded(open, "alice"), true);
		assert.equal(participantResponded(open, "ben"), false);
	});
});

describe("room contract", () => {
	it("accepts several controllers and shared control", () => {
		assert.equal(assertRoomState(room()).participants.length, 2);
	});

	it("accepts solo as the same one-participant room", () => {
		const solo = room({
			participants: [{ id: "alice", displayName: "Alice", roles: ["host", "player"] }],
			controllers: [{ characterId: "campaign/hollow-oath/character/ossiran", participantIds: ["alice"] }],
		});
		assert.deepEqual(roomStateProblems(solo), []);
	});

	it("requires identity, a host, valid controllers and a revision", () => {
		const problems = roomStateProblems(room({
			revision: -1,
			participants: [{ id: "Alice", displayName: "", roles: [] }],
			controllers: [{ characterId: "ossiran", participantIds: ["ghost"] }],
		}));
		assert.ok(problems.some((problem) => problem.includes("revision")));
		assert.ok(problems.some((problem) => problem.includes("invalid participant")));
		assert.ok(problems.some((problem) => problem.includes("display name")));
		assert.ok(problems.some((problem) => problem.includes("needs a role")));
		assert.ok(problems.some((problem) => problem.includes("needs a host")));
		assert.ok(problems.some((problem) => problem.includes("invalid character")));
		assert.ok(problems.some((problem) => problem.includes("unknown controller")));
	});

	it("rejects duplicate participants and controller records", () => {
		const problems = roomStateProblems(room({
			participants: [participants[0], participants[0]],
			controllers: [
				{ characterId: "campaign/hollow-oath/character/ossiran", participantIds: ["alice"] },
				{ characterId: "campaign/hollow-oath/character/ossiran", participantIds: ["alice"] },
			],
		}));
		assert.ok(problems.some((problem) => problem.includes("duplicate participant")));
		assert.ok(problems.some((problem) => problem.includes("duplicate controller")));
	});

	it("validates ordered and non-ordered active participants", () => {
		assert.ok(
			roomStateProblems(room({ responseWindow: window({ mode: "ordered" }) })).some((problem) => problem.includes("needs an active")),
		);
		assert.ok(
			roomStateProblems(room({ responseWindow: window({ mode: "all", activeParticipantId: "alice" }) })).some((problem) => problem.includes("must not have")),
		);
	});

	it("rejects unknown, duplicate, unrequested, and empty responses", () => {
		const bad = window({
			requiredParticipantIds: ["alice"],
			responses: [
				{ participantId: "ben", kind: "response", body: " " },
				{ participantId: "ben", kind: "pass" },
				{ participantId: "ghost", kind: "pass" },
			],
		});
		const problems = roomStateProblems(room({ responseWindow: bad }));
		assert.ok(problems.some((problem) => problem.includes("responded more than once")));
		assert.ok(problems.some((problem) => problem.includes("was not requested")));
		assert.ok(problems.some((problem) => problem.includes("unknown participant")));
		assert.ok(problems.some((problem) => problem.includes("is empty")));
	});

	it("requires window status to agree with readiness", () => {
		const responses = [
			{ participantId: "alice", kind: "response" as const, body: "A" },
			{ participantId: "ben", kind: "pass" as const },
		];
		assert.ok(roomStateProblems(room({ responseWindow: window({ responses }) })).some((problem) => problem.includes("still marked collecting")));
		assert.ok(
			roomStateProblems(room({ responseWindow: window({ status: "ready" }) })).some((problem) => problem.includes("is not ready")),
		);
	});

	it("allows only a host to advance", () => {
		assert.ok(
			roomStateProblems(room({ responseWindow: window({ advancedBy: "ben", status: "ready" }) })).some((problem) => problem.includes("non-host")),
		);
	});

	it("does not allow a model turn before the window resolves", () => {
		const problems = roomStateProblems(room({
			responseWindow: window(),
			modelTurn: { windowId: "round-4", claimId: "claim-1", status: "claimed" },
		}));
		assert.ok(problems.some((problem) => problem.includes("before the response window")));
	});
});
