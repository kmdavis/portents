/**
 * @portent/content — the bundled content packs.
 *
 * Data only. Everything here is a plain value that `@portent/core` knows how to
 * parse, validate and render; nothing in this package has behaviour of its own.
 * That split is deliberate: content is the part people will want to fork, extend
 * and version independently of the engine.
 *
 * `@portent/core` is a peer dependency and only its *types* are imported, so this
 * package adds nothing to a bundle beyond the data itself.
 *
 * ```ts
 * import { createRegistry, rollTableById, yesNo } from "@portent/core";
 * import { portentContent } from "@portent/content";
 *
 * const registry = createRegistry([portentContent]);
 * rollTableById("encounters-dungeon", { registry });
 * yesNo("Is the gate still guarded?", "likely", { registry });
 * ```
 *
 * All original writing, CC0. Nothing is reproduced from a published rulebook,
 * solo system or commercial deck.
 */

import type { ContentPack } from "@portent/core";
import { decks } from "./decks/index.ts";
import { tables } from "./tables/index.ts";

export { dungeonTiles } from "./dungeon-tiles.ts";
export * from "./decks/index.ts";
export * from "./tables/index.ts";
export { decks, tables };

/**
 * Everything bundled, as one pack.
 *
 * Pass it to `createRegistry` to make it available to tables, decks and the
 * oracle. Put a pack of your own after it with `allowOverride` to replace
 * individual entries by id.
 */
export const portentContent: ContentPack = {
	id: "portent",
	name: "Portent core content",
	decks,
	tables,
	provenance: { source: "original writing for Portent", license: "CC0" },
};
