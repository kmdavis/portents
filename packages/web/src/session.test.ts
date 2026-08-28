/**
 * Tests for the browser session, and for `BrowserStorage` itself.
 *
 * The library's README admitted a gap: `BrowserStorage` had no automated
 * coverage, because Node has no IndexedDB. It typechecked and it bundled, and
 * nothing proved it worked. `fake-indexeddb` supplies a real implementation of
 * the spec, so the published storage conformance suite runs against it here --
 * the same 22 cases every other adapter passes.
 *
 * That is why this file lives in the web package rather than in core: core must
 * not carry a test-only dependency on an IndexedDB polyfill, and the browser
 * adapter has no other consumer to be tested through.
 */

import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BrowserStorage } from "@portent/core/browser";
import { storageConformanceCases } from "@portent/core/testing";
import type { Storage } from "@portent/core";
import { WebSession } from "./session.ts";

let counter = 0;
/** A fresh database per case, so cases cannot interfere. */
const freshStorage = () => new BrowserStorage({ database: `portent-test-${counter++}` });

describe("BrowserStorage conformance", () => {
	// The gap this package exists to close. These are the library's own published
	// cases, not a rewrite of them, so the browser adapter is held to exactly the
	// contract the Node and memory adapters are.
	for (const testCase of storageConformanceCases(freshStorage, { caseSensitive: true })) {
		it(testCase.name, testCase.run);
	}
});

describe("IndexedDB persistence", () => {
	it("survives a fresh handle to the same database", async () => {
		// The whole point of using IndexedDB rather than memory: a closed tab is not
		// a lost campaign.
		const database = `portent-persist-${counter++}`;
		const first = new BrowserStorage({ database });
		await first.write("campaigns/x/campaign.md", "---\nname: X\n---\n");

		const second = new BrowserStorage({ database });
		assert.equal(await second.read("campaigns/x/campaign.md"), "---\nname: X\n---\n");
	});

	it("keeps separate databases separate", async () => {
		const a = new BrowserStorage({ database: `portent-a-${counter++}` });
		const b = new BrowserStorage({ database: `portent-b-${counter++}` });
		await a.write("k", "from a");
		assert.equal(await b.read("k"), undefined);
	});
});

describe("the session without a campaign", () => {
	const session = new WebSession({ storage: freshStorage(), seed: "web" });

	it("rolls dice with no campaign and no ledger id", async () => {
		// Someone who just wants a number should not have to create a campaign.
		const outcome = await session.roll("2d6+3");
		assert.equal(outcome.lines.length, 1);
		assert.equal(outcome.ids.length, 0, "an id implies a ledger entry that does not exist");
		assert.match(outcome.lines[0], /2d6\+3/);
	});

	it("reports success against a DC", async () => {
		assert.match((await session.roll("1d20+100", { dc: 15 })).lines[0], /success/);
	});

	it("handles the repeat prefix", async () => {
		const outcome = await session.roll("6#4d6kh3");
		assert.equal(outcome.lines.length, 6);
		assert.equal(outcome.totals.length, 6);
	});

	it("computes odds", () => {
		const text = session.odds("4d6kh3", 15);
		assert.match(text, /Range 3–18/);
		assert.match(text, /Chance of 15 or more/);
	});

	it("draws ephemerally, so nothing depletes", async () => {
		const first = await session.draw("crit-hits", 1);
		assert.equal(first.length, 1);
		assert.ok(first[0].length > 0);
	});

	it("rolls tables and answers the oracle", async () => {
		assert.ok((await session.rollTable("weather")).length > 0);
		assert.ok((await session.oracle("yes_no", "is the gate guarded?")).length > 0);
	});

	it("exposes the bundled content", () => {
		assert.ok(session.decks.length > 0);
		assert.ok(session.tables.length > 0);
		assert.ok(session.decks.some((deck) => deck.id === "crit-hits"));
	});
});

describe("the session with a campaign", () => {
	let session: WebSession;

	before(async () => {
		session = new WebSession({ storage: freshStorage(), seed: "web2" });
		await session.createCampaign("Browser Test", "5e (2024)");
	});

	it("cites a ledger id for every roll", async () => {
		// A number with no id is the thing the ledger exists to make impossible,
		// in a browser as much as anywhere.
		const outcome = await session.roll("1d20");
		assert.equal(outcome.ids.length, 1);
		assert.match(outcome.ids[0], /^r-\d+$/);
		assert.match(outcome.lines[0], /^r-\d+ /);
	});

	it("counts rolls on the campaign", async () => {
		const before = session.campaign!.counters.rolls;
		await session.roll("3#1d6");
		assert.equal(session.campaign!.counters.rolls, before + 3);
	});

	it("depletes a persisted deck", async () => {
		const drawn = new Set<string>();
		for (let i = 0; i < 4; i++) drawn.add((await session.draw("crit-hits", 1))[0]);
		assert.equal(drawn.size, 4, "a card came back before a reshuffle");
	});

	it("records table and oracle results to the ledger", async () => {
		await session.rollTable("weather");
		await session.oracle("scene");
		const kinds = session.campaign!.ledger.entries.map((entry) => entry.kind);
		assert.ok(kinds.includes("table"));
		assert.ok(kinds.includes("oracle"));
	});

	it("resolves the system's own sheet scaffold", async () => {
		// Proof the content packs reach the browser: a 2024 campaign gets the 2024
		// template, not the generic fallback.
		assert.equal(session.campaign!.sheetTemplate()?.id, "dnd-5e-2024");
	});

	it("reopens a campaign from IndexedDB", async () => {
		const slug = session.campaign!.slug;
		const rolls = session.campaign!.counters.rolls;
		session.closeCampaign();
		assert.equal(session.campaign, undefined);

		const reopened = await session.openCampaign(slug);
		assert.equal(reopened.counters.rolls, rolls);
		assert.ok(reopened.ledger.entries.length > 0, "the ledger did not survive");
	});

	it("lists campaigns", async () => {
		const list = await session.listCampaigns();
		assert.ok(list.some((entry) => entry.slug === "browser-test"));
		assert.equal(list.find((entry) => entry.slug === "browser-test")?.systemLine, "5e (2024)");
	});
});

describe("storage is the caller's choice", () => {
	/**
	 * A minimal adapter standing in for a hosted key-value service.
	 *
	 * Written by hand rather than reusing MemoryStorage, because the point is that
	 * something with no relationship to this repo satisfies the contract. A hosted
	 * UI backed by a key-value store passes one of these and nothing else changes.
	 */
	class FakeKeyValueService implements Storage {
		#entries = new Map<string, string>();
		async read(key: string) {
			return this.#entries.get(key);
		}
		async write(key: string, contents: string) {
			this.#entries.set(key, contents);
		}
		async append(key: string, contents: string) {
			this.#entries.set(key, (this.#entries.get(key) ?? "") + contents);
		}
		async exists(key: string) {
			return this.#entries.has(key);
		}
		async list(prefix: string) {
			return [...this.#entries.keys()].filter((key) => key.startsWith(prefix)).sort();
		}
		async remove(key: string) {
			this.#entries.delete(key);
		}
	}

	it("runs a whole campaign through an adapter that is not IndexedDB", async () => {
		// The requirement: nothing in this package may assume IndexedDB.
		const session = new WebSession({ storage: new FakeKeyValueService(), seed: "kv" });
		const campaign = await session.createCampaign("Hosted Test", "pf2e");
		const rolled = await session.roll("1d20");

		assert.equal(campaign.slug, "hosted-test");
		assert.match(rolled.ids[0], /^r-\d+$/, "the ledger did not work on a foreign adapter");
		assert.equal(campaign.sheetTemplate()?.id, "pf2e-remaster", "content did not reach a foreign adapter");
		assert.ok((await session.listCampaigns()).some((entry) => entry.slug === "hosted-test"));
	});

	it("gives identical results across adapters for the same seed", async () => {
		// If a result depended on the adapter, something is reaching past the port.
		const run = async (storage: Storage) => {
			const session = new WebSession({ storage, seed: "same" });
			await session.createCampaign("Parity", "generic");
			return (await session.roll("4#1d20")).totals;
		};
		assert.deepEqual(await run(new FakeKeyValueService()), await run(freshStorage()));
	});

	it("requires a storage rather than defaulting to one", () => {
		// A default would quietly bind this package to one platform.
		// @ts-expect-error storage is required, and that is the assertion
		assert.throws(() => new WebSession({}), /storage|undefined/i);
	});
});

describe("maps", () => {
	const session = new WebSession({ storage: freshStorage() });

	it("renders the same dungeon as text and as vector", () => {
		const map = session.map({ rooms: 4, seed: "fixed" });
		assert.match(map.ascii, /#/);
		assert.match(map.svg, /^<svg/);
		assert.equal(map.seed, "fixed");
	});

	it("is reproducible from a seed", () => {
		assert.equal(session.map({ rooms: 9, seed: "s" }).ascii, session.map({ rooms: 9, seed: "s" }).ascii);
	});

	it("differs on a different seed", () => {
		assert.notEqual(session.map({ rooms: 9, seed: "a" }).ascii, session.map({ rooms: 9, seed: "b" }).ascii);
	});
});
