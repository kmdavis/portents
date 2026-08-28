/**
 * Local-only content. Never published. See README.md.
 *
 * Ships empty on purpose: what goes here is a decision about books you own, and
 * a shared repository should not make it for you. Add tables and decks with
 * `license: "UNLICENSED"` and a source that says plainly where they came from.
 *
 * The pack still exists and still loads, so the wiring is proven by the tests
 * below rather than discovered the first time someone needs it.
 */

import type { ContentPack } from "@portent/core";

export const personalContent: ContentPack = {
	id: "dnd-personal",
	name: "Personal content",
	tables: [],
	decks: [],
	// Whatever you add here is not distributable, so the pack says so up front
	// rather than relying on each item to remember.
	provenance: {
		source: "content typed from rulebooks owned by the user, for personal use only",
		license: "UNLICENSED",
	},
};
