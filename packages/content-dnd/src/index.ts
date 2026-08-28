/**
 * `@portent/content-dnd` — content for fifth-edition d20 fantasy.
 *
 * One package, one pack per printing, because the printings share most of their
 * content and splitting them would mean fixing a typo twice.
 *
 * ```ts
 * import { createRegistry } from "@portent/core";
 * import { genericContent } from "@portent/content-generic";
 * import { dnd2024Content } from "@portent/content-dnd/2024";
 *
 * // Generic first: order is the override order.
 * const registry = createRegistry([genericContent, dnd2024Content]);
 * ```
 *
 * Tables adapted from a System Reference Document carry the attribution that
 * document requires, verbatim, and `NOTICE.md` is generated from it. See
 * `src/srd.ts`.
 *
 * **What is deliberately absent:** a wild-magic surge table. It is not in any
 * SRD — 5.0, 5.1 and 5.2.1 all include Draconic as the only sorcerous origin —
 * so it is rulebook content and cannot be published here. The generic pack's own
 * wild-magic deck is original writing and covers the same need.
 */

export { dnd2014Content, sheet2014 } from "./2014/index.ts";
export { dnd2024Content, sheet2024, traps } from "./2024/index.ts";
export { SRD_5_1, SRD_5_1_STATEMENT, SRD_5_2_1, SRD_5_2_1_STATEMENT } from "./srd.ts";

import { dnd2014Content } from "./2014/index.ts";
import { dnd2024Content } from "./2024/index.ts";

/** Both printings, oldest first. */
export const dndPacks = [dnd2014Content, dnd2024Content] as const;
