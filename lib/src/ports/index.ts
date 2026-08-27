/**
 * Ports — every capability the library needs from the outside world.
 *
 * The rule: `@portent/core` depends on interfaces declared here and on nothing
 * else. No `node:` imports, no DOM, no globals reached for inside engine logic.
 * Adapters live in `@portent/core/node`, `/browser` and `/memory`.
 *
 * ## Adding a port later, including an LLM
 *
 * Nothing in the library calls a language model today. It is all deterministic
 * generation that an agent *uses*: dice, decks, tables, oracles, maps, tiles.
 * That is deliberate and worth keeping — it is what makes the whole thing
 * testable and what makes a fabricated roll detectable.
 *
 * If a feature ever does need a model — narrating a table result in the
 * campaign's voice, say, or naming an NPC in a specific style — it arrives as
 * another port here, not as a dependency inside the engine:
 *
 * ```ts
 * export interface Narrator {
 *   complete(prompt: string, opts?: { maxTokens?: number }): Promise<string>;
 * }
 * ```
 *
 * and is injected into the one construct that needs it, so that:
 *
 * - the pure generators keep working with no model and no network;
 * - a caller with no `Narrator` gets the deterministic behaviour, not a crash;
 * - tests inject a stub and stay fast and offline.
 *
 * The seam is deliberately not built yet. A published interface with no
 * implementation is a guess about a problem nobody has had.
 */

export { type Clock, fixedClock, systemClock, tickingClock } from "./clock.ts";
export {
	cryptoRandomSource,
	defaultRandomSource,
	type RandomSource,
	randomSeed,
	randomSourceFrom,
	seededRandomSource,
} from "./random.ts";
export {
	assertValidKey,
	InvalidKeyError,
	isValidKey,
	type Storage,
	StorageError,
	type StorageKey,
	StorageUnavailableError,
} from "./storage.ts";
