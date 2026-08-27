#!/usr/bin/env node
/**
 * Bundle the library and content for the manual check page.
 *
 * Output is an IIFE exposing a `Portent` global rather than an ES module,
 * because Chrome refuses cross-origin module imports over `file://` and the
 * whole point of this page is being able to double-click it.
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

mkdirSync(join(here, "dist"), { recursive: true });

const result = await esbuild.build({
	stdin: {
		contents: `
			export * from "@portent/core";
			export * from "@portent/core/browser";
			export { dungeonTiles } from "@portent/content";
		`,
		resolveDir: root,
		sourcefile: "manual-entry.ts",
		loader: "ts",
	},
	bundle: true,
	format: "iife",
	globalName: "Portent",
	platform: "browser",
	target: ["es2023", "chrome120", "firefox120", "safari17"],
	// Resolve the workspace packages to source, so the page reflects the working
	// tree without needing a build of lib and content first.
	conditions: ["development"],
	outfile: join(here, "dist", "portent.js"),
	sourcemap: "inline",
	logLevel: "info",
	metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`\nmanual/dist/portent.js — ${(bytes / 1024).toFixed(1)} kB`);
console.log(`Open manual/index.html in a browser.`);
