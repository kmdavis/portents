/**
 * `## Heading` sections in a markdown document, as an addressable structure.
 *
 * Every file this library writes is markdown a person can open and edit, which
 * means the library has to find and replace parts of a document it did not
 * write. Character sheets, campaign overviews and world notes all need the same
 * four operations, so they live here rather than three times over.
 *
 * Deliberately shallow: only `##` headings, only one level. A section is
 * everything up to the next `##`, which means a `###` subheading belongs to its
 * parent section and is left alone. That is the whole trick that lets a user keep
 * their own structure inside a section the tools rewrite around.
 *
 * Headings are matched case-insensitively, because someone typing `## notes` by
 * hand should not end up with two Notes sections.
 */

/** A `## Heading` and the lines beneath it. */
export interface Section {
	readonly heading: string;
	/** Line index of the heading itself. */
	readonly start: number;
	/** Line index one past the section's last line. */
	readonly end: number;
	/** The body, trimmed, without the heading. */
	readonly body: string;
}

const HEADING = /^##\s+(.*?)\s*$/;

/** Every `##` section, in document order. */
export function sections(text: string): Section[] {
	const lines = text.split("\n");
	const found: Array<{ heading: string; start: number }> = [];
	lines.forEach((line, index) => {
		const match = HEADING.exec(line);
		if (match) found.push({ heading: match[1], start: index });
	});
	return found.map((section, i) => {
		const end = i + 1 < found.length ? found[i + 1].start : lines.length;
		return {
			heading: section.heading,
			start: section.start,
			end,
			body: lines
				.slice(section.start + 1, end)
				.join("\n")
				.trim(),
		};
	});
}

export function sectionHeadings(text: string): string[] {
	return sections(text).map((section) => section.heading);
}

function find(text: string, heading: string): Section | undefined {
	const wanted = heading.toLowerCase();
	return sections(text).find((section) => section.heading.toLowerCase() === wanted);
}

/** A section's body, or `undefined` when there is no such heading. */
export function sectionBody(text: string, heading: string): string | undefined {
	return find(text, heading)?.body;
}

export function hasSection(text: string, heading: string): boolean {
	return find(text, heading) !== undefined;
}

function tidy(text: string): string {
	return `${text.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "")}\n`;
}

/**
 * Replace a section's body, appending the section when it is absent.
 *
 * Everything outside the section is preserved byte for byte, including the user's
 * own `###` subheadings inside it -- they go, because they are part of the body
 * being replaced.
 */
export function setSectionBody(text: string, heading: string, body: string): string {
	const section = find(text, heading);
	if (!section) {
		const trimmed = text.replace(/\n+$/, "");
		const separator = trimmed === "" ? "" : "\n\n";
		return tidy(`${trimmed}${separator}## ${heading}\n\n${body.trim()}`);
	}
	const lines = text.split("\n");
	return tidy(
		[...lines.slice(0, section.start + 1), "", body.trim(), "", ...lines.slice(section.end)].join("\n"),
	);
}

/**
 * Add to the end of a section.
 *
 * A body of exactly `_TBD_` is treated as a placeholder and replaced, since
 * appending to a stub leaves the stub in place, which reads as a bug.
 */
export function appendToSectionBody(text: string, heading: string, body: string): string {
	const existing = sectionBody(text, heading);
	const keep = existing !== undefined && existing !== "" && existing !== "_TBD_";
	return setSectionBody(text, heading, keep ? `${existing}\n${body.trim()}` : body.trim());
}

/** Remove a section and its body. A no-op when the heading is absent. */
export function removeSection(text: string, heading: string): string {
	const section = find(text, heading);
	if (!section) return text;
	const lines = text.split("\n");
	return tidy([...lines.slice(0, section.start), ...lines.slice(section.end)].join("\n"));
}

/**
 * The last `count` sections, newest last, headings included.
 *
 * For a journal, where the useful read is "what happened recently" rather than
 * the whole file.
 */
export function lastSections(text: string, count: number): string {
	const found = sections(text);
	if (found.length === 0 || count <= 0) return "";
	const lines = text.split("\n");
	return found
		.slice(-count)
		.map((section) => lines.slice(section.start, section.end).join("\n").trim())
		.join("\n\n");
}
