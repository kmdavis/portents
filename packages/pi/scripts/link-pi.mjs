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
 * **Copied, with their `node_modules` symlinked back at pi.** Both simpler
 * approaches fail, in opposite directions:
 *
 * - A plain symlink makes `pnpm install` fail with EPERM, because pnpm chmods the
 *   bin scripts of every package it finds and pi's store is read-only.
 * - A plain copy fixes that and orphans pi's own dependencies: a dereferenced
 *   `pi-coding-agent` cannot resolve `chalk`, so the adapter suite silently
 *   dropped 38 tests and still exited 0.
 *
 * Copying the package and symlinking only its `node_modules` satisfies both: the
 * files pnpm wants to chmod are writable, and Node still resolves transitive
 * dependencies from pi's real tree.
 *
 * **This does not survive `pnpm install`.** pnpm owns `node_modules` and prunes
 * entries it does not know about, so an install deletes all of this. That is why
 * `pretest` re-runs it: the adapter suite restores what it needs rather than
 * depending on an install ordering nobody should have to remember. An earlier
 * version claimed the cycle was self-healing through a root `preinstall` hook.
 * It is not -- the hook does not run early enough to prevent the EPERM, and the
 * pruning happens regardless.
 *
 * Only `src/index.ts` needs them. The parity suite imports `@portent/core` alone,
 * so tests run in CI without this.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
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

	// Copied, so every file is writable and pnpm can chmod the bin scripts it
	// insists on chmodding. A plain symlink into pi's read-only store made
	// `pnpm install` fail with EPERM, and a root preinstall hook that removed the
	// links first turned out not to run early enough to help reliably.
	cpSync(join(source, name), from, { recursive: true, dereference: true });

}

// The copies cannot resolve their own dependencies -- `pi-coding-agent` needs
// `chalk`, which lives in pi's root tree. Rather than copying the whole graph, put
// one symlink where Node's resolution walk will find it: from a copied package,
// Node checks `<pkg>/node_modules`, then `@earendil-works/node_modules`, and so
// on upward. A scope directory never holds a node_modules of its own, so this
// shadows nothing pnpm manages.
//
// Symlinking each copy's own node_modules does NOT work: pi's packages have
// partial package-local trees, `chalk` is not in them, and an existence check
// therefore skips the link that would have helped.
const scopeDeps = join(target, "@earendil-works", "node_modules");
if (existsSync(scopeDeps)) rmSync(scopeDeps, { recursive: true, force: true });
symlinkSync(source, scopeDeps, "dir");

console.log(`Linked ${NEEDED.length} pi packages from ${piRoot.replace(homedir(), "~")}`);

export default true;
