/**
 * The standing briefing this extension injects when a game starts.
 *
 * Both halves of the prose come from packages now, and neither is in this file:
 *
 * - Harness-neutral session guidance is `@portents/guidance`. It used to be markdown
 *   read from disk here, which meant a browser could not share it -- so the demo site
 *   would have had to duplicate two hundred lines of prose we had just spent two
 *   commits de-duplicating.
 * - System rules are on the content packs, resolved through the registry, so a
 *   printing change touches one package.
 *
 * What is left is the part that is genuinely about pi: assembling those into one
 * system-prompt block, and naming the tool that fetches a deep topic.
 */

import { CORE_GUIDANCE, GUIDANCE_TOPICS, guidanceTopic } from "@portents/guidance";
import { type ContentRegistry, guidanceTitle } from "@portents/core";

export { GUIDANCE_TOPICS, guidanceTopic };

/**
 * The standing briefing: session loop plus the system in play.
 *
 * Deterministic for a given campaign and registry, which is what keeps the prompt
 * prefix cached. See the note on `standingBriefing` in `index.ts` for why that
 * matters.
 *
 * When no pack claims the system this says so, rather than substituting another
 * system's rules. A GM told "there is no guidance for Troika, make rulings and say
 * they are rulings" behaves better than one silently handed fifth edition's.
 */
export function sessionGuidance(registry: ContentRegistry, system: string, edition?: string): string {
	const line = edition ? `${system} (${edition})` : system;
	const found = registry.guidanceFor(line) ?? registry.guidanceFor(system);

	return [
		CORE_GUIDANCE,
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
		[
			"## Deeper guidance, on demand",
			"",
			"Read these when they are about to matter, not up front:",
			...GUIDANCE_TOPICS.map((topic) => `- \`portents_guidance { topic: "${topic}" }\``),
		].join("\n"),
	].join("\n\n---\n\n");
}

/**
 * The systems this installation can actually run.
 *
 * Derived from loaded guidance rather than a hardcoded list, so installing a content
 * pack for another system makes it offerable at session zero without touching this
 * package.
 */
export function availableSystems(registry: ContentRegistry): string[] {
	return registry
		.guidanceIds()
		.map((id) => {
			const found = registry.guidanceFor(id);
			if (!found) return `\`${id}\``;
			// Title for speaking to the player, alias for passing back as a parameter.
			return `${guidanceTitle(found)} — pass \`system: "${found.aliases[0]}"\``;
		})
		.sort();
}
