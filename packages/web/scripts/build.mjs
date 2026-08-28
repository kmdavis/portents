#!/usr/bin/env node
/**
 * Bundle the browser app.
 *
 * No polyfills and no platform shims, deliberately: if a `node:` import ever
 * reaches this bundle the build fails, which is the same guarantee
 * `check:browser` gives the library.
 */

import { context, build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");
await mkdir(outdir, { recursive: true });
await cp(join(root, "public"), outdir, { recursive: true });

/** @type {import("esbuild").BuildOptions} */
const options = {
	entryPoints: [join(root, "src/main.ts")],
	bundle: true,
	format: "esm",
	target: ["es2023"],
	platform: "browser",
	// Empty rather than a shim: a Node builtin reaching the browser is a bug to
	// surface, not a thing to paper over.
	external: [],
	conditions: ["development"],
	outfile: join(outdir, "app.js"),
	sourcemap: true,
	minify: !process.argv.includes("--watch"),
	logLevel: "info",
};

if (process.argv.includes("--watch")) {
	const ctx = await context(options);
	await ctx.watch();
	const { host, port } = await ctx.serve({ servedir: outdir });
	console.log(`\n  Portent running at http://${host}:${port}\n`);
} else {
	const result = await build({ ...options, metafile: true });
	const bytes = Object.values(result.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
	console.log(`\n  Bundled to dist/app.js — ${(bytes / 1024).toFixed(1)} kB total\n`);
}
