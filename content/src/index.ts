/**
 * @portent/content — the bundled content packs.
 *
 * Data only. Everything here is a plain value that `@portent/core` knows how to
 * parse, validate and render; nothing in this package has behaviour of its own.
 * That split is deliberate: content is the part people will want to fork,
 * extend and version independently of the engine.
 *
 * `@portent/core` is a peer dependency, and only its *types* are imported, so
 * this package adds nothing to a bundle beyond the data itself.
 *
 * All original writing, CC0. Nothing is reproduced from a published rulebook,
 * solo system or commercial deck.
 */

export { dungeonTiles } from "./dungeon-tiles.ts";
