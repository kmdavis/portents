/**
 * Single-writer, in-process enforcement of the multiplayer room protocol.
 *
 * This is intentionally synchronous. It makes readiness, authorization, idempotency,
 * and the one-model-turn claim testable before a transport or durable backend exists.
 */

import {
	assertRoomState,
	responseWindowReady,
	ROOM_SCHEMA_VERSION,
	type CharacterController,
	type Participant,
	type ResponseWindow,
	type RoomCommand,
	type RoomEvent,
	type RoomState,
} from "./contracts.ts";

export type RoomErrorCode =
	| "INVALID_COMMAND"
	| "STALE_REVISION"
	| "UNKNOWN_PARTICIPANT"
	| "UNAUTHORIZED"
	| "NO_WINDOW"
	| "WRONG_WINDOW"
	| "WINDOW_CLOSED"
	| "WINDOW_NOT_READY"
	| "MODEL_TURN_CLAIMED"
	| "WRONG_CLAIM";

export class RoomCommandError extends Error {
	readonly code: RoomErrorCode;
	constructor(code: RoomErrorCode, message: string) {
		super(message);
		this.name = "RoomCommandError";
		this.code = code;
	}
}

export interface RoomCommandResult {
	readonly state: RoomState;
	readonly events: readonly RoomEvent[];
	readonly replayed: boolean;
}

export interface CreateRoomInput {
	readonly id: string;
	readonly participants: readonly Participant[];
	readonly controllers?: readonly CharacterController[];
}

export function createRoom(input: CreateRoomInput): RoomState {
	return assertRoomState({
		schemaVersion: ROOM_SCHEMA_VERSION,
		id: input.id,
		revision: 0,
		participants: input.participants,
		controllers: input.controllers ?? [],
	});
}

export function createSoloRoom(input: {
	readonly id: string;
	readonly participantId: string;
	readonly displayName: string;
	readonly characterIds?: readonly string[];
}): RoomState {
	return createRoom({
		id: input.id,
		participants: [{ id: input.participantId, displayName: input.displayName, roles: ["host", "player"] }],
		controllers: (input.characterIds ?? []).map((characterId) => ({ characterId, participantIds: [input.participantId] })),
	});
}

function compareString(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => compareString(a, b))
			.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function cloneWindow(window: ResponseWindow): ResponseWindow {
	return {
		...window,
		request: {
			...window.request,
			...(window.request.characterIds ? { characterIds: [...window.request.characterIds] } : {}),
		},
		requiredParticipantIds: [...window.requiredParticipantIds],
		responses: window.responses.map((response) => ({ ...response })),
	};
}

function cloneEvents(events: readonly RoomEvent[]): RoomEvent[] {
	return events.map((event) => ({ ...event }));
}

function cloneState(state: RoomState): RoomState {
	return {
		...state,
		participants: state.participants.map((participant) => ({ ...participant, roles: [...participant.roles] })),
		controllers: state.controllers.map((controller) => ({ ...controller, participantIds: [...controller.participantIds] })),
		...(state.responseWindow ? { responseWindow: cloneWindow(state.responseWindow) } : {}),
		...(state.modelTurn ? { modelTurn: { ...state.modelTurn } } : {}),
	};
}

function isHost(state: RoomState, participantId: string): boolean {
	return state.participants.some(
		(participant) => participant.id === participantId && participant.roles.includes("host"),
	);
}

function participantExists(state: RoomState, participantId: string): boolean {
	return state.participants.some((participant) => participant.id === participantId);
}

function controlsRequestedCharacter(state: RoomState, participantId: string, window: ResponseWindow): boolean {
	const requested = window.request.characterIds ?? [];
	if (requested.length === 0) return true;
	return state.controllers.some(
		(controller) => requested.includes(controller.characterId) && controller.participantIds.includes(participantId),
	);
}

function requireWindow(state: RoomState, windowId: string): ResponseWindow {
	const window = state.responseWindow;
	if (!window) throw new RoomCommandError("NO_WINDOW", "The room has no response window");
	if (window.id !== windowId) {
		throw new RoomCommandError("WRONG_WINDOW", `Response belongs to ${JSON.stringify(windowId)}, current window is ${JSON.stringify(window.id)}`);
	}
	return window;
}

function requireResponsesOpen(state: RoomState, windowId: string): ResponseWindow {
	const window = requireWindow(state, windowId);
	if (window.status === "resolving" || window.status === "resolved") {
		throw new RoomCommandError("WINDOW_CLOSED", `Response window ${JSON.stringify(window.id)} is ${window.status}`);
	}
	return window;
}

function requireCollecting(state: RoomState, windowId: string): ResponseWindow {
	const window = requireWindow(state, windowId);
	if (window.status !== "collecting") {
		throw new RoomCommandError("WINDOW_CLOSED", `Response window ${JSON.stringify(window.id)} is ${window.status}`);
	}
	return window;
}

function nextState(state: RoomState, patch: Partial<RoomState>): RoomState {
	return assertRoomState({ ...state, ...patch, revision: state.revision + 1 });
}

/**
 * One authority for room mutation. A hosted adapter must durably preserve the same
 * command-id and revision semantics; this class only guarantees them in one process.
 */
export class RoomCoordinator {
	#state: RoomState;
	readonly #processed = new Map<string, { signature: string; result: RoomCommandResult }>();

	constructor(initial: RoomState) {
		this.#state = cloneState(assertRoomState(initial));
	}

	get state(): RoomState {
		return cloneState(this.#state);
	}

	dispatch(command: RoomCommand): RoomCommandResult {
		if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(command.commandId)) {
			throw new RoomCommandError("INVALID_COMMAND", `Invalid command id ${JSON.stringify(command.commandId)}`);
		}
		const signature = canonical(command);
		const replay = this.#processed.get(command.commandId);
		if (replay) {
			if (replay.signature !== signature) {
				throw new RoomCommandError("INVALID_COMMAND", `Command id ${JSON.stringify(command.commandId)} was already used for different input`);
			}
			return {
				...replay.result,
				state: cloneState(replay.result.state),
				events: cloneEvents(replay.result.events),
				replayed: true,
			};
		}
		if (!participantExists(this.#state, command.actorParticipantId)) {
			throw new RoomCommandError("UNKNOWN_PARTICIPANT", `Unknown participant ${JSON.stringify(command.actorParticipantId)}`);
		}
		if (command.expectedRevision !== this.#state.revision) {
			throw new RoomCommandError(
				"STALE_REVISION",
				`Expected room revision ${command.expectedRevision}, current revision is ${this.#state.revision}`,
			);
		}

		const events: RoomEvent[] = [];
		let state: RoomState;
		switch (command.type) {
			case "open-window": {
				if (!isHost(this.#state, command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "Only a host may open a response window");
				}
				const current = this.#state.responseWindow;
				if (current && current.status !== "resolved") {
					throw new RoomCommandError("WINDOW_CLOSED", `Response window ${JSON.stringify(current.id)} is still ${current.status}`);
				}
				if (command.window.status !== "collecting" || command.window.responses.length > 0 || command.window.advancedBy) {
					throw new RoomCommandError("INVALID_COMMAND", "A new response window must be empty and collecting");
				}
				state = nextState(this.#state, { responseWindow: cloneWindow(command.window), modelTurn: undefined });
				events.push({ type: "window-opened", windowId: command.window.id });
				break;
			}
			case "submit": {
				const window = requireResponsesOpen(this.#state, command.windowId);
				if (command.response.participantId !== command.actorParticipantId) {
					throw new RoomCommandError("UNAUTHORIZED", "A participant may submit only their own response");
				}
				if (!window.requiredParticipantIds.includes(command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "This participant was not asked to respond");
				}
				if (window.mode === "ordered" && window.activeParticipantId !== command.actorParticipantId) {
					throw new RoomCommandError("UNAUTHORIZED", "It is not this participant's ordered turn");
				}
				if (!controlsRequestedCharacter(this.#state, command.actorParticipantId, window)) {
					throw new RoomCommandError("UNAUTHORIZED", "This participant controls none of the requested characters");
				}
				const responses = window.responses.filter(
					(response) => response.participantId !== command.actorParticipantId,
				);
				responses.push({ ...command.response });
				let nextWindow: ResponseWindow = { ...window, responses };
				const ready = responseWindowReady(nextWindow);
				const becameReady = window.status === "collecting" && ready;
				if (ready) nextWindow = { ...nextWindow, status: "ready" };
				state = nextState(this.#state, { responseWindow: nextWindow });
				events.push({
					type: "response-recorded",
					windowId: window.id,
					participantId: command.actorParticipantId,
					responseKind: command.response.kind,
				});
				if (becameReady) events.push({ type: "window-ready", windowId: window.id });
				break;
			}
			case "advance": {
				const window = requireCollecting(this.#state, command.windowId);
				if (!isHost(this.#state, command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "Only a host may advance a response window");
				}
				state = nextState(this.#state, {
					responseWindow: { ...window, advancedBy: command.actorParticipantId, status: "ready" },
				});
				events.push({ type: "window-advanced", windowId: window.id, participantId: command.actorParticipantId });
				events.push({ type: "window-ready", windowId: window.id });
				break;
			}
			case "claim-model-turn": {
				const window = requireWindow(this.#state, command.windowId);
				if (!isHost(this.#state, command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "Only the room authority may claim a model turn");
				}
				if (this.#state.modelTurn) {
					throw new RoomCommandError("MODEL_TURN_CLAIMED", `Response window ${JSON.stringify(window.id)} already has a model turn`);
				}
				if (window.status !== "ready" || !responseWindowReady(window)) {
					throw new RoomCommandError("WINDOW_NOT_READY", `Response window ${JSON.stringify(window.id)} is not ready`);
				}
				state = nextState(this.#state, {
					responseWindow: { ...window, status: "resolving" },
					modelTurn: { windowId: window.id, claimId: command.claimId, status: "claimed" },
				});
				events.push({ type: "model-turn-claimed", windowId: window.id, claimId: command.claimId });
				break;
			}
			case "release-model-turn": {
				const window = requireWindow(this.#state, command.windowId);
				if (!isHost(this.#state, command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "Only the room authority may release a model turn");
				}
				if (this.#state.modelTurn?.claimId !== command.claimId || this.#state.modelTurn.windowId !== window.id) {
					throw new RoomCommandError("WRONG_CLAIM", `No active model turn claim ${JSON.stringify(command.claimId)}`);
				}
				if (window.status !== "resolving") {
					throw new RoomCommandError("WINDOW_CLOSED", `Response window ${JSON.stringify(window.id)} is ${window.status}`);
				}
				state = nextState(this.#state, {
					responseWindow: { ...window, status: "ready" },
					modelTurn: undefined,
				});
				events.push({ type: "model-turn-released", windowId: window.id, claimId: command.claimId });
				break;
			}
			case "resolve-model-turn": {
				const window = requireWindow(this.#state, command.windowId);
				if (!isHost(this.#state, command.actorParticipantId)) {
					throw new RoomCommandError("UNAUTHORIZED", "Only the room authority may resolve a model turn");
				}
				if (this.#state.modelTurn?.claimId !== command.claimId || this.#state.modelTurn.windowId !== window.id) {
					throw new RoomCommandError("WRONG_CLAIM", `No active model turn claim ${JSON.stringify(command.claimId)}`);
				}
				if (window.status !== "resolving") {
					throw new RoomCommandError("WINDOW_CLOSED", `Response window ${JSON.stringify(window.id)} is ${window.status}`);
				}
				state = nextState(this.#state, {
					responseWindow: { ...window, status: "resolved" },
					modelTurn: { ...this.#state.modelTurn, status: "resolved" },
				});
				events.push({ type: "model-turn-resolved", windowId: window.id, claimId: command.claimId });
				break;
			}
		}

		this.#state = cloneState(state);
		const result: RoomCommandResult = { state: cloneState(state), events, replayed: false };
		this.#processed.set(command.commandId, { signature, result });
		return { ...result, state: cloneState(result.state), events: cloneEvents(result.events) };
	}
}
