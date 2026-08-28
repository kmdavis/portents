#!/usr/bin/env node
/**
 * Symlink the pi packages this extension imports into its node_modules.
 *
 * `@earendil-works/pi-coding-agent`, `pi-ai` and `typebox` are not on a registry
 * this machine can reach and npm is administratively blocked, so the extension's
 * types come from an installed pi.
 *
 * **Only the three packages actually imported.** An earlier version linked all
 * thirteen of pi's scoped packages, and `pnpm install` then failed with EPERM
 * trying to chmod a bin script inside a read-only one. The three linked here have
 * no bin scripts, so pnpm leaves them alone.
 *
 * They go in node_modules rather than a side directory because both tsc and the
 * Node test runner have to resolve them, and tsconfig `paths` would only satisfy
 * the first.
 *
 * **Symlinked, not copied.** Copying was tried and orphans pi's own transitive
 * dependencies: a dereferenced `pi-coding-agent` cannot resolve `chalk`, so the
 * adapter suite silently dropped 38 tests and still exited 0. A symlink keeps
 * Node resolving from pi's real tree.
 *
 * pnpm chmods the bin scripts of every package it finds in node_modules and
 * cannot chmod pi's read-only store, so the root `preinstall` removes these
 * first. `pnpm typecheck` re-creates them, which makes the cycle self-healing.
 *
 * Only `src/index.ts` needs them. The parity suite imports `@portent/core` alone,
 * so tests run in CI without this.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Exactly what src/index.ts imports. Adding to this list is a deliberate act. */
const NEEDED = ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "typebox"];

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../node_modules");

function findPi() {
	if (process.env.PI_HOME) return process.env.PI_HOME;
	const pkgDir = join(homedir(), ".pi/pkg");
	if (!existsSync(pkgDir)) return undefined;
	for (const version of readdirSync(pkgDir).filter((n) => n.startsWith("pi-")).sort().reverse()) {
		if (existsSync(join(pkgDir, version, "node_modules/@earendil-works"))) return join(pkgDir, version);
	}
	return undefined;
}

const piRoot = findPi();
if (!piRoot) {
	console.error("No pi installation found. Set PI_HOME to one, or install pi.");
	process.exit(1);
}

const source = join(piRoot, "node_modules");
const missing = NEEDED.filter((name) => !existsSync(join(source, name)));
if (missing.length > 0) {
	console.error(`pi at ${piRoot} is missing: ${missing.join(", ")}`);
	process.exit(1);
}

for (const name of NEEDED) {
	const from = join(target, name);
	mkdirSync(dirname(from), { recursive: true });
	if (existsSync(from)) rmSync(from, { recursive: true, force: true });
	symlinkSync(join(source, name), from, "dir");
}

console.log(`Linked ${NEEDED.length} pi packages from ${piRoot.replace(homedir(), "~")}`);

export default true;
