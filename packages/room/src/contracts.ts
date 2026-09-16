/**
 * Experimental multiplayer room contracts.
 *
 * These describe an in-process, single-writer coordinator. They are transport-ready,
 * not transport-safe: a hosted adapter still needs durable compare-and-swap,
 * idempotency persistence, authentication, and a model-turn lease.
 */

import { isNamespacedId } from "@portents/core";

export const ROOM_SCHEMA_VERSION = 1 as const;
export type ParticipantRole = "player" | "host";
export type ResponseMode = "all" | "any" | "ordered";
export type WindowStatus = "collecting" | "ready" | "resolving" | "resolved";

export interface Participant {
	readonly id: string;
	readonly displayName: string;
	readonly roles: readonly ParticipantRole[];
}

/**
 * A participant may control several characters, and several participants may jointly
 * control one. Any listed controller may answer an addressed request for the character.
 */
export interface CharacterController {
	readonly characterId: string;
	readonly participantIds: readonly string[];
}

export interface InputRequest {
	readonly id: string;
	readonly prompt: string;
	readonly characterIds?: readonly string[];
}

export type InputResponse =
	| { readonly participantId: string; readonly kind: "response"; readonly body: string }
	| { readonly participantId: string; readonly kind: "pass" };

export interface ResponseWindow {
	readonly id: string;
	readonly request: InputRequest;
	readonly mode: ResponseMode;
	readonly requiredParticipantIds: readonly string[];
	/** Required in ordered mode and ignored in the other modes. */
	readonly activeParticipantId?: string;
	readonly responses: readonly InputResponse[];
	readonly status: WindowStatus;
	/** A host decision. Silence never sets this automatically. */
	readonly advancedBy?: string;
}

export interface ModelTurnClaim {
	readonly windowId: string;
	readonly claimId: string;
	readonly status: "claimed" | "resolved";
}

export interface RoomState {
	readonly schemaVersion: typeof ROOM_SCHEMA_VERSION;
	readonly id: string;
	readonly revision: number;
	readonly participants: readonly Participant[];
	readonly controllers: readonly CharacterController[];
	readonly responseWindow?: ResponseWindow;
	readonly modelTurn?: ModelTurnClaim;
}

interface CommandEnvelope {
	/** Unique per user intent. A coordinator returns the previous result on a retry. */
	readonly commandId: string;
	/** Reject rather than overwrite when the room moved since the client read it. */
	readonly expectedRevision: number;
	readonly actorParticipantId: string;
}

export type RoomCommand =
	| (CommandEnvelope & { readonly type: "open-window"; readonly window: ResponseWindow })
	| (CommandEnvelope & { readonly type: "submit"; readonly windowId: string; readonly response: InputResponse })
	| (CommandEnvelope & { readonly type: "advance"; readonly windowId: string })
	| (CommandEnvelope & { readonly type: "claim-model-turn"; readonly windowId: string; readonly claimId: string })
	| (CommandEnvelope & { readonly type: "resolve-model-turn"; readonly windowId: string; readonly claimId: string });

export type RoomEvent =
	| { readonly type: "window-opened"; readonly windowId: string }
	| { readonly type: "response-recorded"; readonly windowId: string; readonly participantId: string; readonly responseKind: "response" | "pass" }
	| { readonly type: "window-ready"; readonly windowId: string }
	| { readonly type: "window-advanced"; readonly windowId: string; readonly participantId: string }
	| { readonly type: "model-turn-claimed"; readonly windowId: string; readonly claimId: string }
	| { readonly type: "model-turn-resolved"; readonly windowId: string; readonly claimId: string };

export class RoomContractError extends Error {
	readonly problems: readonly string[];
	constructor(problems: readonly string[]) {
		super(`Invalid room state:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
		this.name = "RoomContractError";
		this.problems = problems;
	}
}

const LOCAL_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PARTICIPANT_ROLES: readonly ParticipantRole[] = ["player", "host"];
const RESPONSE_MODES: readonly ResponseMode[] = ["all", "any", "ordered"];
const WINDOW_STATUSES: readonly WindowStatus[] = ["collecting", "ready", "resolving", "resolved"];

function duplicates(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicate = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicate.add(value);
		seen.add(value);
	}
	return [...duplicate].sort();
}

/** Whether a participant has supplied either an answer or an explicit pass. */
export function participantResponded(window: ResponseWindow, participantId: string): boolean {
	return window.responses.some((response) => response.participantId === participantId);
}

/** Pure gate. The model must not be called before this or explicit host advance. */
export function responseWindowReady(window: ResponseWindow): boolean {
	if (window.advancedBy) return true;
	if (window.mode === "any") return window.responses.length > 0;
	if (window.mode === "ordered") {
		return window.activeParticipantId !== undefined && participantResponded(window, window.activeParticipantId);
	}
	return window.requiredParticipantIds.every((participantId) => participantResponded(window, participantId));
}

export function roomStateProblems(room: RoomState): string[] {
	const problems: string[] = [];
	if (room.schemaVersion !== ROOM_SCHEMA_VERSION) problems.push(`schemaVersion must be ${ROOM_SCHEMA_VERSION}`);
	if (!isNamespacedId(room.id)) problems.push(`room id must be a lowercase namespaced id, got ${JSON.stringify(room.id)}`);
	if (!Number.isInteger(room.revision) || room.revision < 0) problems.push("revision must be a non-negative integer");
	if (room.participants.length === 0) problems.push("a room needs at least one participant");

	const participantIds = room.participants.map((participant) => participant.id);
	for (const id of duplicates(participantIds)) problems.push(`duplicate participant id ${JSON.stringify(id)}`);
	const participants = new Set(participantIds);
	for (const participant of room.participants) {
		if (!LOCAL_ID.test(participant.id)) problems.push(`invalid participant id ${JSON.stringify(participant.id)}`);
		if (!participant.displayName.trim()) problems.push(`participant ${JSON.stringify(participant.id)} needs a display name`);
		if (participant.roles.length === 0) problems.push(`participant ${JSON.stringify(participant.id)} needs a role`);
		for (const role of participant.roles) {
			if (!PARTICIPANT_ROLES.includes(role)) problems.push(`participant ${JSON.stringify(participant.id)} has invalid role ${JSON.stringify(role)}`);
		}
		for (const role of duplicates(participant.roles)) problems.push(`participant ${JSON.stringify(participant.id)} repeats role ${role}`);
	}
	if (!room.participants.some((participant) => participant.roles.includes("host"))) problems.push("a room needs a host");

	const controlledCharacters = new Set<string>();
	for (const controller of room.controllers) {
		if (!isNamespacedId(controller.characterId)) problems.push(`invalid character id ${JSON.stringify(controller.characterId)}`);
		if (controlledCharacters.has(controller.characterId)) problems.push(`duplicate controller record for ${JSON.stringify(controller.characterId)}`);
		controlledCharacters.add(controller.characterId);
		if (controller.participantIds.length === 0) problems.push(`character ${JSON.stringify(controller.characterId)} needs a controller`);
		for (const id of duplicates(controller.participantIds)) problems.push(`character ${JSON.stringify(controller.characterId)} repeats controller ${JSON.stringify(id)}`);
		for (const id of controller.participantIds) {
			if (!participants.has(id)) problems.push(`character ${JSON.stringify(controller.characterId)} names unknown controller ${JSON.stringify(id)}`);
		}
	}

	const window = room.responseWindow;
	if (window) {
		if (!LOCAL_ID.test(window.id)) problems.push(`invalid response window id ${JSON.stringify(window.id)}`);
		if (!LOCAL_ID.test(window.request.id)) problems.push(`invalid input request id ${JSON.stringify(window.request.id)}`);
		if (!window.request.prompt.trim()) problems.push(`response window ${JSON.stringify(window.id)} needs a prompt`);
		if (!RESPONSE_MODES.includes(window.mode)) problems.push(`invalid response mode ${JSON.stringify(window.mode)}`);
		if (!WINDOW_STATUSES.includes(window.status)) problems.push(`invalid response window status ${JSON.stringify(window.status)}`);
		if (window.requiredParticipantIds.length === 0) problems.push("a response window needs at least one required participant");
		for (const characterId of window.request.characterIds ?? []) {
			if (!isNamespacedId(characterId)) problems.push(`input request has invalid character id ${JSON.stringify(characterId)}`);
			if (!controlledCharacters.has(characterId)) problems.push(`input request names uncontrolled character ${JSON.stringify(characterId)}`);
		}
		for (const id of duplicates(window.requiredParticipantIds)) problems.push(`response window repeats required participant ${JSON.stringify(id)}`);
		for (const id of window.requiredParticipantIds) {
			if (!participants.has(id)) problems.push(`response window requires unknown participant ${JSON.stringify(id)}`);
		}
		if (window.mode === "ordered") {
			if (!window.activeParticipantId) problems.push("an ordered response window needs an active participant");
			else if (!window.requiredParticipantIds.includes(window.activeParticipantId)) problems.push("ordered active participant must be required");
		} else if (window.activeParticipantId !== undefined) {
			problems.push(`${window.mode} response window must not have an active participant`);
		}
		const responseIds = window.responses.map((response) => response.participantId);
		for (const id of duplicates(responseIds)) problems.push(`participant ${JSON.stringify(id)} responded more than once`);
		for (const response of window.responses) {
			if (!participants.has(response.participantId)) problems.push(`response names unknown participant ${JSON.stringify(response.participantId)}`);
			if (!window.requiredParticipantIds.includes(response.participantId)) problems.push(`response from participant ${JSON.stringify(response.participantId)} was not requested`);
			if (response.kind === "response" && !response.body.trim()) problems.push(`response from ${JSON.stringify(response.participantId)} is empty`);
		}
		if (window.advancedBy) {
			const host = room.participants.find((participant) => participant.id === window.advancedBy);
			if (!host?.roles.includes("host")) problems.push(`window was advanced by non-host ${JSON.stringify(window.advancedBy)}`);
		}
		const ready = responseWindowReady(window);
		if (window.status === "collecting" && ready) problems.push("ready response window is still marked collecting");
		if (window.status !== "collecting" && !ready) problems.push(`${window.status} response window is not ready`);
	}

	if (room.modelTurn) {
		if (!window || room.modelTurn.windowId !== window.id) problems.push("model turn does not belong to the current response window");
		if (!LOCAL_ID.test(room.modelTurn.claimId)) problems.push(`invalid model turn claim id ${JSON.stringify(room.modelTurn.claimId)}`);
		if (window?.status !== "resolving" && window?.status !== "resolved") problems.push("model turn exists before the response window is resolving");
		if (room.modelTurn.status === "claimed" && window?.status !== "resolving") problems.push("claimed model turn needs a resolving response window");
		if (room.modelTurn.status === "resolved" && window?.status !== "resolved") problems.push("resolved model turn needs a resolved response window");
	} else if (window?.status === "resolving" || window?.status === "resolved") {
		problems.push(`${window.status} response window needs a model turn`);
	}

	return [...new Set(problems)];
}

export function assertRoomState(room: RoomState): RoomState {
	const problems = roomStateProblems(room);
	if (problems.length > 0) throw new RoomContractError(problems);
	return room;
}
