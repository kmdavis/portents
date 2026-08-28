#!/usr/bin/env node
/**
 * Make sure pi's packages are linked, and say plainly what to do if they cannot be.
 *
 * This used to be `node scripts/link-pi.mjs >/dev/null 2>&1;` inside the
 * typecheck script. That hid the one message explaining the failure, so a machine
 * without pi got a wall of "Cannot find module '@earendil-works/pi-ai'" pointing
 * at the wrong problem. It also made a command called "typecheck" write symlinks
 * as a side effect, which is surprising enough that it corrupted a verification
 * of this very script.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const marker = resolve(here, "../node_modules/@earendil-works/pi-coding-agent");

if (existsSync(marker)) process.exit(0);

const { default: link } = await import("./link-pi.mjs").catch(() => ({ default: undefined }));
void link;

if (existsSync(marker)) process.exit(0);

console.error(
	[
		"Cannot typecheck the extension: pi's own packages are not available.",
		"",
		"  @earendil-works/pi-coding-agent and pi-ai are not on a registry this",
		"  machine can reach, so they are symlinked from an installed pi.",
		"",
		"To fix, either:",
		"  pnpm --filter @portent/pi link-pi     # with pi installed under ~/.pi/pkg",
		"  PI_HOME=/path/to/pi pnpm --filter @portent/pi link-pi",
		"",
		"The tests do not need this: the parity suite imports @portent/core alone.",
	].join("\n"),
);
process.exit(1);
