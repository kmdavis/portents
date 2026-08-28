/**
 * `@portents/guidance` — how to run a solo session, as prose.
 *
 * Harness-neutral, and **browser-safe**: the markdown is generated into strings, so
 * nothing here touches a filesystem. That is the whole reason this package exists
 * separately from `@portents/pi`, which read the same files with `node:fs` and could
 * therefore not share them with a browser.
 *
 * Two tiers, because not all of it is needed on every turn:
 *
 * - {@link CORE_GUIDANCE} is the session loop, dice honesty, who rolls what, and what
 *   stays behind the screen. Always relevant while a game is running.
 * - {@link guidanceTopic} is the deep material, fetched when it is about to matter.
 *
 * **System rules are not here.** They live on the content packs, keyed by system, so a
 * printing change touches one package. See `ContentRegistry.guidanceFor`.
 *
 * The prose names `portents_*` tools, which is a Portents convention rather than a pi
 * one -- any harness exposing the engine should use those names so this text stays
 * true. A harness that renames them needs its own preamble.
 */

import { CORE, TOPICS } from "./generated.ts";

/** The always-relevant guidance: session loop, dice honesty, secrecy, who rolls. */
export const CORE_GUIDANCE: string = CORE;

/** Topic ids available through {@link guidanceTopic}, sorted. */
export const GUIDANCE_TOPICS = Object.keys(TOPICS).sort() as readonly string[];

/** One topic's markdown, or `undefined` if nothing ships under that id. */
export function guidanceTopic(topic: string): string | undefined {
	return TOPICS[topic];
}

/**
 * Is this a topic this package ships?
 *
 * Exposed so a harness can validate a tool parameter against the real list rather
 * than a copy of it that drifts.
 */
export function isGuidanceTopic(topic: string): boolean {
	return Object.hasOwn(TOPICS, topic);
}
