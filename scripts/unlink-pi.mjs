#!/usr/bin/env node
/**
 * Remove the vendored pi packages before `pnpm install` runs.
 *
 * `packages/pi` symlinks three of pi's packages into its node_modules so the
 * extension can typecheck and be tested. pnpm chmods the bin scripts of every
 * package it finds there, and pi's store is read-only, so an install with the
 * links present fails with EPERM.
 *
 * They are not lost: `pretest` re-creates them for the tests that need them, and
 * `typecheck` refuses to run without them and says how to fix it. This hook only
 * reduces the chance of pnpm meeting them mid-install; it is not load-bearing,
 * because pnpm prunes them anyway.
 */

import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendored = ["packages/pi/node_modules/@earendil-works", "packages/pi/node_modules/typebox"];

let removed = 0;
for (const relative of vendored) {
	const path = join(root, relative);
	if (!existsSync(path)) continue;
	rmSync(path, { recursive: true, force: true });
	removed++;
}
if (removed > 0) console.log(`Removed ${removed} vendored pi path(s); \`pnpm typecheck\` will restore them.`);
