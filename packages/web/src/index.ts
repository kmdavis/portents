/**
 * `@portents/web` — browser and edge integration for Portents.
 *
 * **No UI, and no agent.** This package is the seam a UI sits on: a session
 * facade over the engine that persists through whatever `Storage` it is handed.
 * A UI imports it; it imports no UI.
 *
 * **Storage defaults to IndexedDB and can be replaced.** A browser gets the right
 * thing with no ceremony; anywhere else supplies its own adapter and the session
 * cannot tell the difference.
 *
 * ```ts
 * import { WebSession } from "@portents/web";
 *
 * // In a browser: IndexedDB, no arguments needed.
 * const session = new WebSession();
 * const rolled = await session.roll("2d20kh1+5", { dc: 15 });
 *
 * // Anywhere else: bring your own.
 * const hosted = new WebSession({ storage: new MyKeyValueStorage() });
 * ```
 */

export {
	type DrawOutcome,
	type MapOutcome,
	type RollOutcome,
	type SessionOptions,
	type TextOutcome,
	WebSession,
} from "./session.ts";
export { executeCommand, type ExecuteCommandOptions } from "./commands.ts";
export {
	type CommandResponse,
	type CommandResult,
	type CommandRequest,
	type ProtocolError,
	type ProtocolErrorCode,
	ProtocolValidationError,
	type LedgerReference,
	PROTOCOL_VERSION,
	PROTOCOL_ERROR_CODES,
	type Command,
	type CampaignCommand,
	parseCommandRequest,
	serializeCommandRequest,
} from "./protocol.ts";
export {
	createCommandClient,
	parseCommandResponse,
	ProtocolCommandError,
} from "./client.ts";
