/**
 * GM guidance, loaded from markdown shipped beside this file.
 *
 * This used to be a pi skill. It stopped being one because a skill is loaded in
 * every session whether or not anyone is playing, while its only real job was to be
 * *found* when someone asks to play -- and a tool description does that job. So the
 * trigger text lives on `portent_campaign`, and this content is injected once a game
 * actually starts.
 *
 * Two tiers, for the same reason the skill had references:
 *
 * - {@link sessionGuidance} is the standing part -- the core loop plus the printing in
 *   play. It goes in the system prompt and stays byte-identical all session, so it
 *   costs one cache miss when play starts rather than one per turn.
 * - {@link guidanceTopic} is the deep material, read on demand through a tool. Turn
 *   structure detail and a character-creation walkthrough are not needed on every turn.
 *
 * Kept as markdown files rather than string literals so they stay readable and
 * editable, and so a diff of the prose looks like a diff of prose.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolve a file next to the package's `guidance/` directory.
 *
 * `fileURLToPath` rather than `new URL(...).pathname`, which percent-encodes: the
 * skill this replaced was unreachable for anyone whose checkout path contained a
 * space, because `/My Code/` arrived as `/My%20Code/`.
 */
function guidanceFile(relative: string): string {
	return fileURLToPath(new URL(`../guidance/${relative}`, import.meta.url));
}

const cache = new Map<string, string>();

function read(relative: string): string | undefined {
	const cached = cache.get(relative);
	if (cached !== undefined) return cached;
	try {
		const body = readFileSync(guidanceFile(relative), "utf8").trim();
		cache.set(relative, body);
		return body;
	} catch {
		// A missing guidance file must not take a session down. The GM is worse without
		// it, not broken, and the caller reports the absence.
		return undefined;
	}
}

/** The deep-dive topics, exposed through `portent_guidance`. */
export const GUIDANCE_TOPICS = ["character-creation", "combat", "solo-techniques"] as const;
export type GuidanceTopic = (typeof GUIDANCE_TOPICS)[number];

/** One topic's markdown, or undefined if it is not on disk. */
export function guidanceTopic(topic: GuidanceTopic): string | undefined {
	return read(`topics/${topic}.md`);
}

/**
 * Map a campaign's system and printing onto a guidance file id.
 *
 * Falls back along a deliberate chain: exact printing, then the system's default
 * printing, then generic. An unknown system gets generic guidance rather than
 * silently getting 5E's, because inventing rules for someone else's system is worse
 * than admitting there are none.
 */
export function systemGuidanceId(system: string, edition?: string): string {
	const base = system.trim().toLowerCase().replace(/&/g, "n").replace(/[^a-z0-9]+/g, "");
	const printing = edition?.trim().toLowerCase();
	if (base === "5e" || base === "dnd5e" || base === "dnd") {
		return printing === "2014" ? "5e-2014" : "5e-2024";
	}
	if (base === "pf2e" || base === "pathfinder2e") {
		return printing === "legacy" ? "pf2e-legacy" : "pf2e-remaster";
	}
	if (base === "pf1e" || base === "pathfinder1e") return "pf1e";
	return "generic";
}

/**
 * The standing briefing: core loop plus the printing in play.
 *
 * Deterministic for a given campaign, which is what keeps the prompt prefix cached.
 */
export function sessionGuidance(system: string, edition?: string): string {
	const parts = [read("core.md")];
	const id = systemGuidanceId(system, edition);
	const specifics = read(`systems/${id}.md`) ?? read("systems/generic.md");
	if (specifics) parts.push(`# System guidance: ${id}\n\n${specifics}`);
	parts.push(
		[
			"## Deeper guidance, on demand",
			"",
			"Read these when they are about to matter, not up front:",
			...GUIDANCE_TOPICS.map((topic) => `- \`portent_guidance { topic: "${topic}" }\``),
		].join("\n"),
	);
	return parts.filter(Boolean).join("\n\n---\n\n");
}
