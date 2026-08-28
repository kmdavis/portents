/**
 * A session facade over the engine, with no DOM in it.
 *
 * This is what a UI sits on, and deliberately not a UI itself. Everything here
 * returns values, so it can be driven by a browser, a hosted page, a worker, or
 * a test, and the tests assert on results rather than on pixels.
 *
 * **Storage defaults to IndexedDB and can be replaced.** This package is for
 * browsers, and IndexedDB is what a browser has, so requiring it explicitly was
 * friction for the common case. Pass `storage` to override -- a hosted UI backed
 * by a key-value service supplies an adapter for that and the session cannot tell
 * the difference. The only requirement is the `Storage` contract, which the
 * published conformance suite lets any adapter prove it satisfies.
 *
 * It also gives the IndexedDB adapter a consumer to be tested through, closing a
 * gap the library's README admitted: Node has no IndexedDB, so `BrowserStorage`
 * typechecked and bundled with nothing proving it worked.
 */

import {
	analyze,
	Campaign,
	type CampaignDeps,
	chanceOf,
	createRegistry,
	createView,
	type Deck,
	drawEphemeral,
	formatCard,
	formatDistribution,
	formatRoll,
	generateDungeon,
	oracleAnswer,
	type OracleKind,
	parseTileSet,
	renderAsciiView,
	renderSvg,
	revealAll,
	roll,
	rollTable,
	formatTableResult,
	type Storage,
	seededRandomSource,
	splitRepeat,
	systemClock,
	type Table,
} from "@portents/core";
import { BrowserStorage } from "@portents/core/browser";
import { commonContent, dungeonTiles } from "@portents/content";

export interface SessionOptions {
	/**
	 * Where state goes. Any adapter satisfying the `Storage` contract.
	 *
	 * Defaults to IndexedDB via {@link BrowserStorage}, which is the right answer
	 * in a browser and the reason this package exists. Override it for anywhere
	 * else: a hosted page backed by a key-value service, a worker, a test.
	 */
	readonly storage?: Storage;
	/** IndexedDB database name for the default adapter. Ignored if `storage` is given. */
	readonly database?: string;
	/** Fixed seed for reproducible output. Omit for real randomness. */
	readonly seed?: string;
}

export interface RollOutcome {
	readonly lines: readonly string[];
	readonly totals: readonly number[];
	readonly ids: readonly string[];
}

export interface MapOutcome {
	readonly ascii: string;
	readonly svg: string;
	readonly seed: string;
}

/**
 * One session.
 *
 * Holds an optional campaign, so a caller works with or without one: someone who
 * just wants to roll dice should not have to create a campaign first, and someone
 * running a game should get their state persisted.
 */
export class WebSession {
	readonly registry = createRegistry(commonContent);
	readonly #deps: CampaignDeps;
	#campaign: Campaign | undefined;

	constructor(options: SessionOptions = {}) {
		this.#deps = {
			// `??` avoids building an adapter nobody will use. It is not what makes
			// this work off a browser: BrowserStorage's constructor is inert and only
			// throws when read from, so eager construction would be harmless too. An
			// earlier comment here claimed the laziness was load-bearing, and a
			// mutation test showed it was not.
			storage: options.storage ?? new BrowserStorage({ database: options.database ?? "portents" }),
			clock: systemClock,
			random: options.seed === undefined ? undefined : seededRandomSource(options.seed),
			registry: this.registry,
		};
	}

	get campaign(): Campaign | undefined {
		return this.#campaign;
	}

	get decks(): readonly Deck[] {
		return this.registry.deckIds().map((id) => this.registry.requireDeck(id));
	}

	get tables(): readonly Table[] {
		return this.registry.tableIds().map((id) => this.registry.requireTable(id));
	}

	// ── Campaigns ──────────────────────────────────────────────────────────

	async listCampaigns() {
		return Campaign.list(this.#deps);
	}

	async createCampaign(name: string, system: string): Promise<Campaign> {
		this.#campaign = await Campaign.create(this.#deps, { name, system });
		return this.#campaign;
	}

	async openCampaign(slug: string): Promise<Campaign> {
		this.#campaign = await Campaign.open(this.#deps, slug);
		return this.#campaign;
	}

	closeCampaign(): void {
		this.#campaign = undefined;
	}

	// ── Dice ───────────────────────────────────────────────────────────────

	/**
	 * Roll, and record to the campaign's ledger when there is one.
	 *
	 * The ids come back so a caller can show them: a number with no id is exactly
	 * the thing the ledger exists to make impossible, wherever it runs.
	 */
	async roll(input: string, options: { dc?: number } = {}): Promise<RollOutcome> {
		const { times, expression } = splitRepeat(input);
		const lines: string[] = [];
		const totals: number[] = [];
		const ids: string[] = [];

		for (let i = 0; i < times; i++) {
			const result = roll(expression, { rng: this.#deps.random });
			totals.push(result.total);
			const verdict =
				options.dc === undefined ? "" : result.total >= options.dc ? " — success" : " — failure";
			if (this.#campaign) {
				const entry = await this.#campaign.ledger.append({
					kind: "roll",
					request: expression,
					result: formatRoll(result),
					total: result.total,
					...(options.dc === undefined ? {} : { dc: options.dc }),
					...(options.dc === undefined
						? {}
						: { outcome: result.total >= options.dc ? ("success" as const) : ("failure" as const) }),
				});
				ids.push(entry.id);
				await this.#campaign.bumpCounter("rolls");
				lines.push(`${entry.id}  ${formatRoll(result)}${verdict}`);
			} else {
				lines.push(`${formatRoll(result)}${verdict}`);
			}
		}
		return { lines, totals, ids };
	}

	odds(expression: string, dc?: number): string {
		const distribution = analyze(expression);
		const lines = [formatDistribution(distribution, expression)];
		if (dc !== undefined) {
			lines.push(`Chance of ${dc} or more: ${(chanceOf(distribution, dc, "atLeast") * 100).toFixed(1)}%`);
		}
		return lines.join("\n\n");
	}

	// ── Content ────────────────────────────────────────────────────────────

	/** Draw, persisting the pile when a campaign is open so cards stay drawn. */
	async draw(deckId: string, count = 1): Promise<string[]> {
		const deck = this.registry.requireDeck(deckId);
		if (!this.#campaign) {
			return drawEphemeral(deck, { count, rng: this.#deps.random }).map((card) => formatCard(card));
		}
		const result = await this.#campaign.draw(deck, count);
		await this.#campaign.ledger.append({
			kind: "card",
			request: deck.id,
			result: result.cards.map((card) => card.name).join(", "),
		});
		return result.cards.map((card) => formatCard(card));
	}

	async rollTable(tableId: string): Promise<string> {
		const table = this.registry.requireTable(tableId);
		const text = formatTableResult(
			rollTable(table, { rng: this.#deps.random, registry: this.registry }),
		);
		if (this.#campaign) {
			await this.#campaign.ledger.append({ kind: "table", request: table.id, result: text });
		}
		return text;
	}

	async oracle(kind: OracleKind, question?: string): Promise<string> {
		const answer = oracleAnswer({
			kind,
			question,
			rng: this.#deps.random,
			registry: this.registry,
		});
		if (this.#campaign) {
			await this.#campaign.ledger.append({
				kind: "oracle",
				request: kind,
				reason: question,
				result: answer.text,
			});
		}
		return answer.text;
	}

	/**
	 * A dungeon, as both text and vector.
	 *
	 * Both come from the library's own renderers, which the tile suite proves
	 * describe the same tile, so the picture cannot disagree with the grid.
	 */
	map(options: { rooms?: number; seed?: string } = {}): MapOutcome {
		const seed = options.seed ?? Math.random().toString(36).slice(2, 10);
		const side = Math.max(2, Math.min(Math.ceil(Math.sqrt(options.rooms ?? 6)), 6));
		const dungeon = generateDungeon(parseTileSet(dungeonTiles), {
			cols: side,
			rows: side,
			seed,
			rng: seededRandomSource(seed),
		});
		return {
			ascii: renderAsciiView(revealAll(createView(dungeon.map))),
			svg: renderSvg(dungeon.map),
			seed,
		};
	}
}
