#!/usr/bin/env node
/**
 * Bundle the package for the browser, with no polyfills and no Node shims.
 *
 * The isomorphism test scans the source for Node-only APIs; this proves the
 * result of that scan by actually building it. A static scan can miss a
 * transitive import, and esbuild resolving `node:fs` to nothing is an
 * unambiguous failure.
 *
 * Checks each browser-facing entry point separately, because `.` being clean
 * says nothing about `./browser`.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Entry points that must bundle for a browser. `./node` is deliberately absent. */
const ENTRIES = [
	{ name: ".", path: "src/index.ts" },
	{ name: "./memory", path: "src/adapters/memory/index.ts" },
	{ name: "./browser", path: "src/adapters/browser/index.ts" },
	{ name: "./testing", path: "src/testing/index.ts" },
];

let esbuild;
try {
	esbuild = await import("esbuild");
} catch {
	console.error(
		"check:browser needs esbuild, which is not installed.\n" +
			"Run `pnpm install` at the repo root, then try again.\n" +
			"Failing rather than skipping: a browser check that silently passes is worse than none.",
	);
	process.exit(1);
}

let failed = false;

for (const entry of ENTRIES) {
	const entryPath = join(root, entry.path);
	if (!existsSync(entryPath)) {
		console.log(`  skip  ${entry.name.padEnd(10)} (${entry.path} does not exist yet)`);
		continue;
	}

	try {
		const result = await esbuild.build({
			entryPoints: [entryPath],
			bundle: true,
			write: false,
			format: "esm",
			platform: "browser",
			target: ["es2023", "chrome120", "firefox120", "safari17"],
			// No `external`, no `inject`, no `alias`: anything Node-only must fail
			// here rather than be quietly papered over.
			logLevel: "silent",
			metafile: true,
		});

		const bytes = result.outputFiles[0].contents.byteLength;
		const kb = (bytes / 1024).toFixed(1);
		console.log(`  ok    ${entry.name.padEnd(10)} ${kb} kB`);

		for (const warning of result.warnings) {
			console.log(`        warning: ${warning.text}`);
		}
	} catch (error) {
		failed = true;
		console.error(`  FAIL  ${entry.name.padEnd(10)} does not bundle for the browser`);
		for (const problem of error.errors ?? [{ text: error.message }]) {
			const where = problem.location ? ` (${problem.location.file}:${problem.location.line})` : "";
			console.error(`        ${problem.text}${where}`);
		}
	}
}

if (failed) {
	console.error(
		"\nA browser entry point pulled in something that only exists in Node.\n" +
			"Move it behind a port in src/ports and implement it in src/adapters/node.",
	);
	process.exit(1);
}

console.log("\nEvery browser-facing entry point bundles with no Node shims.");
