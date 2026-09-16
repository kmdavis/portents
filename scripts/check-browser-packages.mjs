#!/usr/bin/env node
/** Bundle newer browser-facing package entries that do not own core's detailed check. */

import { build } from "esbuild";

const entries = [
	["@portents/room", "packages/room/src/index.ts"],
	["@portents/setting-greywater", "packages/setting-greywater/src/index.ts"],
];

let failed = false;
for (const [name, path] of entries) {
	try {
		const result = await build({
			entryPoints: [path],
			bundle: true,
			write: false,
			format: "esm",
			platform: "browser",
			target: ["es2023", "chrome120", "firefox120", "safari17"],
			conditions: ["development"],
			logLevel: "silent",
		});
		console.log(`  ok    ${name.padEnd(30)} ${(result.outputFiles[0].contents.byteLength / 1024).toFixed(1)} kB`);
	} catch (error) {
		failed = true;
		console.error(`  FAIL  ${name}`);
		for (const problem of error.errors ?? [{ text: error instanceof Error ? error.message : String(error) }]) {
			console.error(`        ${problem.text}`);
		}
	}
}

if (failed) process.exitCode = 1;
