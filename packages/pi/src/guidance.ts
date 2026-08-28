/**
 * GM guidance, loaded from markdown shipped beside this file.
 *
 * This used to be a pi skill. It stopped being one because a skill is loaded in
 * every session whether or not anyone is playing, while its only real job was to be
 * *found* when someone asks to play -- and a tool description does that job. So the
 * trigger text lives on `portent_campaign`, and this content is injected once a game
 * actually starts.
 *
 * System guidance is **not here**. It lives in the content packages, because it
 * answers a question about the system and every consumer needs the same answer --
 * this extension injects it into a prompt, a browser UI can show it in a panel. What
 * is left in this package is the part that is genuinely about *this harness*: which
 * tool to call, and how the session loop works.
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

import type { ContentRegistry } from "@portent/core";

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
 * The standing briefing: core loop plus the system in play.
 *
 * Deterministic for a given campaign and registry, which is what keeps the prompt
 * prefix cached.
 *
 * When no pack claims the system, this says so rather than substituting another
 * system's rules. A GM told "there is no guidance for Troika, make rulings and say
 * they are rulings" behaves better than one silently handed 5E's.
 */
export function sessionGuidance(registry: ContentRegistry, system: string, edition?: string): string {
	const parts = [read("core.md")];

	const line = edition ? `${system} (${edition})` : system;
	const found = registry.guidanceFor(line) ?? registry.guidanceFor(system);
	parts.push(
		found
			? `# System guidance: ${found.id}\n\n${found.body}`
			: [
					`# System guidance: none loaded for ${JSON.stringify(line)}`,
					"",
					"No content pack claims this system, so there are no printed rules to be faithful to.",
					"Make rulings that favour the fiction, say plainly that they are rulings rather than rules,",
					"and write recurring ones into `campaign.md` so the next session matches this one.",
					"Do not import another system's specifics without saying that is what you are doing.",
				].join("\n"),
	);

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

/**
 * The systems this installation can actually run, newest printing first.
 *
 * Derived from loaded guidance rather than a hardcoded list, so installing a content
 * pack for another system makes it offerable at session zero without touching this
 * package. That is the payoff for moving system guidance into the content packs.
 */
export function availableSystems(registry: ContentRegistry): string[] {
	const ids = registry.guidanceIds();
	const label = (id: string) => {
		const found = registry.guidanceFor(id);
		// The first alias is the canonical system line; the id is a fallback.
		const canonical = found?.aliases[0] ?? id;
		const heading = found?.body.match(/^#\s+(.+)$/m)?.[1];
		return heading ? `\`${canonical}\` — ${heading}` : `\`${canonical}\``;
	};
	return ids.map(label).sort();
}
