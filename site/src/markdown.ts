/**
 * Markdown from the GM, rendered safely.
 *
 * Split out of the DOM layer so the sanitiser policy -- which is a security boundary,
 * not styling -- can be tested. `DOMPurify` needs a DOM, so the tests supply one.
 *
 * **The GM's output is data, not instruction.** It arrives from a model that was given
 * prose written by whoever set up the campaign, and a model can be asked for a script
 * tag as easily as for a paragraph. Rendering it as trusted HTML would make every
 * campaign file a stored-XSS vector on the demo page.
 */

/**
 * What is allowed through.
 *
 * Enough for prose, lists, a table and a code block, which is what the guidance asks
 * the GM to produce. No `script`, no `iframe`, no `style`, no event handlers, and no
 * `href` scheme other than http(s) -- `javascript:` and `data:` are both executable in
 * a link.
 */
export const SANITISE_CONFIG = {
	ALLOWED_TAGS: [
		"p", "br", "hr", "strong", "em", "del", "code", "pre",
		"ul", "ol", "li", "blockquote",
		"h1", "h2", "h3", "h4", "h5", "h6",
		"table", "thead", "tbody", "tr", "th", "td", "a",
	],
	ALLOWED_ATTR: ["href", "title"],
	ALLOWED_URI_REGEXP: /^https?:\/\//i,
} as const;

/** Anything that can sanitise a string. Narrowed so a test can pass its own. */
export interface Sanitiser {
	sanitize(dirty: string, config: typeof SANITISE_CONFIG): string;
}

/** Anything that can turn markdown into HTML. */
export interface MarkdownParser {
	parse(markdown: string, options: { async: false; gfm: true; breaks: false }): string;
}

/**
 * Markdown to safe HTML.
 *
 * Both dependencies are injected so this is testable in Node, where there is no DOM
 * for DOMPurify to attach to unless one is supplied.
 */
export function renderMarkdown(markdown: string, parser: MarkdownParser, sanitiser: Sanitiser): string {
	const html = parser.parse(markdown, { async: false, gfm: true, breaks: false });
	return sanitiser.sanitize(html, SANITISE_CONFIG);
}
