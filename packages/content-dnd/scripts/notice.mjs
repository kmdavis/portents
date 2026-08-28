#!/usr/bin/env node
/**
 * Generate NOTICE.md from the attribution each pack declares.
 *
 * Generated rather than hand-written for the same reason a character sheet's
 * Status block is: two places to state an obligation is one place to forget it.
 * The test asserts the file matches, so a new attributed table cannot land
 * without the notice that makes it compliant.
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNotice } from "@portents/core";
import { dndPacks } from "../src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const items = [];
for (const pack of dndPacks) {
	for (const table of pack.tables ?? []) items.push({ id: `table:${table.id}`, provenance: table.provenance });
	for (const deck of pack.decks ?? []) items.push({ id: `deck:${deck.id}`, provenance: deck.provenance });
	if (pack.provenance) items.push({ id: `pack:${pack.id}`, provenance: pack.provenance });
}

const notice = renderNotice("@portents/content-dnd", items);
if (notice === undefined) {
	console.log("Nothing here requires attribution; no NOTICE.md written.");
	process.exit(0);
}
writeFileSync(join(root, "NOTICE.md"), notice);
console.log(`Wrote NOTICE.md (${notice.split("\n").length} lines)`);
