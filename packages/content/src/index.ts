/**
 * The batteries-included content bundle.
 *
 * Re-exports the generic pack plus the packs for systems in common use, so a
 * caller who does not want to think about packaging can depend on this one thing
 * and get sensible content for the games most tables actually play.
 *
 * ```ts
 * import { createRegistry } from "@portent/core";
 * import { commonContent } from "@portent/content";
 *
 * const registry = createRegistry(commonContent, { allowOverride: true });
 * ```
 *
 * ## What goes in here
 *
 * A system earns a place only if someone other than its author is likely to play
 * it. The bar exists because this package's whole value is "you do not have to
 * choose", and that stops being true once it carries a dozen niche systems.
 *
 * A system that does not meet the bar still gets a package -- it just is not
 * re-exported here. `@portent/content-<system>` is always installable directly,
 * so nothing is gatekept, only unbundled.
 *
 * ## Order matters
 *
 * Packs are listed generic-first, so a system pack later in the list overrides a
 * generic entry with the same id. That is the intended way for a system to
 * replace, say, a generic wild-magic table with its own.
 */

import type { ContentPack } from "@portent/core";
import { dnd2014Content, dnd2024Content } from "@portent/content-dnd";
import { genericContent } from "@portent/content-generic";
import { pf1eContent, pf2eContent, pf2eLegacyContent } from "@portent/content-pf";

export { genericContent } from "@portent/content-generic";
export * from "@portent/content-generic";
export { dnd2014Content, dnd2024Content, SRD_5_1, SRD_5_2_1 } from "@portent/content-dnd";
export { pf1eContent, pf2eContent, pf2eLegacyContent } from "@portent/content-pf";

/**
 * Every bundled pack, generic first.
 *
 * Pass the whole array to `createRegistry`: the order is the override order, and
 * getting it wrong is how a system's own table gets shadowed by the generic one.
 */
export const commonContent: readonly ContentPack[] = [
	genericContent,
	dnd2014Content,
	dnd2024Content,
	pf1eContent,
	pf2eLegacyContent,
	pf2eContent,
];

/** Which systems this bundle covers, for a caller that wants to say so. */
export const bundledSystems: readonly string[] = [
	"generic",
	"5e (2014)",
	"5e (2024)",
	"pf1e",
	"pf2e (legacy)",
	"pf2e (remaster)",
];
