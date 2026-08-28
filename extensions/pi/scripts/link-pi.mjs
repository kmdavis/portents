#!/usr/bin/env node
/**
 * Symlink pi's own packages into this one's node_modules.
 *
 * `@earendil-works/pi-coding-agent` and friends are not on a registry this
 * machine can reach, and npm is administratively blocked, so the extension's
 * types come from an installed pi instead. Same approach the prototype uses.
 *
 * Only `src/index.ts` needs them. The parity suite imports `@portent/core`
 * alone, so tests run in CI without this.
 */

import { existsSync, mkdirSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../node_modules");

function findPi() {
	if (process.env.PI_HOME) return process.env.PI_HOME;
	const pkgDir = join(homedir(), ".pi/pkg");
	if (!existsSync(pkgDir)) return undefined;
	const versions = readdirSync(pkgDir)
		.filter((name) => name.startsWith("pi-"))
		.sort()
		.reverse();
	for (const version of versions) {
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
mkdirSync(join(target, "@earendil-works"), { recursive: true });

let linked = 0;
for (const scope of ["@earendil-works"]) {
	for (const name of readdirSync(join(source, scope))) {
		const from = join(target, scope, name);
		if (existsSync(from)) rmSync(from, { recursive: true, force: true });
		symlinkSync(join(source, scope, name), from, "dir");
		linked++;
	}
}
for (const bare of ["typebox"]) {
	if (!existsSync(join(source, bare))) continue;
	const from = join(target, bare);
	if (existsSync(from)) rmSync(from, { recursive: true, force: true });
	symlinkSync(join(source, bare), from, "dir");
	linked++;
}

console.log(`Linked ${linked} packages from ${piRoot.replace(homedir(), "~")}`);

export default true;
