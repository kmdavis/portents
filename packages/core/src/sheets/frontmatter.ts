/**
 * Frontmatter: the machine-readable half of a markdown document.
 *
 * This is **not a YAML parser.** It reads a deliberately small subset and
 * *rejects* everything else with a line number, rather than half-understanding
 * an anchor or a folded block and quietly producing the wrong character sheet.
 * What it emits is valid YAML, so Obsidian and friends can read a sheet; what it
 * accepts is much narrower than YAML, so its behaviour is predictable.
 *
 * The subset, in full:
 *
 * ```yaml
 * ---
 * name: Brannoc Thistlewood      # scalar
 * level: 3                       # number
 * dead: false                    # boolean
 * quote: "yes"                   # quoted, so it stays a string
 * conditions: [poisoned, prone]  # inline list of scalars
 * languages:                     # block list of scalars
 *   - Common
 *   - Elvish
 * status:                        # one level of nesting, scalars only
 *   hp: 22/26
 *   ac: 15
 * ---
 * ```
 *
 * Explicitly rejected: tabs for indentation, nesting more than one level deep,
 * lists of maps, anchors and aliases, `|` and `>` blocks, and documents whose
 * fences are missing. Each of those throws {@link FrontmatterError} naming the
 * line.
 *
 * Inline `#` comments are not supported, because `Longbow +7, 1d8+4 # 150 ft` is
 * a value someone will legitimately write. A `#` at the start of a line is a
 * comment; anywhere else it is text.
 */

export type Scalar = string | number | boolean;
export type FrontmatterValue = Scalar | Scalar[] | Record<string, Scalar>;
export type Frontmatter = Record<string, FrontmatterValue>;

export interface MarkdownDocument {
	readonly data: Frontmatter;
	/** Everything after the closing fence, with one leading blank line trimmed. */
	readonly body: string;
}

export class FrontmatterError extends Error {
	readonly line: number | undefined;
	constructor(message: string, line?: number) {
		super(line === undefined ? message : `Frontmatter line ${line}: ${message}`);
		this.name = "FrontmatterError";
		this.line = line;
	}
}

const FENCE = "---";

/**
 * Keys may contain spaces, because a character sheet needs `Temp HP`, `Hit Dice`
 * and `Death Saves` and those are the labels a player reads. YAML permits an
 * unquoted key with spaces, so this stays valid YAML.
 *
 * Non-greedy up to the first colon, so a value containing a colon still works:
 * `attack: Longbow: +7` has the key `attack`.
 */
const KEY = /^([A-Za-z_][A-Za-z0-9_ -]*?)\s*:(.*)$/;
const INDENTED_KEY = /^(\s+)([A-Za-z_][A-Za-z0-9_ -]*?)\s*:(.*)$/;
const LIST_ITEM = /^(\s*)-\s+(.*)$/;

/** Keys that can be written and read back without quoting. */
const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_ -]*$/;

function assertValidKey(key: string, where: string): void {
	if (!VALID_KEY.test(key) || key !== key.trim()) {
		throw new FrontmatterError(
			`invalid ${where} ${JSON.stringify(key)}; use letters, digits, spaces, _ and -, ` +
				"and no leading or trailing space",
		);
	}
}

/** Does the text look like it starts with frontmatter? */
export function hasFrontmatter(text: string): boolean {
	return /^---\r?\n/.test(text);
}

function parseScalar(raw: string, line: number): Scalar {
	const value = raw.trim();
	if (value === "") return "";

	// Quoted stays a string, which is how you write the literal text "3" or "true".
	if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
		const inner = value.slice(1, -1);
		return value.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
	}

	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "~") {
		throw new FrontmatterError("null is not supported; omit the key or use an empty string", line);
	}
	if (value.startsWith("|") || value.startsWith(">")) {
		throw new FrontmatterError("block scalars (| and >) are not supported", line);
	}
	if (value.startsWith("&") || value.startsWith("*")) {
		throw new FrontmatterError("anchors and aliases are not supported", line);
	}
	if (value.startsWith("{")) {
		throw new FrontmatterError("inline maps are not supported; use an indented block", line);
	}

	// A number only if the whole value is one. "22/26" and "1d8+3" stay strings.
	if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
	if (/^-?\d*\.\d+$/.test(value)) return Number.parseFloat(value);

	return value;
}

function parseInlineList(raw: string, line: number): Scalar[] {
	const inner = raw.trim().slice(1, -1).trim();
	if (inner === "") return [];
	if (inner.includes("[") || inner.includes("{")) {
		throw new FrontmatterError("nested lists and maps inside a list are not supported", line);
	}
	return splitTopLevel(inner).map((part) => parseScalar(part, line));
}

/** Split on commas that are not inside quotes. */
function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (const char of text) {
		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === ",") {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/**
 * Split a markdown document into frontmatter and body.
 *
 * A document with no frontmatter comes back with empty data and the whole text as
 * the body, so this is safe to call on anything.
 */
export function parseDocument(text: string): MarkdownDocument {
	if (text.includes("\r")) {
		// CRLF makes indentation and fence detection ambiguous, and a sheet that
		// parses on one machine and not another is the worst kind of bug.
		throw new FrontmatterError("carriage returns are not supported; save the file with Unix line endings");
	}
	if (!hasFrontmatter(text)) return { data: {}, body: text };

	const lines = text.split("\n");
	const closing = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
	if (closing === -1) {
		throw new FrontmatterError("opening --- has no matching closing ---", 1);
	}

	const data: Frontmatter = {};
	let currentKey: string | undefined;
	let currentMap: Record<string, Scalar> | undefined;
	let currentList: Scalar[] | undefined;
	let indentOfBlock: string | undefined;

	const closeBlock = () => {
		if (currentKey === undefined) return;
		if (currentMap) data[currentKey] = currentMap;
		else if (currentList) data[currentKey] = currentList;
		currentMap = undefined;
		currentList = undefined;
		indentOfBlock = undefined;
	};

	for (let i = 1; i < closing; i++) {
		const raw = lines[i];
		const lineNumber = i + 1;
		if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
		if (raw.includes("\t")) {
			throw new FrontmatterError("tabs are not allowed; indent with spaces", lineNumber);
		}

		const listMatch = raw.match(LIST_ITEM);
		if (listMatch && listMatch[1].length > 0) {
			if (currentKey === undefined) throw new FrontmatterError("list item with no key above it", lineNumber);
			if (currentMap) throw new FrontmatterError("cannot mix a list into an indented map", lineNumber);
			if (indentOfBlock === undefined) indentOfBlock = listMatch[1];
			else if (listMatch[1] !== indentOfBlock) {
				throw new FrontmatterError("inconsistent indentation in a list", lineNumber);
			}
			const item = listMatch[2].trim();
			// `- key: value` is a list of maps in YAML. Accepting it as the string
			// "key: value" would silently mean something different from what the
			// author wrote, so refuse it and say how to write it literally.
			if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:(\s|$)/.test(item)) {
				throw new FrontmatterError(
					"lists of maps are not supported; quote the item if the colon is part of the text",
					lineNumber,
				);
			}
			currentList ??= [];
			currentList.push(parseScalar(item, lineNumber));
			continue;
		}

		const indented = raw.match(INDENTED_KEY);
		if (indented) {
			if (currentKey === undefined) throw new FrontmatterError("indented key with no key above it", lineNumber);
			if (currentList) throw new FrontmatterError("cannot mix an indented map into a list", lineNumber);
			if (indentOfBlock === undefined) indentOfBlock = indented[1];
			else if (indented[1] !== indentOfBlock) {
				throw new FrontmatterError(
					"inconsistent indentation, or nesting deeper than one level, which is not supported",
					lineNumber,
				);
			}
			currentMap ??= {};
			const nestedValue = indented[3].trim();
			if (nestedValue === "") {
				throw new FrontmatterError("nesting deeper than one level is not supported", lineNumber);
			}
			if (nestedValue.startsWith("[")) {
				throw new FrontmatterError("a list inside an indented map is not supported", lineNumber);
			}
			currentMap[indented[2]] = parseScalar(nestedValue, lineNumber);
			continue;
		}

		const match = raw.match(KEY);
		if (!match) {
			throw new FrontmatterError(`cannot parse ${JSON.stringify(raw)}; expected "key: value"`, lineNumber);
		}

		closeBlock();
		currentKey = match[1];
		if (currentKey in data) {
			throw new FrontmatterError(`duplicate key ${JSON.stringify(currentKey)}`, lineNumber);
		}

		const rest = match[2].trim();
		if (rest === "") {
			// A block follows: either an indented map or a list.
			data[currentKey] = {};
			continue;
		}
		if (rest.startsWith("[")) {
			if (!rest.endsWith("]")) throw new FrontmatterError("unclosed inline list", lineNumber);
			data[currentKey] = parseInlineList(rest, lineNumber);
			currentKey = undefined;
			continue;
		}
		data[currentKey] = parseScalar(rest, lineNumber);
		currentKey = undefined;
	}
	closeBlock();

	const body = lines.slice(closing + 1).join("\n");
	return { data, body: body.startsWith("\n") ? body.slice(1) : body };
}

/** Whether a string has to be quoted to survive a round trip. */
function needsQuoting(value: string): boolean {
	if (value === "") return true;
	if (value !== value.trim()) return true;
	if (/^(true|false|null|~)$/.test(value)) return true;
	if (/^-?\d+$/.test(value) || /^-?\d*\.\d+$/.test(value)) return true;
	// Leading characters that mean something structural in YAML.
	if (/^[[\]{}>|&*#'"%@`,?:-]/.test(value)) return true;
	if (value.includes(": ") || value.endsWith(":")) return true;
	if (value.includes("\n")) return true;
	return false;
}

function emitScalar(value: Scalar): string {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new FrontmatterError(`cannot write a non-finite number: ${value}`);
		return String(value);
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	if (value.includes("\n")) {
		throw new FrontmatterError(`cannot write a multi-line value: ${JSON.stringify(value)}`);
	}
	return needsQuoting(value) ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value;
}

/** Write frontmatter as valid YAML. Keys keep their insertion order. */
export function emitFrontmatter(data: Frontmatter): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(data)) {
		assertValidKey(key, "key");
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
				continue;
			}
			lines.push(`${key}:`);
			for (const item of value) lines.push(`  - ${emitScalar(item)}`);
			continue;
		}
		if (value !== null && typeof value === "object") {
			const entries = Object.entries(value);
			if (entries.length === 0) {
				// A bare key parses back to an empty map. Emitting `{}` would not,
				// because inline maps are deliberately rejected on the way in.
				lines.push(`${key}:`);
				continue;
			}
			lines.push(`${key}:`);
			for (const [nestedKey, nestedValue] of entries) {
				// Nested keys were once unvalidated, which let a sheet be written with a
				// key that could not be read back.
				assertValidKey(nestedKey, `nested key under ${JSON.stringify(key)}`);
				lines.push(`  ${nestedKey}: ${emitScalar(nestedValue)}`);
			}
			continue;
		}
		lines.push(`${key}: ${emitScalar(value)}`);
	}
	return lines.join("\n");
}

/** Recombine frontmatter and body into a document. */
export function stringifyDocument(doc: MarkdownDocument): string {
	const data = emitFrontmatter(doc.data);
	const body = doc.body.replace(/^\n+/, "");
	if (data === "") return body.endsWith("\n") || body === "" ? body : `${body}\n`;
	const out = `${FENCE}\n${data}\n${FENCE}\n\n${body}`;
	return out.endsWith("\n") ? out : `${out}\n`;
}
