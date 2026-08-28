/**
 * `@portent/web` — browser and edge integration for Portent.
 *
 * **No UI, and no agent.** This package is the seam a UI sits on: a session
 * facade over the engine that persists through whatever `Storage` it is handed.
 * A UI imports it; it imports no UI.
 *
 * **Storage is the caller's choice.** An IndexedDB adapter ships with the
 * library and is one option, not the option -- a hosted UI backed by a key-value
 * service passes an adapter for that instead, and the session cannot tell the
 * difference. Nothing here reaches for a platform.
 *
 * ```ts
 * import { WebSession } from "@portent/web";
 * import { BrowserStorage } from "@portent/core/browser";   // in a browser
 * // import { QuickStorage } from "./quick-storage.ts";     // or anywhere else
 *
 * const session = new WebSession({ storage: new BrowserStorage({ database: "portent" }) });
 * const rolled = await session.roll("2d20kh1+5", { dc: 15 });
 * ```
 */

export {
	type MapOutcome,
	type RollOutcome,
	type SessionOptions,
	WebSession,
} from "./session.ts";
