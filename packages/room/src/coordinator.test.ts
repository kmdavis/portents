import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	createRoom,
	createSoloRoom,
	RoomCommandError,
	RoomCoordinator,
	type RoomCommandResult,
} from "./coordinator.ts";
import type { ResponseWindow, RoomState } from "./contracts.ts";

const alice = { id: "alice", displayName: "Alice", roles: ["host", "player"] as const };
const ben = { id: "ben", displayName: "Ben", roles: ["player"] as const };
const ossiran = "campaign/hollow-oath/character/ossiran";
const alric = "campaign/hollow-oath/character/alric";

function initial(): RoomState {
	return createRoom({
		id: "campaign/hollow-oath",
		participants: [alice, ben],
		controllers: [
			{ characterId: ossiran, participantIds: ["alice"] },
			{ characterId: alric, participantIds: ["ben"] },
		],
	});
}

function responseWindow(overrides: Partial<ResponseWindow> = {}): ResponseWindow {
	return {
		id: "round-1",
		request: { id: "intent-1", prompt: "What do you each do?" },
		mode: "all",
		requiredParticipantIds: ["alice", "ben"],
		responses: [],
		status: "collecting",
		...overrides,
	};
}

function open(coordinator: RoomCoordinator, window = responseWindow()): RoomCommandResult {
	return coordinator.dispatch({
		type: "open-window",
		commandId: "open-1",
		expectedRevision: coordinator.state.revision,
		actorParticipantId: "alice",
		window,
	});
}

function submit(
	coordinator: RoomCoordinator,
	participantId: "alice" | "ben",
	body: string | undefined,
	commandId = `submit-${participantId}`,
): RoomCommandResult {
	return coordinator.dispatch({
		type: "submit",
		commandId,
		expectedRevision: coordinator.state.revision,
		actorParticipantId: participantId,
		windowId: coordinator.state.responseWindow!.id,
		response: body === undefined
			? { participantId, kind: "pass" }
			: { participantId, kind: "response", body },
	});
}

function assertCode(run: () => unknown, code: string): void {
	assert.throws(run, (error) => error instanceof RoomCommandError && error.code === code);
}

describe("opening response windows", () => {
	it("lets the host open one and advances the room revision", () => {
		const coordinator = new RoomCoordinator(initial());
		const result = open(coordinator);
		assert.equal(result.state.revision, 1);
		assert.equal(result.state.responseWindow?.status, "collecting");
		assert.deepEqual(result.events, [{ type: "window-opened", windowId: "round-1" }]);
	});

	it("does not let a player open one", () => {
		const coordinator = new RoomCoordinator(initial());
		assertCode(
			() => coordinator.dispatch({
				type: "open-window",
				commandId: "open-ben",
				expectedRevision: 0,
				actorParticipantId: "ben",
				window: responseWindow(),
			}),
			"UNAUTHORIZED",
		);
	});

	it("does not replace a window still in progress", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		assertCode(
			() => coordinator.dispatch({
				type: "open-window",
				commandId: "open-2",
				expectedRevision: 1,
				actorParticipantId: "alice",
				window: responseWindow({ id: "round-2", request: { id: "intent-2", prompt: "Again?" } }),
			}),
			"WINDOW_CLOSED",
		);
	});
});

describe("collecting responses", () => {
	it("waits for every required player in all mode", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		const first = submit(coordinator, "alice", "Ossiran bars the door.");
		assert.equal(first.state.responseWindow?.status, "collecting");
		assert.ok(!first.events.some((event) => event.type === "window-ready"));

		const second = submit(coordinator, "ben", "Alric watches the road.");
		assert.equal(second.state.responseWindow?.status, "ready");
		assert.ok(second.events.some((event) => event.type === "window-ready"));
	});

	it("counts an explicit pass as a response", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		submit(coordinator, "alice", "I listen.");
		const result = submit(coordinator, "ben", undefined);
		assert.equal(result.state.responseWindow?.status, "ready");
		assert.equal(result.state.responseWindow?.responses[1].kind, "pass");
	});

	it("lets a player revise before resolution", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		submit(coordinator, "alice", "I open it.");
		const revised = submit(coordinator, "alice", "I listen first.", "revise-alice");
		assert.equal(revised.state.responseWindow?.responses.length, 1);
		assert.equal(revised.state.responseWindow?.responses[0].kind, "response");
		assert.equal((revised.state.responseWindow?.responses[0] as { body: string }).body, "I listen first.");
	});

	it("allows revision after ready until the model turn is claimed", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		submit(coordinator, "alice", "I open it.");
		submit(coordinator, "ben", "I watch.");
		const revised = submit(coordinator, "alice", "I listen first.", "revise-ready");
		assert.equal(revised.state.responseWindow?.status, "ready");
		const aliceResponse = revised.state.responseWindow?.responses.find((response) => response.participantId === "alice");
		assert.equal((aliceResponse as { body: string }).body, "I listen first.");
	});

	it("any mode becomes ready after one participant", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator, responseWindow({ mode: "any" }));
		assert.equal(submit(coordinator, "ben", "I answer.").state.responseWindow?.status, "ready");
	});

	it("ordered mode accepts only the active participant", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator, responseWindow({ mode: "ordered", activeParticipantId: "ben" }));
		assertCode(() => submit(coordinator, "alice", "I interrupt."), "UNAUTHORIZED");
		assert.equal(submit(coordinator, "ben", "Alric acts.").state.responseWindow?.status, "ready");
	});

	it("enforces character control on addressed requests", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator, responseWindow({
			request: { id: "ossiran-check", prompt: "What does Ossiran do?", characterIds: [ossiran] },
		}));
		assertCode(() => submit(coordinator, "ben", "I move Ossiran."), "UNAUTHORIZED");
	});

	it("rejects responses from another identity and unrequested participants", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator, responseWindow({ requiredParticipantIds: ["alice"] }));
		assertCode(() => submit(coordinator, "ben", "Not asked."), "UNAUTHORIZED");
		assertCode(
			() => coordinator.dispatch({
				type: "submit",
				commandId: "spoof",
				expectedRevision: coordinator.state.revision,
				actorParticipantId: "alice",
				windowId: "round-1",
				response: { participantId: "ben", kind: "pass" },
			}),
			"UNAUTHORIZED",
		);
	});
});

describe("host advance", () => {
	it("makes an incomplete window ready only by explicit host action", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		const result = coordinator.dispatch({
			type: "advance",
			commandId: "advance-1",
			expectedRevision: 1,
			actorParticipantId: "alice",
			windowId: "round-1",
		});
		assert.equal(result.state.responseWindow?.status, "ready");
		assert.equal(result.state.responseWindow?.advancedBy, "alice");
	});

	it("does not let a non-host advance", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		assertCode(
			() => coordinator.dispatch({
				type: "advance",
				commandId: "advance-ben",
				expectedRevision: 1,
				actorParticipantId: "ben",
				windowId: "round-1",
			}),
			"UNAUTHORIZED",
		);
	});
});

describe("model turn claim", () => {
	it("cannot be claimed before required responses arrive", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		assertCode(
			() => coordinator.dispatch({
				type: "claim-model-turn",
				commandId: "claim-early",
				expectedRevision: 1,
				actorParticipantId: "alice",
				windowId: "round-1",
				claimId: "model-1",
			}),
			"WINDOW_NOT_READY",
		);
	});

	it("releases a failed model turn so the same ready window can be retried", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		submit(coordinator, "alice", "A");
		submit(coordinator, "ben", "B");
		coordinator.dispatch({
			type: "claim-model-turn",
			commandId: "claim-failing",
			expectedRevision: 3,
			actorParticipantId: "alice",
			windowId: "round-1",
			claimId: "model-failing",
		});
		const released = coordinator.dispatch({
			type: "release-model-turn",
			commandId: "release-failing",
			expectedRevision: 4,
			actorParticipantId: "alice",
			windowId: "round-1",
			claimId: "model-failing",
		});
		assert.equal(released.state.responseWindow?.status, "ready");
		assert.equal(released.state.modelTurn, undefined);
		const retried = coordinator.dispatch({
			type: "claim-model-turn",
			commandId: "claim-retry",
			expectedRevision: 5,
			actorParticipantId: "alice",
			windowId: "round-1",
			claimId: "model-retry",
		});
		assert.equal(retried.state.modelTurn?.claimId, "model-retry");
	});

	it("allows exactly one claim and resolves only that claim", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		submit(coordinator, "alice", "A");
		submit(coordinator, "ben", "B");
		const claimed = coordinator.dispatch({
			type: "claim-model-turn",
			commandId: "claim-1",
			expectedRevision: 3,
			actorParticipantId: "alice",
			windowId: "round-1",
			claimId: "model-1",
		});
		assert.equal(claimed.state.responseWindow?.status, "resolving");
		assert.equal(claimed.state.modelTurn?.status, "claimed");
		assertCode(() => submit(coordinator, "alice", "Too late.", "late-response"), "WINDOW_CLOSED");

		assertCode(
			() => coordinator.dispatch({
				type: "claim-model-turn",
				commandId: "claim-2",
				expectedRevision: 4,
				actorParticipantId: "alice",
				windowId: "round-1",
				claimId: "model-2",
			}),
			"MODEL_TURN_CLAIMED",
		);
		assertCode(
			() => coordinator.dispatch({
				type: "resolve-model-turn",
				commandId: "resolve-wrong",
				expectedRevision: 4,
				actorParticipantId: "alice",
				windowId: "round-1",
				claimId: "wrong",
			}),
			"WRONG_CLAIM",
		);
		const resolved = coordinator.dispatch({
			type: "resolve-model-turn",
			commandId: "resolve-1",
			expectedRevision: 4,
			actorParticipantId: "alice",
			windowId: "round-1",
			claimId: "model-1",
		});
		assert.equal(resolved.state.responseWindow?.status, "resolved");
		assert.equal(resolved.state.modelTurn?.status, "resolved");
	});
});

describe("revision and retry safety", () => {
	it("rejects stale commands rather than overwriting newer state", () => {
		const coordinator = new RoomCoordinator(initial());
		open(coordinator);
		assertCode(
			() => coordinator.dispatch({
				type: "advance",
				commandId: "stale",
				expectedRevision: 0,
				actorParticipantId: "alice",
				windowId: "round-1",
			}),
			"STALE_REVISION",
		);
	});

	it("replays a duplicate command id without advancing twice", () => {
		const coordinator = new RoomCoordinator(initial());
		const command = {
			type: "open-window" as const,
			commandId: "open-once",
			expectedRevision: 0,
			actorParticipantId: "alice",
			window: responseWindow(),
		};
		const first = coordinator.dispatch(command);
		const replay = coordinator.dispatch(command);
		assert.equal(first.state.revision, 1);
		assert.equal(replay.state.revision, 1);
		assert.equal(coordinator.state.revision, 1);
		assert.equal(replay.replayed, true);
		assert.deepEqual(replay.events, first.events);
	});

	it("rejects reuse of a command id for different input", () => {
		const coordinator = new RoomCoordinator(initial());
		const command = {
			type: "open-window" as const,
			commandId: "same-id",
			expectedRevision: 0,
			actorParticipantId: "alice",
			window: responseWindow(),
		};
		coordinator.dispatch(command);
		assertCode(
			() => coordinator.dispatch({ ...command, window: responseWindow({ id: "different" }) }),
			"INVALID_COMMAND",
		);
	});

	it("does not expose mutable internal state or replay events", () => {
		const coordinator = new RoomCoordinator(initial());
		const snapshot = coordinator.state;
		(snapshot.participants as Array<typeof alice>).length = 0;
		assert.equal(coordinator.state.participants.length, 2);

		const command = {
			type: "open-window" as const,
			commandId: "clone-events",
			expectedRevision: 0,
			actorParticipantId: "alice",
			window: responseWindow(),
		};
		const first = coordinator.dispatch(command);
		(first.events[0] as { windowId: string }).windowId = "changed";
		const replay = coordinator.dispatch(command);
		assert.equal(replay.events[0].windowId, "round-1");
	});

	it("uses the same coordinator for a one-participant solo room", () => {
		const solo = createSoloRoom({
			id: "campaign/solo",
			participantId: "alice",
			displayName: "Alice",
			characterIds: ["campaign/solo/character/ossiran"],
		});
		const coordinator = new RoomCoordinator(solo);
		open(coordinator, responseWindow({
			requiredParticipantIds: ["alice"],
			request: { id: "solo-intent", prompt: "What do you do?", characterIds: ["campaign/solo/character/ossiran"] },
		}));
		assert.equal(submit(coordinator, "alice", "I open the door.").state.responseWindow?.status, "ready");
	});
});
