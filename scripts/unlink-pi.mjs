#!/usr/bin/env node
/**
 * Remove the vendored pi packages before `pnpm install` runs.
 *
 * `packages/pi` symlinks three of pi's packages into its node_modules so the
 * extension can typecheck and be tested. pnpm chmods the bin scripts of every
 * package it finds there, and pi's store is read-only, so an install with the
 * links present fails with EPERM.
 *
 * They are not lost: `pnpm typecheck` re-creates them via `require-pi.mjs`, so
 * the cycle is self-healing and nobody has to remember a step.
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
