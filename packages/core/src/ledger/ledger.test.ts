import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MemoryStorage } from "../adapters/memory/index.ts";
import { tickingClock } from "../ports/clock.ts";
import {
	describeVerifyResult,
	EVENT_KINDS,
	type EventKind,
	formatId,
	isEventKind,
	isSecretKind,
	kindLabel,
	Ledger,
	LedgerError,
	type LedgerEntry,
	ledgerProblems,
	nextSequence,
	parseId,
	parseLedger,
	SECRET_KINDS,
	sequenceOf,
	serialiseEntry,
	verifyId,
} from "./ledger.ts";

const KEY = "campaigns/wrenfield/rolls.jsonl";

function openLedger(storage = new MemoryStorage()) {
	return Ledger.open({ storage, key: KEY, clock: tickingClock("2026-03-01T18:00:00.000Z", 60_000) });
}

describe("the kind table", () => {
	// An earlier draft had d- for both damage and death saves. This is the test
	// that would have caught it, so it exists before anything depends on the table.
	it("has no duplicate prefixes", () => {
		const prefixes = EVENT_KINDS.map((entry) => entry.prefix);
		const duplicates = prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index);
		assert.deepEqual(duplicates, [], `duplicate prefixes: ${duplicates.join(", ")}`);
	});

	it("has no duplicate kinds", () => {
		const kinds = EVENT_KINDS.map((entry) => entry.kind);
		assert.equal(new Set(kinds).size, kinds.length);
	});

	it("uses a single lowercase letter per prefix", () => {
		for (const entry of EVENT_KINDS) assert.match(entry.prefix, /^[a-z]$/, `bad prefix for ${entry.kind}`);
	});

	it("gives every kind a human label", () => {
		for (const entry of EVENT_KINDS) assert.ok(entry.label.length > 2, entry.kind);
	});

	it("uses k- for a death save, not d-", () => {
		assert.equal(formatId("death-save", 42), "k-42");
		assert.equal(formatId("damage", 42), "d-42");
	});

	it("agrees with itself about which kinds exist", () => {
		assert.ok(isEventKind("hit"));
		assert.ok(!isEventKind("nonsense"));
		for (const kind of SECRET_KINDS) assert.ok(isEventKind(kind), `${kind} is not a real kind`);
	});

	it("keeps world-generation results GM-facing and player rolls citable", () => {
		// The rule that a player told the scene was "skewed" cannot un-know it.
		assert.ok(isSecretKind("oracle"));
		assert.ok(isSecretKind("table"));
		assert.ok(isSecretKind("card"));
		assert.ok(!isSecretKind("hit"));
		assert.ok(!isSecretKind("damage"));
		assert.ok(!isSecretKind("death-save"));
	});
});

describe("ids", () => {
	it("formats kind, sequence and no writer", () => {
		assert.equal(formatId("hit", 42), "h-42");
		assert.equal(formatId("oracle", 1), "o-1");
	});

	it("formats the reserved writer suffix", () => {
		assert.equal(formatId("hit", 42, "b"), "h-42b");
	});

	it("round-trips", () => {
		for (const { kind } of EVENT_KINDS) {
			const id = formatId(kind, 7);
			assert.deepEqual(parseId(id), { kind, seq: 7, writer: undefined }, id);
		}
	});

	it("round-trips with a writer", () => {
		assert.deepEqual(parseId("h-42b"), { kind: "hit", seq: 42, writer: "b" });
	});

	it("refuses a sequence that is not a positive integer", () => {
		assert.throws(() => formatId("hit", 0), LedgerError);
		assert.throws(() => formatId("hit", -1), LedgerError);
		assert.throws(() => formatId("hit", 1.5), LedgerError);
	});

	it("refuses a writer that is not one lowercase letter", () => {
		assert.throws(() => formatId("hit", 1, "ab"), LedgerError);
		assert.throws(() => formatId("hit", 1, "B"), LedgerError);
	});

	it("refuses an unknown kind", () => {
		assert.throws(() => formatId("wishing" as EventKind, 1), LedgerError);
	});

	it("rejects things that are not ids", () => {
		for (const bad of ["", "42", "h42", "h-", "-42", "hh-42", "q-42", "h-42bb", "h-4.2", "h-42B"]) {
			assert.equal(parseId(bad), undefined, `parsed ${JSON.stringify(bad)}`);
		}
	});

	it("tolerates surrounding whitespace, since ids get copied out of prose", () => {
		assert.deepEqual(parseId("  h-42 "), { kind: "hit", seq: 42, writer: undefined });
	});

	it("reads the sequence out regardless of prefix", () => {
		assert.equal(sequenceOf("h-42"), 42);
		assert.equal(sequenceOf("t-42"), 42);
		assert.equal(sequenceOf("nope"), undefined);
	});
});

describe("sequences", () => {
	it("starts at 1", () => {
		assert.equal(nextSequence([]), 1);
	});

	it("takes the highest plus one, not the count", () => {
		// A hand-deleted line must not make the next roll reuse a cited number.
		const entries = [{ seq: 1 }, { seq: 2 }, { seq: 9 }] as LedgerEntry[];
		assert.equal(nextSequence(entries), 10);
	});
});

describe("appending", () => {
	let storage: MemoryStorage;
	let ledger: Ledger;

	beforeEach(async () => {
		storage = new MemoryStorage();
		ledger = await openLedger(storage);
	});

	it("numbers from 1 with one shared counter across kinds", async () => {
		const hit = await ledger.append({ kind: "hit", result: "17" });
		const damage = await ledger.append({ kind: "damage", result: "8" });
		const oracle = await ledger.append({ kind: "oracle", result: "yes, but" });
		assert.equal(hit.id, "h-1");
		assert.equal(damage.id, "d-2");
		assert.equal(oracle.id, "o-3");
	});

	it("orders across kinds, so a citation sequence is auditable at a glance", async () => {
		await ledger.append({ kind: "table", result: "a dripping ceiling" });
		const hit = await ledger.append({ kind: "hit", result: "17" });
		assert.equal(hit.seq, 2, "h-2 provably happened after t-1");
	});

	it("records what a person needs to read it back", async () => {
		const entry = await ledger.append({
			kind: "skill",
			actor: "Brannoc",
			reason: "Stealth past the sentry",
			request: "1d20+7",
			result: "14 + 7 = 21",
			total: 21,
			dc: 15,
			outcome: "success",
			data: { dice: [14] },
		});
		assert.equal(entry.actor, "Brannoc");
		assert.equal(entry.total, 21);
		assert.equal(entry.outcome, "success");
		assert.deepEqual(entry.data, { dice: [14] });
		assert.equal(entry.at, "2026-03-01T18:00:00.000Z");
	});

	it("omits absent fields rather than writing nulls", async () => {
		const entry = await ledger.append({ kind: "roll", result: "4" });
		assert.deepEqual(Object.keys(entry), ["id", "seq", "kind", "at", "result"]);
	});

	it("omits the writer suffix for a sole writer", async () => {
		const entry = await ledger.append({ kind: "hit", result: "17" });
		assert.equal(entry.id, "h-1");
		assert.ok(!("writer" in entry));
	});

	it("writes the file as append-only JSONL", async () => {
		await ledger.append({ kind: "hit", result: "17" });
		await ledger.append({ kind: "damage", result: "8" });
		const text = (await storage.read(KEY))!;
		const lines = text.trimEnd().split("\n");
		assert.equal(lines.length, 2);
		assert.equal(JSON.parse(lines[0]).id, "h-1");
		assert.equal(JSON.parse(lines[1]).id, "d-2");
		assert.ok(text.endsWith("\n"));
	});

	it("never rewrites an earlier line", async () => {
		await ledger.append({ kind: "hit", result: "17" });
		const afterFirst = (await storage.read(KEY))!;
		await ledger.append({ kind: "damage", result: "8" });
		const afterSecond = (await storage.read(KEY))!;
		assert.ok(afterSecond.startsWith(afterFirst), "the first line changed");
	});

	it("advances the clock per entry", async () => {
		const first = await ledger.append({ kind: "hit", result: "17" });
		const second = await ledger.append({ kind: "damage", result: "8" });
		assert.ok(new Date(second.at) > new Date(first.at));
	});

	it("does not burn a number when the write fails", async () => {
		const failing = new MemoryStorage();
		failing.append = () => Promise.reject(new Error("disk full"));
		const fragile = await openLedger(failing);
		await assert.rejects(() => fragile.append({ kind: "hit", result: "17" }), /disk full/);
		assert.equal(fragile.peekId("hit"), "h-1", "the sequence advanced despite a failed write");
		assert.equal(fragile.entries.length, 0);
	});

	it("tells you the next id without consuming it", async () => {
		assert.equal(ledger.peekId("hit"), "h-1");
		assert.equal(ledger.peekId("damage"), "d-1");
		await ledger.append({ kind: "hit", result: "17" });
		assert.equal(ledger.peekId("hit"), "h-2");
	});

	it("refuses an unknown kind", async () => {
		await assert.rejects(() => ledger.append({ kind: "wishing" as EventKind, result: "x" }), LedgerError);
	});
});

describe("reopening", () => {
	it("continues the sequence rather than restarting it", async () => {
		const storage = new MemoryStorage();
		const first = await openLedger(storage);
		await first.append({ kind: "hit", result: "17" });
		await first.append({ kind: "damage", result: "8" });

		// The counter comes from the log, so no state file can desynchronise it.
		const second = await openLedger(storage);
		assert.equal(second.entries.length, 2);
		const next = await second.append({ kind: "oracle", result: "no" });
		assert.equal(next.id, "o-3");
	});

	it("starts clean when the file is absent", async () => {
		const ledger = await openLedger();
		assert.deepEqual(ledger.entries, []);
		assert.deepEqual(ledger.problems(), []);
		assert.equal(ledger.peekId("hit"), "h-1");
	});

	it("survives twenty sessions of appends and reopens", async () => {
		const storage = new MemoryStorage();
		let seen = 0;
		for (let session = 0; session < 20; session++) {
			const ledger = await openLedger(storage);
			for (let i = 0; i < 25; i++) await ledger.append({ kind: "roll", result: String(i) });
			seen += 25;
			assert.equal(ledger.entries.length, seen);
			assert.deepEqual(ledger.problems(), []);
		}
		const final = await openLedger(storage);
		// 500 rolls: the sequence where four hex digits would have been certain to collide.
		assert.equal(final.entries.length, 500);
		const ids = new Set(final.entries.map((entry) => entry.id));
		assert.equal(ids.size, 500, "duplicate ids after 500 rolls");
	});
});

describe("verifying a citation", () => {
	let ledger: Ledger;

	beforeEach(async () => {
		ledger = await openLedger();
		await ledger.append({ kind: "hit", actor: "goblin archer", reason: "shortbow", result: "12 + 4 = 16", dc: 15, outcome: "success" });
		await ledger.append({ kind: "table", result: "a dripping ceiling" });
	});

	it("finds a real citation", () => {
		const result = ledger.verify("h-1");
		assert.equal(result.status, "found");
		assert.equal(result.status === "found" && result.entry.result, "12 + 4 = 16");
		assert.equal(result.status === "found" && result.note, undefined);
	});

	it("reports a fabricated id as never rolled", () => {
		const result = ledger.verify("h-89");
		assert.equal(result.status, "missing");
		assert.match(ledger.describe("h-89"), /never rolled/);
		assert.match(ledger.describe("h-89"), /goes up to 2/);
	});

	it("resolves a wrong prefix and says the kind was misstated", () => {
		// The prefix is a checksum on the citation. A made-up h-2 does not merely
		// fail; it resolves to a table roll and says so.
		const result = ledger.verify("h-2");
		assert.equal(result.status, "found");
		assert.match(
			result.status === "found" ? (result.note ?? "") : "",
			/cited as attack roll but recorded as table roll; the real id is t-2/,
		);
	});

	it("separates a mislabelled real roll from an invented one", () => {
		assert.equal(ledger.verify("h-2").status, "found", "a mislabelled real roll");
		assert.equal(ledger.verify("h-99").status, "missing", "an invented roll");
	});

	it("rejects text that is not an id at all", () => {
		assert.equal(ledger.verify("the goblin rolled well").status, "not-an-id");
		assert.match(ledger.describe("nope"), /is not a ledger id/);
	});

	it("describes a found entry in one readable line", () => {
		assert.equal(
			ledger.describe("h-1"),
			"h-1: attack roll by goblin archer for shortbow — 12 + 4 = 16 (DC 15: success) at 2026-03-01T18:00:00.000Z",
		);
	});
});

describe("a damaged ledger", () => {
	it("reports duplicate sequences instead of picking one", () => {
		// Restored backups and hand-edits happen. Silently returning the first
		// match is how a ledger lies to the person auditing it.
		const entries = [
			{ id: "h-1", seq: 1, kind: "hit", at: "x", result: "17" },
			{ id: "d-1", seq: 1, kind: "damage", at: "y", result: "8" },
		] as LedgerEntry[];
		const result = verifyId(entries, "h-1");
		assert.equal(result.status, "ambiguous");
		assert.equal(result.status === "ambiguous" && result.entries.length, 2);
		assert.match(describeVerifyResult("h-1", result), /ambiguous: 2 entries share sequence 1/);
		assert.match(describeVerifyResult("h-1", result), /nothing is renumbered/);
		assert.match(ledgerProblems(entries)[0], /2 entries share sequence 1/);
	});

	it("skips a corrupt line rather than losing the whole file", () => {
		const text = ['{"id":"h-1","seq":1,"kind":"hit","at":"x","result":"17"}', "{ not json", '{"id":"d-3","seq":3,"kind":"damage","at":"z","result":"8"}'].join("\n");
		const { entries, badLines } = parseLedger(text);
		assert.equal(entries.length, 2, "one bad line lost the good ones");
		assert.deepEqual(badLines, [2]);
		assert.match(ledgerProblems(entries, badLines)[0], /line 2 is not a valid entry/);
	});

	it("rejects a line that parses but is not an entry", () => {
		const { entries, badLines } = parseLedger('{"id":"h-1"}\n{"nope":true}\n42\n');
		assert.deepEqual(entries, []);
		assert.deepEqual(badLines, [1, 2, 3]);
	});

	it("notices an id that disagrees with its own kind", () => {
		const entries = [{ id: "h-1", seq: 1, kind: "table", at: "x", result: "y" }] as LedgerEntry[];
		assert.match(ledgerProblems(entries)[0], /has a hit prefix but records a table/);
	});

	it("notices an id that disagrees with its own sequence", () => {
		const entries = [{ id: "h-9", seq: 1, kind: "hit", at: "x", result: "y" }] as LedgerEntry[];
		assert.ok(ledgerProblems(entries).some((p) => /disagrees with its own sequence/.test(p)));
	});

	it("is quiet about a healthy ledger", async () => {
		const ledger = await openLedger();
		await ledger.append({ kind: "hit", result: "17" });
		assert.deepEqual(ledger.problems(), []);
	});

	it("skips blank lines without complaint", () => {
		const { entries, badLines } = parseLedger('\n{"id":"h-1","seq":1,"kind":"hit","at":"x","result":"1"}\n\n');
		assert.equal(entries.length, 1);
		assert.deepEqual(badLines, []);
	});
});

describe("reading back", () => {
	it("returns the recent tail for a resume brief", async () => {
		const ledger = await openLedger();
		for (let i = 1; i <= 15; i++) await ledger.append({ kind: "roll", result: String(i) });
		const recent = ledger.recent(3);
		assert.deepEqual(recent.map((entry) => entry.result), ["13", "14", "15"]);
	});

	it("filters by kind", async () => {
		const ledger = await openLedger();
		await ledger.append({ kind: "hit", result: "17" });
		await ledger.append({ kind: "damage", result: "8" });
		await ledger.append({ kind: "hit", result: "3" });
		assert.deepEqual(ledger.byKind("hit").map((entry) => entry.id), ["h-1", "h-3"]);
	});

	it("does not expose a mutable entry list", async () => {
		const ledger = await openLedger();
		await ledger.append({ kind: "hit", result: "17" });
		(ledger.entries as LedgerEntry[]).push({ id: "h-999" } as LedgerEntry);
		// The cast is the point: callers should not be able to do this by accident.
		assert.equal(ledger.verify("h-1").status, "found");
	});

	it("serialises one line per entry", () => {
		const line = serialiseEntry({ id: "h-1", seq: 1, kind: "hit", at: "x", result: "17" });
		assert.ok(line.endsWith("\n"));
		assert.equal(line.split("\n").length, 2);
	});

	it("labels every kind for a human", () => {
		assert.equal(kindLabel("death-save"), "death save");
		assert.equal(kindLabel("hit"), "attack roll");
	});
});
