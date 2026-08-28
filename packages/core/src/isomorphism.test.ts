/**
 * The guard that backs the "runs in the browser" claim.
 *
 * Inspection is not proof and neither is intent: it only takes one convenient
 * `import { readFileSync } from "node:fs"` to make the core unbundleable, and
 * that mistake is invisible until someone tries to ship it. So this test reads
 * every source file and fails on anything that would only work in Node.
 *
 * The companion is `scripts/check-browser.mjs`, which actually bundles the
 * package for the browser with no polyfills. Two mechanisms, because a static
 * scan can miss a transitive import and a bundler can miss a runtime global.
 *
 * The rule is symmetrical, which is easy to forget: the core must run in Node
 * *and* in a browser, so it may use neither `node:` modules nor DOM globals.
 * `document.createElement` breaks Node exactly as `node:fs` breaks the browser.
 *
 * `src/adapters/node/**` and `src/adapters/browser/**` are exempt: they are the
 * platform adapters, reached only via the `@portents/core/node` and
 * `@portents/core/browser` exports, and being platform-specific is their job.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SRC = dirname(fileURLToPath(import.meta.url));

/** Files allowed to be platform-specific, relative to src/. */
const PLATFORM_EXEMPT = ["adapters/browser/", "adapters/node/"];

/** Test files may use anything; they only ever run under Node. */
function isTest(path: string): boolean {
	return path.endsWith(".test.ts");
}

function sourceFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".ts")) {
				out.push(full);
			}
		}
	};
	walk(SRC);
	return out.sort();
}

/**
 * Blank out comments, preserving line numbers and overall length.
 *
 * Needed because the docs legitimately mention the very things this test bans:
 * `ports/index.ts` explains the no-`node:`-imports rule, and
 * `testing/storage-conformance.ts` shows an example that imports `node:test`.
 * Every check must use this, or one of them reports a docstring as a violation —
 * which is exactly what happened when only some of them did.
 */
function stripComments(text: string): string {
	const blankRun = (match: string) => match.replace(/[^\n]/g, " ");
	return text
		.replace(/\/\*[\s\S]*?\*\//g, blankRun) // block and JSDoc comments
		.replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => lead + blankRun(match.slice(lead.length)));
}

interface SourceFile {
	readonly rel: string;
	readonly text: string;
	/** `text` with comments blanked out. Scan this, report from `text`. */
	readonly code: string;
}

function load(path: string): SourceFile {
	const text = readFileSync(path, "utf8");
	return { rel: relative(SRC, path).replaceAll("\\", "/"), text, code: stripComments(text) };
}

/** Every non-test source file, platform adapters included. */
function allFiles(): SourceFile[] {
	return sourceFiles()
		.map(load)
		.filter(({ rel }) => !isTest(rel));
}

/** Files that must work unchanged in a browser. */
function isomorphicFiles(): SourceFile[] {
	return allFiles().filter(({ rel }) => !PLATFORM_EXEMPT.some((prefix) => rel.startsWith(prefix)));
}

const BANNED: Array<{ pattern: RegExp; what: string; instead: string }> = [
	{
		pattern: /\bfrom\s+["']node:/,
		what: 'an import from "node:…"',
		instead: "move it behind a port in src/ports and implement it in src/adapters/node",
	},
	{
		pattern: /\brequire\s*\(/,
		what: "a CommonJS require()",
		instead: "use a static ESM import",
	},
	{
		pattern: /\b__dirname\b|\b__filename\b/,
		what: "a CommonJS path global",
		instead: "use import.meta.url, or better, do not touch the filesystem here",
	},
	{
		pattern: /\bprocess\s*\.\s*(env|cwd|platform|argv|pid|exit|version)/,
		what: "a use of process",
		instead: "take the value as a parameter, or read it in the adapter and pass it in",
	},
	{
		pattern: /\bBuffer\s*\./,
		what: "a use of Buffer",
		instead: "use Uint8Array and TextEncoder/TextDecoder",
	},
	{
		pattern: /\bfrom\s+["'](fs|path|os|crypto|url|child_process)["']/,
		what: "a bare Node builtin import",
		instead: "same as node: — put it behind a port",
	},
	// The other half of the rule. These break Node just as node: breaks the browser.
	{
		pattern: /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location)\s*\./,
		what: "a DOM global",
		instead: "put it in src/adapters/browser and reach it through a port",
	},
	{
		pattern: /\b(HTMLElement|Element|Node|CanvasRenderingContext2D)\b\s*[;,)>]/,
		what: "a DOM type",
		instead: "return a string or a plain data structure and let the caller touch the DOM",
	},
];

describe("the core is isomorphic", () => {
	const files = isomorphicFiles();

	it("finds source files to check", () => {
		assert.ok(files.length >= 8, `only found ${files.length} isomorphic source files; the walker is probably broken`);
	});

	for (const { rel, text, code } of files) {
		it(`${rel} uses no Node-only API`, () => {
			const sourceLines = text.split("\n");
			const codeLines = code.split("\n");
			for (const { pattern, what, instead } of BANNED) {
				for (const [i, line] of codeLines.entries()) {
					if (pattern.test(line)) {
						assert.fail(
							`${rel}:${i + 1} contains ${what}, which does not exist in a browser.\n` +
								`  ${sourceLines[i].trim()}\n` +
								`  Instead: ${instead}`,
						);
					}
				}
			}
		});
	}

	it("keeps every node: import inside the Node adapter", () => {
		// The inverse check: prove the exemption is where we think it is, so nobody
		// quietly widens PLATFORM_EXEMPT without a test noticing.
		const offenders = allFiles()
			.filter(({ code }) => /\bfrom\s+["']node:/.test(code))
			.map(({ rel }) => rel);

		for (const rel of offenders) {
			assert.ok(
				rel.startsWith("adapters/node/"),
				`${rel} imports a node: module but is not part of the Node adapter`,
			);
		}
		// Listed explicitly so adding a Node-only file is a deliberate act with a
		// test to update, rather than something that slips in unnoticed.
		assert.deepEqual(
			offenders,
			["adapters/node/home.ts", "adapters/node/index.ts"],
			"the set of Node-only files changed",
		);
	});

	it("keeps every DOM reference inside the browser adapter", () => {
		const offenders = allFiles()
			.filter(({ code }) => /\b(document|window|localStorage|indexedDB|navigator)\s*\./.test(code))
			.map(({ rel }) => rel);
		for (const rel of offenders) {
			assert.ok(
				rel.startsWith("adapters/browser/"),
				`${rel} touches a DOM global but is not part of the browser adapter`,
			);
		}
	});

	it("exempts only the two platform adapters", () => {
		assert.deepEqual(
			PLATFORM_EXEMPT,
			["adapters/browser/", "adapters/node/"],
			"the exemption list changed; that needs justifying",
		);
	});

	it("reaches for a global only where a platform is being detected", () => {
		// globalThis.crypto and globalThis.indexedDB are web standards and fine in
		// both targets, but they should be read at a boundary and passed inwards, so
		// that engine code can always be handed a deterministic substitute in a test.
		const readers = isomorphicFiles()
			.filter(({ code }) => /globalThis\s*(\.|\[|\s+as)/.test(code))
			.map(({ rel }) => rel)
			.sort();
		assert.deepEqual(
			readers,
			["ports/random.ts"],
			"a global is being read somewhere new; keep that at an adapter or port boundary",
		);
	});
});

describe("the guard itself", () => {
	// It has already produced one useful false positive: a local variable named
	// `document`. Shadowing a browser global in a library that must run in
	// browsers is worth flagging, so tripping on it is the intended behaviour and
	// the fix is to rename the local.
	it("bans DOM globals by name, so a shadowing local trips it deliberately", () => {
		const domRule = BANNED.find((rule) => rule.what === "a DOM global");
		assert.ok(domRule, "the DOM rule went missing");
		assert.ok(domRule.pattern.test("const data = document.data;"));
		assert.ok(domRule.pattern.test("window.location"));
		// A word merely containing the name is fine.
		assert.ok(!domRule.pattern.test("const documents = [];"));
		assert.ok(!domRule.pattern.test("stringifyDocument(doc)"));
	});

	it("bans node: imports by shape, not by module name", () => {
		const nodeRule = BANNED.find((rule) => rule.what === 'an import from "node:…"');
		assert.ok(nodeRule);
		assert.ok(nodeRule.pattern.test('import { readFile } from "node:fs";'));
		assert.ok(!nodeRule.pattern.test('import { parseTile } from "./tile.ts";'));
	});
});
