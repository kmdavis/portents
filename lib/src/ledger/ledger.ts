/**
 * The roll ledger: an append-only record of everything the dice decided.
 *
 * This is what makes solo play honest. A GM that invents a die result is
 * indistinguishable from one that rolls, unless the roll leaves a trace someone
 * can look up afterwards. So every roll, draw, table result and oracle answer
 * gets an id, the id goes in the transcript, and the id resolves to a stored
 * entry with the original numbers.
 *
 * ## Ids
 *
 * `{kind}-{sequence}{writer?}` — `h-42`, `d-43`, `o-44`.
 *
 * The sequence is a plain counter, unique within one campaign's ledger. There is
 * no randomness in it, so there is nothing to collide: four hex digits would have
 * given even odds of a duplicate at only ~301 rolls, and a duplicate is worse
 * here than in an ordinary log, because auditing a cited id would return the
 * wrong entry and quietly defeat the one guarantee the ledger exists to provide.
 *
 * The counter is derived from the log itself rather than kept in a state file, so
 * a lost, stale or restored state file cannot restart it and reuse numbers.
 *
 * ### The kind prefix is a checksum, not decoration
 *
 * The kind is stored in the entry *and* encoded in the id. That redundancy is
 * deliberate: lookup goes by the number, so a citation with the wrong prefix
 * still resolves, and {@link Ledger.verify} reports the mismatch.
 *
 * It catches a specific failure: a model inventing a plausible-looking citation.
 * A made-up `h-89` does not merely fail — it resolves to a table roll and says
 * so.
 *
 * ### The writer suffix is reserved, not used
 *
 * Sequential ids are safe exactly when writes have a single serialisation point.
 * One process has that; so does a server that owns the ledger for several
 * players taking turns. Clients that write locally and sync later do not, and
 * that case breaks any coordination-free scheme except randomness.
 *
 * So the grammar reserves a trailing writer letter, omitted for the sole writer.
 * Every id today is `h-42`. If concurrent writers ever arrive, the second gets
 * `h-42b` and `h-42` is understood as `h-42a`. Nothing existing changes and the
 * parser already accepts it, so multiplayer costs nothing until it exists.
 */

import type { Clock } from "../ports/clock.ts";
import type { Storage, StorageKey } from "../ports/storage.ts";

/**
 * Every kind of thing the ledger records, with the letter that starts its ids.
 *
 * One table, so a prefix clash is a single edit away from being caught — and
 * `ledger.test.ts` rejects duplicates mechanically, because an earlier draft of
 * this list had `d-` for both damage and death saves.
 */
export const EVENT_KINDS = [
	// Rolls the player watches land on their own character. Cite these to them.
	{ prefix: "h", kind: "hit", label: "attack roll" },
	{ prefix: "d", kind: "damage", label: "damage roll" },
	{ prefix: "s", kind: "skill", label: "ability or skill check" },
	{ prefix: "v", kind: "save", label: "saving throw" },
	{ prefix: "k", kind: "death-save", label: "death save" },
	{ prefix: "i", kind: "initiative", label: "initiative roll" },
	{ prefix: "r", kind: "roll", label: "roll" },
	// Things the world decided. Narrate the effect, never the mechanism.
	{ prefix: "c", kind: "card", label: "card draw" },
	{ prefix: "t", kind: "table", label: "table roll" },
	{ prefix: "o", kind: "oracle", label: "oracle answer" },
	{ prefix: "m", kind: "map", label: "map seed" },
	{ prefix: "z", kind: "shuffle", label: "deck shuffle" },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]["kind"];

/**
 * Kinds whose results must not be shown to the player.
 *
 * A player told the scene was "skewed" cannot un-know it, and quoting a table
 * entry hands them the GM's notes. The flag lives on the entry so the rule is
 * mechanical rather than only written down in a skill file.
 */
export const SECRET_KINDS: readonly EventKind[] = ["card", "table", "oracle", "map", "shuffle"];

type KindEntry = (typeof EVENT_KINDS)[number];

const BY_KIND = new Map<string, KindEntry>(EVENT_KINDS.map((entry) => [entry.kind, entry]));
const BY_PREFIX = new Map<string, KindEntry>(EVENT_KINDS.map((entry) => [entry.prefix, entry]));

/** `h-42`, `d-43b`. */
const ID_PATTERN = /^([a-z])-(\d+)([a-z])?$/;

export function isEventKind(value: string): value is EventKind {
	return BY_KIND.has(value);
}

export function kindLabel(kind: EventKind): string {
	return BY_KIND.get(kind)?.label ?? kind;
}

export function isSecretKind(kind: EventKind): boolean {
	return SECRET_KINDS.includes(kind);
}

export interface LedgerEntry {
	readonly id: string;
	readonly seq: number;
	readonly kind: EventKind;
	/** Absent for the sole writer. See the module note on `h-42b`. */
	readonly writer?: string;
	/** ISO 8601. */
	readonly at: string;
	readonly actor?: string;
	readonly reason?: string;
	/** What was asked for: a dice expression, a table id, a deck id. */
	readonly request?: string;
	/** What came back, rendered for a human reading the file. */
	readonly result: string;
	/** The numeric total, when there is one. */
	readonly total?: number;
	readonly dc?: number;
	readonly outcome?: "success" | "failure";
	/** Anything kind-specific: individual dice, the card drawn, the seed. */
	readonly data?: Record<string, unknown>;
}

export class LedgerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LedgerError";
	}
}

// ── Ids ──────────────────────────────────────────────────────────────────────

export interface ParsedId {
	readonly kind: EventKind;
	readonly seq: number;
	readonly writer?: string;
}

export function formatId(kind: EventKind, seq: number, writer?: string): string {
	const entry = BY_KIND.get(kind);
	if (!entry) throw new LedgerError(`unknown event kind ${JSON.stringify(kind)}`);
	if (!Number.isSafeInteger(seq) || seq < 1) {
		throw new LedgerError(`sequence must be a positive integer, got ${seq}`);
	}
	if (writer !== undefined && !/^[a-z]$/.test(writer)) {
		throw new LedgerError(`writer must be a single lowercase letter, got ${JSON.stringify(writer)}`);
	}
	return `${entry.prefix}-${seq}${writer ?? ""}`;
}

/** `undefined` when the text is not an id at all. */
export function parseId(id: string): ParsedId | undefined {
	const match = ID_PATTERN.exec(id.trim());
	if (!match) return undefined;
	const kind = BY_PREFIX.get(match[1])?.kind;
	if (!kind) return undefined;
	return { kind, seq: Number.parseInt(match[2], 10), writer: match[3] };
}

/** The sequence in an id, whatever its prefix. Lookup key, so a wrong prefix still resolves. */
export function sequenceOf(id: string): number | undefined {
	const match = ID_PATTERN.exec(id.trim());
	return match ? Number.parseInt(match[2], 10) : undefined;
}

// ── Serialising ──────────────────────────────────────────────────────────────

/** One JSON object per line, so the file is append-only and survives a partial write. */
export function serialiseEntry(entry: LedgerEntry): string {
	return `${JSON.stringify(entry)}\n`;
}

/**
 * Read a JSONL ledger.
 *
 * A corrupt line is skipped rather than thrown, and reported by
 * {@link ledgerProblems}: one bad line must not make the rest unauditable.
 */
export function parseLedger(text: string): { entries: LedgerEntry[]; badLines: number[] } {
	const entries: LedgerEntry[] = [];
	const badLines: number[] = [];
	text.split("\n").forEach((line, index) => {
		if (line.trim() === "") return;
		try {
			const parsed = JSON.parse(line) as LedgerEntry;
			if (typeof parsed?.id !== "string" || typeof parsed?.seq !== "number" || !isEventKind(parsed?.kind)) {
				badLines.push(index + 1);
				return;
			}
			entries.push(parsed);
		} catch {
			badLines.push(index + 1);
		}
	});
	return { entries, badLines };
}

/**
 * The next sequence number, derived from the entries themselves.
 *
 * Highest seen plus one, rather than a count, so a hand-deleted line cannot make
 * the next roll reuse a number that is already cited somewhere.
 */
export function nextSequence(entries: readonly LedgerEntry[]): number {
	return entries.reduce((highest, entry) => Math.max(highest, entry.seq), 0) + 1;
}

// ── Verifying ────────────────────────────────────────────────────────────────

export type VerifyResult =
	| { readonly status: "found"; readonly entry: LedgerEntry; readonly note?: string }
	| { readonly status: "not-an-id" }
	| { readonly status: "missing"; readonly seq: number; readonly highest: number }
	| { readonly status: "ambiguous"; readonly seq: number; readonly entries: readonly LedgerEntry[] };

/**
 * Look an id up.
 *
 * Matching is by sequence, so a citation with the wrong prefix still finds its
 * entry and comes back with a note saying the kind was misstated. That is the
 * useful answer: it distinguishes "this roll never happened" from "you labelled
 * a real roll wrongly", and the first is the one worth worrying about.
 *
 * A duplicate sequence reports `ambiguous` rather than returning the first match.
 * Silently picking one is how a ledger lies to the person auditing it.
 */
export function verifyId(entries: readonly LedgerEntry[], id: string): VerifyResult {
	const parsed = parseId(id);
	if (!parsed) return { status: "not-an-id" };

	const matches = entries.filter(
		(entry) => entry.seq === parsed.seq && (entry.writer ?? "") === (parsed.writer ?? ""),
	);
	if (matches.length === 0) {
		return { status: "missing", seq: parsed.seq, highest: nextSequence(entries) - 1 };
	}
	if (matches.length > 1) return { status: "ambiguous", seq: parsed.seq, entries: matches };

	const entry = matches[0];
	if (entry.kind !== parsed.kind) {
		return {
			status: "found",
			entry,
			note:
				`cited as ${kindLabel(parsed.kind)} but recorded as ${kindLabel(entry.kind)}; ` +
				`the real id is ${entry.id}`,
		};
	}
	return { status: "found", entry };
}

/** A sentence about a lookup, for a tool result or a CLI. */
export function describeVerifyResult(id: string, result: VerifyResult): string {
	switch (result.status) {
		case "not-an-id":
			return `${JSON.stringify(id)} is not a ledger id. Ids look like "h-42".`;
		case "missing":
			return `No entry ${id}. The ledger goes up to ${result.highest}, so this was never rolled.`;
		case "ambiguous":
			return (
				`${id} is ambiguous: ${result.entries.length} entries share sequence ${result.seq}. ` +
				"The ledger has been edited or merged; nothing is renumbered, so cite by timestamp instead."
			);
		case "found": {
			const { entry, note } = result;
			const parts = [`${entry.id}: ${kindLabel(entry.kind)}`];
			if (entry.actor) parts.push(`by ${entry.actor}`);
			if (entry.reason) parts.push(`for ${entry.reason}`);
			parts.push(`— ${entry.result}`);
			if (entry.dc !== undefined && entry.outcome) parts.push(`(DC ${entry.dc}: ${entry.outcome})`);
			parts.push(`at ${entry.at}`);
			return note ? `${parts.join(" ")}. Warning: ${note}.` : parts.join(" ");
		}
	}
}

/**
 * Everything wrong with a ledger. Empty means it is trustworthy.
 *
 * Never repaired automatically. Ids are cited in journal prose and in a model's
 * context, so renumbering would break references that are already written down;
 * a fix appends a note instead.
 */
export function ledgerProblems(entries: readonly LedgerEntry[], badLines: readonly number[] = []): string[] {
	const problems: string[] = [];
	for (const line of badLines) problems.push(`line ${line} is not a valid entry and was skipped`);

	const bySeq = new Map<string, LedgerEntry[]>();
	for (const entry of entries) {
		const key = `${entry.seq}${entry.writer ?? ""}`;
		bySeq.set(key, [...(bySeq.get(key) ?? []), entry]);
	}
	for (const [key, group] of bySeq) {
		if (group.length > 1) {
			problems.push(
				`${group.length} entries share sequence ${key} (${group.map((e) => e.id).join(", ")}); ` +
					"citations of it are ambiguous",
			);
		}
	}

	for (const entry of entries) {
		const parsed = parseId(entry.id);
		if (!parsed) {
			problems.push(`entry ${entry.seq} has an unparseable id ${JSON.stringify(entry.id)}`);
			continue;
		}
		if (parsed.kind !== entry.kind) {
			problems.push(`entry ${entry.id} has a ${parsed.kind} prefix but records a ${entry.kind}`);
		}
		if (parsed.seq !== entry.seq) {
			problems.push(`entry ${entry.id} disagrees with its own sequence ${entry.seq}`);
		}
	}

	return problems;
}

// ── The ledger itself ────────────────────────────────────────────────────────

export interface LedgerOptions {
	readonly storage: Storage;
	readonly key: StorageKey;
	readonly clock: Clock;
	/** Set only when more than one writer shares a campaign. See the module note. */
	readonly writer?: string;
}

export interface AppendInput {
	readonly kind: EventKind;
	readonly result: string;
	readonly actor?: string;
	readonly reason?: string;
	readonly request?: string;
	readonly total?: number;
	readonly dc?: number;
	readonly outcome?: "success" | "failure";
	readonly data?: Record<string, unknown>;
}

/**
 * An open ledger for one campaign.
 *
 * Entries are cached in memory after {@link open}, so appending does not re-read
 * the file. That is safe under the single-writer assumption the Storage port
 * documents, and it is the assumption that lets the sequence be a plain counter.
 */
export class Ledger {
	#entries: LedgerEntry[] = [];
	#badLines: number[] = [];
	#next = 1;
	readonly #options: LedgerOptions;

	private constructor(options: LedgerOptions) {
		this.#options = options;
	}

	static async open(options: LedgerOptions): Promise<Ledger> {
		const ledger = new Ledger(options);
		const text = await options.storage.read(options.key);
		if (text !== undefined) {
			const { entries, badLines } = parseLedger(text);
			ledger.#entries = entries;
			ledger.#badLines = badLines;
		}
		ledger.#next = nextSequence(ledger.#entries);
		return ledger;
	}

	get entries(): readonly LedgerEntry[] {
		return this.#entries;
	}

	/** What the next id will be, without consuming it. */
	peekId(kind: EventKind): string {
		return formatId(kind, this.#next, this.#options.writer);
	}

	async append(input: AppendInput): Promise<LedgerEntry> {
		if (!isEventKind(input.kind)) throw new LedgerError(`unknown event kind ${JSON.stringify(input.kind)}`);
		const seq = this.#next;
		const entry: LedgerEntry = {
			id: formatId(input.kind, seq, this.#options.writer),
			seq,
			kind: input.kind,
			...(this.#options.writer ? { writer: this.#options.writer } : {}),
			at: this.#options.clock.iso(),
			...(input.actor ? { actor: input.actor } : {}),
			...(input.reason ? { reason: input.reason } : {}),
			...(input.request ? { request: input.request } : {}),
			result: input.result,
			...(input.total === undefined ? {} : { total: input.total }),
			...(input.dc === undefined ? {} : { dc: input.dc }),
			...(input.outcome ? { outcome: input.outcome } : {}),
			...(input.data ? { data: input.data } : {}),
		};

		// Written before the counter moves, so a failed write cannot burn a number.
		await this.#options.storage.append(this.#options.key, serialiseEntry(entry));
		this.#entries.push(entry);
		this.#next = seq + 1;
		return entry;
	}

	verify(id: string): VerifyResult {
		return verifyId(this.#entries, id);
	}

	describe(id: string): string {
		return describeVerifyResult(id, this.verify(id));
	}

	problems(): string[] {
		return ledgerProblems(this.#entries, this.#badLines);
	}

	/** The most recent entries, newest last. For a resume brief. */
	recent(count = 10): readonly LedgerEntry[] {
		return this.#entries.slice(-count);
	}

	byKind(kind: EventKind): readonly LedgerEntry[] {
		return this.#entries.filter((entry) => entry.kind === kind);
	}
}
