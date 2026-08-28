import type { Table } from "@portents/core";

import { dungeonDressing } from "./dungeon-dressing.ts";
import { dungeonRoomPurpose } from "./dungeon-room-purpose.ts";
import { encountersDungeon } from "./encounters-dungeon.ts";
import { encountersUrban } from "./encounters-urban.ts";
import { encountersWilderness } from "./encounters-wilderness.ts";
import { gmMoves } from "./gm-moves.ts";
import { namesBynames } from "./names-bynames.ts";
import { namesCommon } from "./names-common.ts";
import { namesDwarf } from "./names-dwarf.ts";
import { namesElf } from "./names-elf.ts";
import { namesPlace } from "./names-place.ts";
import { npcMannerism } from "./npc-mannerism.ts";
import { oracleActions } from "./oracle-actions.ts";
import { oracleComplications } from "./oracle-complications.ts";
import { oracleSceneInterrupt } from "./oracle-scene-interrupt.ts";
import { oracleSceneSkew } from "./oracle-scene-skew.ts";
import { oracleSubjects } from "./oracle-subjects.ts";
import { questHooks } from "./quest-hooks.ts";
import { rumours } from "./rumours.ts";
import { tavernNames } from "./tavern-names.ts";
import { traps } from "./traps.ts";
import { treasureMinor } from "./treasure-minor.ts";
import { weather } from "./weather.ts";

export { dungeonDressing } from "./dungeon-dressing.ts";
export { dungeonRoomPurpose } from "./dungeon-room-purpose.ts";
export { encountersDungeon } from "./encounters-dungeon.ts";
export { encountersUrban } from "./encounters-urban.ts";
export { encountersWilderness } from "./encounters-wilderness.ts";
export { gmMoves } from "./gm-moves.ts";
export { namesBynames } from "./names-bynames.ts";
export { namesCommon } from "./names-common.ts";
export { namesDwarf } from "./names-dwarf.ts";
export { namesElf } from "./names-elf.ts";
export { namesPlace } from "./names-place.ts";
export { npcMannerism } from "./npc-mannerism.ts";
export { oracleActions } from "./oracle-actions.ts";
export { oracleComplications } from "./oracle-complications.ts";
export { oracleSceneInterrupt } from "./oracle-scene-interrupt.ts";
export { oracleSceneSkew } from "./oracle-scene-skew.ts";
export { oracleSubjects } from "./oracle-subjects.ts";
export { questHooks } from "./quest-hooks.ts";
export { rumours } from "./rumours.ts";
export { tavernNames } from "./tavern-names.ts";
export { traps } from "./traps.ts";
export { treasureMinor } from "./treasure-minor.ts";
export { weather } from "./weather.ts";

/** Every bundled table, in a stable order. */
export const tables: readonly Table[] = [
	dungeonDressing,
	dungeonRoomPurpose,
	encountersDungeon,
	encountersUrban,
	encountersWilderness,
	gmMoves,
	namesBynames,
	namesCommon,
	namesDwarf,
	namesElf,
	namesPlace,
	npcMannerism,
	oracleActions,
	oracleComplications,
	oracleSceneInterrupt,
	oracleSceneSkew,
	oracleSubjects,
	questHooks,
	rumours,
	tavernNames,
	traps,
	treasureMinor,
	weather,
];
