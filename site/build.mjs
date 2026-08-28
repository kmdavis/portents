#!/usr/bin/env node
/**
 * Build the docs site and demo into `../docs`, which GitHub Pages serves.
 *
 * Pages is configured as `main` branch, `/docs` path, so the output is committed.
 * That is the older of Pages' two mechanisms; the alternative is a Pages Actions
 * workflow that deploys an artifact and commits nothing. This repo uses `/docs`
 * because that is how the site was already configured, and switching is a settings
 * change plus a workflow rather than a code change.
 *
 * **No polyfills, no shims, deliberately.** A `node:` import anywhere in the graph
 * fails the build rather than silently producing a bundle that breaks at runtime, the
 * same guarantee `pnpm check:browser` gives the library.
 */

import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "docs");
const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static files first, so a bundle written afterwards is never clobbered.
cpSync(join(here, "public"), out, { recursive: true });

/**
 * Jekyll treats a leading underscore as private and would drop such files.
 *
 * Nothing here starts with one today, but the failure mode is a silent 404 on a file
 * that exists in the repo, which is unpleasant enough to pre-empt.
 */
writeFileSync(join(out, ".nojekyll"), "");

const entryPoints = readdirSync(join(here, "src"))
	.filter((name) => name === "demo.ts")
	.map((name) => join(here, "src", name));

const options = {
	entryPoints,
	bundle: true,
	format: "esm",
	platform: "browser",
	target: ["es2023"],
	conditions: ["development"],
	outdir: out,
	// Only in dev. docs/ is committed, so a 4.5 MB sourcemap would land in the repo on
	// every build, and the diff for a one-line prose change would be measured in megabytes.
	sourcemap: watch,
	minify: !watch,
	logLevel: "info",
};

if (entryPoints.length === 0) {
	console.log("no browser entry points yet — copied static files only");
} else if (watch) {
	const context = await esbuild.context(options);
	await context.watch();
	if (serve) {
		const { host, port } = await context.serve({ servedir: out, port: 8000 });
		console.log(`serving http://${host}:${port}`);
	}
} else {
	await esbuild.build(options);
}

const bytes = (dir) =>
	readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
		const full = join(dir, entry.name);
		return total + (entry.isDirectory() ? bytes(full) : statSync(full).size);
	}, 0);

if (!watch) console.log(`docs/ is ${(bytes(out) / 1024).toFixed(0)} kB`);
