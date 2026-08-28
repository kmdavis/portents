import type { Deck } from "@portents/core";

import { critFumbles } from "./crit-fumbles.ts";
import { critHits } from "./crit-hits.ts";
import { monsterTactics } from "./monster-tactics.ts";
import { npcSparks } from "./npc-sparks.ts";
import { playingCards } from "./playing-cards.ts";
import { wildMagic } from "./wild-magic.ts";

export { critFumbles } from "./crit-fumbles.ts";
export { critHits } from "./crit-hits.ts";
export { monsterTactics } from "./monster-tactics.ts";
export { npcSparks } from "./npc-sparks.ts";
export { playingCards } from "./playing-cards.ts";
export { wildMagic } from "./wild-magic.ts";

/** Every bundled deck, in a stable order. */
export const decks: readonly Deck[] = [
	critFumbles,
	critHits,
	monsterTactics,
	npcSparks,
	playingCards,
	wildMagic,
];
