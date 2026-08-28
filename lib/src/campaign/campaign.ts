/**
 * A campaign on disk: the state that has to survive a closed laptop.
 *
 * Everything a person would want to read is markdown they can open, edit and put
 * in git. There is no `state.json`: the campaign's volatile state lives in
 * `campaign.md`'s frontmatter, with the parts worth reading projected into prose
 * beneath it, exactly as character sheets work. One rule for the whole project is
 * easier to hold than one per file type.
 *
 * ```
 * campaigns/<slug>/
 *   campaign.md          state in frontmatter, premise and agreements in prose
 *   journal.md           append-only, one ## section per scene
 *   world.md             NPCs, Places, Threads, Factions
 *   rolls.jsonl          the ledger
 *   characters/<name>.md character sheets
 *   maps/<name>.txt      saved maps
 *   piles.json           deck draw piles
 * ```
 *
 * `piles.json` is the one file that is not markdown, and deliberately so: a list
 * of card indices has no reader. Pretending otherwise would mean a page of
 * numbers nobody can check, which is worse than admitting it is machine state.
 *
 * ## Writing at the end of a scene, not the end of a session
 *
 * Every mutating method writes through immediately rather than batching. A
 * session ends when a laptop shuts, not when someone types "goodbye", so
 * anything held in memory for later is eventually lost. The cost is more small
 * writes; the benefit is that the file on disk is always the truth.
 */

import { createPile, type Deck, type DrawResult, drawFromPile, type Pile, pileMatchesDeck } from "../decks/deck.ts";
import { Ledger } from "../ledger/ledger.ts";
import {
	appendToSectionBody,
	lastSections,
	sectionBody,
	sectionHeadings,
	setSectionBody,
} from "../markdown/sections.ts";
import type { Clock } from "../ports/clock.ts";
import type { RandomSource } from "../ports/random.ts";
import type { Storage } from "../ports/storage.ts";
import {
	type Frontmatter,
	parseDocument,
	type Scalar,
	stringifyDocument,
} from "../sheets/frontmatter.ts";
import {
	createSheet,
	type CreateSheetInput,
	parseSheet,
	patchStatus,
	type Sheet,
	sheetProblems,
	statusDigest,
	stringifySheet,
} from "../sheets/sheet.ts";
import {
	defaultEdition,
	describeRules,
	type Edition,
	formatSystem,
	knownSystem,
	parseSystem,
	resolveSystemLine,
	type RulesSystem,
	systemLabel,
} from "./editions.ts";

export const WORLD_SECTIONS = ["NPCs", "Places", "Threads", "Factions"] as const;
export type WorldSection = (typeof WORLD_SECTIONS)[number];

export class CampaignError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CampaignError";
	}
}

// ── Slugs and keys ───────────────────────────────────────────────────────────

/**
 * A campaign's directory name.
 *
 * Never derived twice: the slug is stored in the campaign's own frontmatter, so a
 * later change to this function cannot orphan an existing campaign.
 */
export function slugify(name: string): string {
	const slug = name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	if (!slug) throw new CampaignError(`Cannot make a directory name from ${JSON.stringify(name)}`);
	return slug;
}

export const CAMPAIGN_ROOT = "campaigns";

export function campaignKeys(slug: string) {
	const dir = `${CAMPAIGN_ROOT}/${slug}`;
	return {
		dir,
		overview: `${dir}/campaign.md`,
		journal: `${dir}/journal.md`,
		world: `${dir}/world.md`,
		rolls: `${dir}/rolls.jsonl`,
		piles: `${dir}/piles.json`,
		character: (name: string) => `${dir}/characters/${slugify(name)}.md`,
		map: (name: string) => `${dir}/maps/${slugify(name)}.txt`,
	};
}

// ── State ────────────────────────────────────────────────────────────────────

export interface Scene {
	readonly summary: string;
	readonly location?: string;
	readonly time?: string;
	/** Freeform: "calm", "tense", "combat round 3". */
	readonly tension?: string;
}

export interface CampaignClock {
	readonly name: string;
	readonly filled: number;
	readonly segments: number;
	readonly note?: string;
}

export interface PendingRoll {
	readonly expression: string;
	readonly reason: string;
	readonly dc?: number;
	readonly requestedAt: string;
}

export interface CampaignSummary {
	readonly slug: string;
	readonly name: string;
	readonly system: RulesSystem;
	readonly edition?: Edition;
	/** The line as written: `"5e (2024)"`. */
	readonly systemLine?: string;
	readonly updatedAt?: string;
	readonly scene?: string;
}

export interface CreateCampaignInput {
	readonly name: string;
	/** Freeform, and may carry its printing: `"5e"`, `"5e (2024)"`, `"Call of Cthulhu 7e"`. */
	readonly system: string;
	/** An alternative to putting the printing in {@link system}. Supplying both, in conflict, is an error. */
	readonly edition?: string;
	readonly premise?: string;
	readonly tone?: string;
	/** Lines and veils agreed before play. */
	readonly safety?: string;
}

export interface CampaignDeps {
	readonly storage: Storage;
	readonly clock: Clock;
	readonly random?: RandomSource;
}

function requireString(data: Frontmatter, key: string, where: string): string {
	const value = data[key];
	if (typeof value !== "string" || value === "") {
		throw new CampaignError(`${where} has no "${key}" in its frontmatter`);
	}
	return value;
}

function asMap(value: unknown): Record<string, Scalar> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, Scalar>;
}

function progressBar(filled: number, segments: number): string {
	const safe = Math.max(0, Math.min(filled, segments));
	return `${"▰".repeat(safe)}${"▱".repeat(Math.max(0, segments - safe))}`;
}

/**
 * Clocks are stored as `name: "3/6 note"` so a whole clock is one readable line
 * in frontmatter, and a person can advance one by hand without counting commas.
 */
function parseClockValue(name: string, value: Scalar): CampaignClock {
	const text = String(value);
	const match = text.match(/^\s*(\d+)\s*\/\s*(\d+)\s*(.*)$/);
	if (!match) {
		throw new CampaignError(`Clock ${JSON.stringify(name)} should look like "3/6" or "3/6 note", got ${JSON.stringify(text)}`);
	}
	const note = match[3].trim();
	return {
		name,
		filled: Number.parseInt(match[1], 10),
		segments: Number.parseInt(match[2], 10),
		...(note ? { note } : {}),
	};
}

function formatClockValue(clock: CampaignClock): string {
	return `${clock.filled}/${clock.segments}${clock.note ? ` ${clock.note}` : ""}`;
}

// ── The campaign ─────────────────────────────────────────────────────────────

export class Campaign {
	readonly #deps: CampaignDeps;
	readonly #keys: ReturnType<typeof campaignKeys>;
	#data: Frontmatter;
	#body: string;
	#ledger: Ledger;

	private constructor(deps: CampaignDeps, slug: string, data: Frontmatter, body: string, ledger: Ledger) {
		this.#deps = deps;
		this.#keys = campaignKeys(slug);
		this.#data = data;
		this.#body = body;
		this.#ledger = ledger;
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────

	static async create(deps: CampaignDeps, input: CreateCampaignInput): Promise<Campaign> {
		if (!input.name.trim()) throw new CampaignError("A campaign needs a name");
		const slug = slugify(input.name);
		const keys = campaignKeys(slug);
		if (await deps.storage.exists(keys.overview)) {
			throw new CampaignError(`Campaign "${slug}" already exists`);
		}

		const { system, edition } = resolveSystemLine(input.system, input.edition);
		const now = deps.clock.iso();
		const data: Frontmatter = {
			name: input.name.trim(),
			slug,
			// One freeform line: "5e (2024)". A system and its printing are one fact
			// about a table, and two keys made the frontmatter read like a form.
			system: formatSystem(system, edition),
			createdAt: now,
			updatedAt: now,
			counters: { sessions: 0, rolls: 0, draws: 0 },
		};

		const body = [
			`# ${input.name.trim()}`,
			"",
			`_${describeRules(system, edition)}_`,
			"",
			"## Premise",
			"",
			input.premise?.trim() || "_TBD_",
			"",
			"## Tone",
			"",
			input.tone?.trim() || "_TBD_",
			"",
			"## Table agreements",
			"",
			input.safety?.trim() || "_Lines and veils: TBD_",
			"",
		].join("\n");

		const campaign = new Campaign(
			deps,
			slug,
			data,
			body,
			await Ledger.open({ storage: deps.storage, key: keys.rolls, clock: deps.clock }),
		);
		await campaign.#save();
		await deps.storage.write(
			keys.journal,
			`# ${input.name.trim()} — Journal\n\nOne section per scene, oldest first.\n`,
		);
		await deps.storage.write(
			keys.world,
			["# World", "", ...WORLD_SECTIONS.flatMap((section) => [`## ${section}`, "", "_TBD_", ""])].join("\n"),
		);
		return campaign;
	}

	static async open(deps: CampaignDeps, slug: string): Promise<Campaign> {
		const keys = campaignKeys(slug);
		const text = await deps.storage.read(keys.overview);
		if (text === undefined) {
			throw new CampaignError(
				`No campaign "${slug}". Its overview would be at ${keys.overview}. List campaigns to see what exists.`,
			);
		}
		const doc = parseDocument(text);
		requireString(doc.data, "name", `Campaign "${slug}"`);
		const stored = doc.data.slug;
		if (typeof stored === "string" && stored !== slug) {
			throw new CampaignError(
				`Campaign at ${keys.overview} calls itself "${stored}" but was opened as "${slug}"; ` +
					"the directory was renamed without updating the frontmatter",
			);
		}
		return new Campaign(
			deps,
			slug,
			doc.data,
			doc.body,
			await Ledger.open({ storage: deps.storage, key: keys.rolls, clock: deps.clock }),
		);
	}

	/** Every campaign found, newest activity first. */
	static async list(deps: CampaignDeps): Promise<CampaignSummary[]> {
		const keys = await deps.storage.list(`${CAMPAIGN_ROOT}/`);
		const overviews = keys.filter((key) => key.endsWith("/campaign.md"));
		const summaries: CampaignSummary[] = [];
		for (const key of overviews) {
			const text = await deps.storage.read(key);
			if (text === undefined) continue;
			try {
				const { data } = parseDocument(text);
				const slug = typeof data.slug === "string" ? data.slug : key.split("/").at(-2)!;
				const line = typeof data.system === "string" ? data.system : "generic";
				const { system, edition } = parseSystem(line);
				const scene = asMap(data.scene).summary;
				summaries.push({
					slug,
					name: typeof data.name === "string" ? data.name : slug,
					system,
					...(edition ? { edition } : {}),
					systemLine: line,
					...(typeof data.updatedAt === "string" ? { updatedAt: data.updatedAt } : {}),
					...(scene ? { scene: String(scene) } : {}),
				});
			} catch {
				// A campaign whose frontmatter will not parse still exists. Skipping it
				// silently would make it invisible and unrecoverable, so report it.
				const slug = key.split("/").at(-2)!;
				summaries.push({ slug, name: `${slug} (unreadable frontmatter)`, system: "generic" });
			}
		}
		return summaries.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
	}

	// ── Identity ───────────────────────────────────────────────────────────

	get slug(): string {
		return this.#keys.dir.split("/").at(-1)!;
	}

	get name(): string {
		return String(this.#data.name);
	}

	/** The system alone: `"5e"` from `5e (2024)`. */
	get system(): RulesSystem {
		return this.#parsedSystem().system;
	}

	/** The printing alone: `"2024"` from `5e (2024)`. */
	get edition(): Edition | undefined {
		return this.#parsedSystem().edition;
	}

	/** The whole line as written: `"5e (2024)"`. */
	get systemLine(): string {
		return typeof this.#data.system === "string" ? this.#data.system : "generic";
	}

	#parsedSystem(): { system: string; edition?: string } {
		try {
			return parseSystem(this.systemLine);
		} catch {
			return { system: "generic" };
		}
	}

	get keys() {
		return this.#keys;
	}

	get ledger(): Ledger {
		return this.#ledger;
	}

	get counters(): { sessions: number; rolls: number; draws: number } {
		const stored = asMap(this.#data.counters);
		return {
			sessions: Number(stored.sessions ?? 0),
			rolls: Number(stored.rolls ?? 0),
			draws: Number(stored.draws ?? 0),
		};
	}

	get scene(): Scene | undefined {
		const stored = asMap(this.#data.scene);
		if (!stored.summary) return undefined;
		return {
			summary: String(stored.summary),
			...(stored.location ? { location: String(stored.location) } : {}),
			...(stored.time ? { time: String(stored.time) } : {}),
			...(stored.tension ? { tension: String(stored.tension) } : {}),
		};
	}

	get clocks(): CampaignClock[] {
		return Object.entries(asMap(this.#data.clocks)).map(([name, value]) => parseClockValue(name, value));
	}

	get pendingRoll(): PendingRoll | undefined {
		const stored = asMap(this.#data.pendingRoll);
		if (!stored.expression) return undefined;
		return {
			expression: String(stored.expression),
			reason: String(stored.reason ?? ""),
			...(stored.dc === undefined ? {} : { dc: Number(stored.dc) }),
			requestedAt: String(stored.requestedAt ?? ""),
		};
	}

	get activeCharacter(): string | undefined {
		const value = this.#data.activeCharacter;
		return typeof value === "string" ? value : undefined;
	}

	// ── Writing ────────────────────────────────────────────────────────────

	async #save(): Promise<void> {
		this.#data = { ...this.#data, updatedAt: this.#deps.clock.iso() };
		this.#syncSections();
		await this.#deps.storage.write(
			this.#keys.overview,
			stringifyDocument({ data: this.#data, body: this.#body }),
		);
	}

	/**
	 * Project state into prose, the same contract as a character sheet: marked as
	 * generated, frontmatter canonical.
	 */
	#syncSections(): void {
		const scene = this.scene;
		if (scene) {
			const lines = ["<!-- portent:generated scene -->", "", scene.summary];
			const facts = [
				scene.location ? `**Where.** ${scene.location}` : undefined,
				scene.time ? `**When.** ${scene.time}` : undefined,
				scene.tension ? `**Mood.** ${scene.tension}` : undefined,
			].filter(Boolean);
			if (facts.length > 0) lines.push("", facts.join("  \n"));
			this.#body = setSectionBody(this.#body, "Current scene", lines.join("\n"));
		}

		const clocks = this.clocks;
		if (clocks.length > 0) {
			const lines = ["<!-- portent:generated clocks -->", ""];
			for (const clock of clocks) {
				const note = clock.note ? ` — ${clock.note}` : "";
				lines.push(`- **${clock.name}** ${progressBar(clock.filled, clock.segments)} ${clock.filled}/${clock.segments}${note}`);
			}
			this.#body = setSectionBody(this.#body, "Clocks", lines.join("\n"));
		}
	}

	async setScene(scene: Scene): Promise<void> {
		if (!scene.summary.trim()) throw new CampaignError("A scene needs a summary");
		this.#data = {
			...this.#data,
			scene: {
				summary: scene.summary.trim(),
				...(scene.location ? { location: scene.location } : {}),
				...(scene.time ? { time: scene.time } : {}),
				...(scene.tension ? { tension: scene.tension } : {}),
			},
		};
		await this.#save();
	}

	/** Create or update a clock. `filled` may exceed nothing: it is clamped to the range. */
	async setClock(name: string, filled: number, segments?: number, note?: string): Promise<CampaignClock> {
		const trimmed = name.trim();
		if (!trimmed) throw new CampaignError("A clock needs a name");
		const existing = this.clocks.find((clock) => clock.name.toLowerCase() === trimmed.toLowerCase());
		const total = segments ?? existing?.segments;
		if (total === undefined) throw new CampaignError(`New clock ${JSON.stringify(trimmed)} needs a segment count`);
		if (!Number.isInteger(total) || total < 1) throw new CampaignError(`Clock segments must be a positive integer, got ${total}`);

		const clock: CampaignClock = {
			name: existing?.name ?? trimmed,
			filled: Math.max(0, Math.min(Math.trunc(filled), total)),
			segments: total,
			...(note ?? existing?.note ? { note: note ?? existing?.note } : {}),
		};
		this.#data = {
			...this.#data,
			clocks: { ...asMap(this.#data.clocks), [clock.name]: formatClockValue(clock) },
		};
		await this.#save();
		return clock;
	}

	/** Advance a clock by `steps`, returning it. Filling one is usually a plot event. */
	async tickClock(name: string, steps = 1): Promise<CampaignClock> {
		const existing = this.clocks.find((clock) => clock.name.toLowerCase() === name.trim().toLowerCase());
		if (!existing) throw new CampaignError(`No clock named ${JSON.stringify(name)}`);
		return this.setClock(existing.name, existing.filled + steps, existing.segments);
	}

	async removeClock(name: string): Promise<boolean> {
		const stored = asMap(this.#data.clocks);
		const key = Object.keys(stored).find((candidate) => candidate.toLowerCase() === name.trim().toLowerCase());
		if (key === undefined) return false;
		const { [key]: _removed, ...rest } = stored;
		this.#data = { ...this.#data, clocks: rest };
		this.#body = setSectionBody(
			this.#body,
			"Clocks",
			Object.keys(rest).length === 0 ? "<!-- portent:generated clocks -->\n\n_None._" : "",
		);
		await this.#save();
		return true;
	}

	async setPendingRoll(pending: Omit<PendingRoll, "requestedAt"> | undefined): Promise<void> {
		this.#data = {
			...this.#data,
			pendingRoll: pending
				? {
						expression: pending.expression,
						reason: pending.reason,
						...(pending.dc === undefined ? {} : { dc: pending.dc }),
						requestedAt: this.#deps.clock.iso(),
					}
				: {},
		};
		await this.#save();
	}

	/**
	 * Record the rules and printing, e.g. `"5e (2024)"`.
	 *
	 * Validated the same way as at creation, so a typo cannot be written to a
	 * campaign that already has play in it.
	 */
	async setSystem(line: string, edition?: string): Promise<void> {
		const { system, edition: resolved } = resolveSystemLine(line, edition);
		this.#data = { ...this.#data, system: formatSystem(system, resolved) };
		this.#body = setSectionBody(
			this.#body,
			"Rules",
			`<!-- portent:generated system -->\n\n${describeRules(system, resolved)}`,
		);
		await this.#save();
	}

	async setActiveCharacter(name: string | undefined): Promise<void> {
		this.#data = { ...this.#data };
		if (name === undefined) delete this.#data.activeCharacter;
		else this.#data.activeCharacter = name;
		await this.#save();
	}

	async bumpCounter(which: "sessions" | "rolls" | "draws", by = 1): Promise<number> {
		const counters = this.counters;
		const next = { ...counters, [which]: counters[which] + by };
		this.#data = { ...this.#data, counters: next };
		await this.#save();
		return next[which];
	}

	/** Replace a prose section of the overview. Premise, Tone, Table agreements. */
	async setOverviewSection(heading: string, body: string): Promise<void> {
		this.#body = setSectionBody(this.#body, heading, body);
		await this.#save();
	}

	// ── Journal ────────────────────────────────────────────────────────────

	/**
	 * Append a scene to the journal.
	 *
	 * Append-only, because a journal that can be rewritten is a journal nobody can
	 * trust, and the ledger ids cited in it must keep pointing at what they meant.
	 */
	async journal(heading: string, body: string): Promise<void> {
		if (!heading.trim()) throw new CampaignError("A journal entry needs a heading");
		const stamp = this.#deps.clock.iso().replace("T", " ").slice(0, 16);
		await this.#deps.storage.append(
			this.#keys.journal,
			`\n## ${heading.trim()}\n\n_${stamp}_\n\n${body.trim()}\n`,
		);
		await this.#save();
	}

	async readJournal(): Promise<string> {
		return (await this.#deps.storage.read(this.#keys.journal)) ?? "";
	}

	/** The last `count` scenes, newest last. */
	async recentJournal(count = 3): Promise<string> {
		return lastSections(await this.readJournal(), count);
	}

	// ── World ──────────────────────────────────────────────────────────────

	async readWorld(): Promise<string> {
		return (await this.#deps.storage.read(this.#keys.world)) ?? "";
	}

	async addToWorld(section: WorldSection, body: string): Promise<void> {
		if (!WORLD_SECTIONS.includes(section)) {
			throw new CampaignError(`Unknown world section ${JSON.stringify(section)}. Known: ${WORLD_SECTIONS.join(", ")}`);
		}
		const world = await this.readWorld();
		await this.#deps.storage.write(this.#keys.world, appendToSectionBody(world, section, body));
	}

	async worldSection(section: WorldSection): Promise<string> {
		return sectionBody(await this.readWorld(), section) ?? "";
	}

	// ── Characters ─────────────────────────────────────────────────────────

	async listCharacters(): Promise<string[]> {
		const keys = await this.#deps.storage.list(`${this.#keys.dir}/characters/`);
		return keys
			.filter((key) => key.endsWith(".md"))
			.map((key) => key.split("/").at(-1)!.replace(/\.md$/, ""));
	}

	async readCharacter(name: string): Promise<Sheet | undefined> {
		const text = await this.#deps.storage.read(this.#keys.character(name));
		return text === undefined ? undefined : parseSheet(text);
	}

	async writeCharacter(sheet: Sheet): Promise<void> {
		const name = sheet.data.name;
		if (typeof name !== "string" || !name.trim()) throw new CampaignError("A character sheet needs a name");
		await this.#deps.storage.write(this.#keys.character(name), stringifySheet(sheet));
	}

	async createCharacter(input: CreateSheetInput, options: { active?: boolean } = {}): Promise<Sheet> {
		const key = this.#keys.character(input.name);
		if (await this.#deps.storage.exists(key)) {
			throw new CampaignError(`Character "${input.name}" already exists in this campaign`);
		}
		const sheet = createSheet(input);
		await this.writeCharacter(sheet);
		if (options.active !== false) await this.setActiveCharacter(input.name);
		return sheet;
	}

	/** Patch a character's status and write it back. The commonest edit during play. */
	async patchCharacter(name: string, patch: Record<string, Scalar | null>): Promise<Sheet> {
		const sheet = await this.readCharacter(name);
		if (!sheet) throw new CampaignError(`No character "${name}" in this campaign`);
		const patched = patchStatus(sheet, patch);
		await this.writeCharacter(patched);
		return patched;
	}

	// ── Deck piles ─────────────────────────────────────────────────────────

	async #readPiles(): Promise<Record<string, Pile>> {
		const text = await this.#deps.storage.read(this.#keys.piles);
		if (text === undefined) return {};
		try {
			const parsed = JSON.parse(text) as Record<string, Pile>;
			return parsed && typeof parsed === "object" ? parsed : {};
		} catch {
			// Opaque machine state: a corrupt pile file costs a reshuffle, not a
			// campaign, so recover rather than refuse to load the game.
			return {};
		}
	}

	async pileFor(deck: Deck): Promise<Pile | undefined> {
		return (await this.#readPiles())[deck.id];
	}

	async savePile(deckId: string, pile: Pile): Promise<void> {
		const piles = await this.#readPiles();
		await this.#deps.storage.write(this.#keys.piles, `${JSON.stringify({ ...piles, [deckId]: pile }, null, "\t")}\n`);
	}

	/**
	 * Draw from a deck, persisting the pile so a card stays gone until a reshuffle.
	 *
	 * The pile is the campaign's, not the deck's, which is why this lives here and
	 * `drawFromPile` stays pure.
	 */
	async draw(deck: Deck, count = 1): Promise<DrawResult> {
		const options = this.#pileOptions();
		const existing = await this.pileFor(deck);
		// A pile that no longer matches its deck means the deck was edited between
		// sessions. Rebuilding costs a reshuffle; refusing would strand the game.
		const pile = existing && pileMatchesDeck(deck, existing) ? existing : createPile(deck, options);
		const result = drawFromPile(deck, pile, { ...options, count });
		await this.savePile(deck.id, result.pile);
		await this.bumpCounter("draws", result.cards.length);
		return result;
	}

	async reshuffle(deck: Deck): Promise<Pile> {
		const pile = createPile(deck, this.#pileOptions());
		await this.savePile(deck.id, pile);
		return pile;
	}

	#pileOptions() {
		const rng = this.#deps.random;
		if (!rng) throw new CampaignError("Drawing needs a RandomSource; pass one when opening the campaign");
		return { rng, now: () => this.#deps.clock.iso() };
	}

	// ── The resume brief ───────────────────────────────────────────────────

	/**
	 * Everything needed to pick the game back up.
	 *
	 * The single most important method here. A solo game lives or dies on whether
	 * the GM can recover its state after a break or a context compaction, and a GM
	 * that quietly forgets the scene invents a different one -- which the player
	 * experiences as the world changing behind their back.
	 */
	async brief(options: { scenes?: number; rolls?: number } = {}): Promise<string> {
		const lines: string[] = [`# ${this.name}`, "", `_${describeRules(this.system, this.edition)}_`];

		const scene = this.scene;
		lines.push("", "## Where we are", "");
		if (scene) {
			lines.push(scene.summary);
			const facts = [
				scene.location ? `**Where.** ${scene.location}` : undefined,
				scene.time ? `**When.** ${scene.time}` : undefined,
				scene.tension ? `**Mood.** ${scene.tension}` : undefined,
			].filter(Boolean);
			if (facts.length > 0) lines.push("", facts.join("  \n"));
		} else {
			lines.push("_No scene recorded. Ask the player where they left off rather than inventing one._");
		}

		const active = this.activeCharacter;
		if (active) {
			const sheet = await this.readCharacter(active);
			if (sheet) {
				const digest = statusDigest(sheet);
				lines.push("", "## Character", "", `**${active}** — ${digest || "no status recorded"}`);
				const problems = sheetProblems(sheet);
				if (problems.length > 0) lines.push("", `_Sheet needs attention: ${problems[0]}_`);
			}
		}

		const clocks = this.clocks;
		if (clocks.length > 0) {
			lines.push("", "## Clocks", "");
			for (const clock of clocks) {
				const note = clock.note ? ` — ${clock.note}` : "";
				lines.push(`- **${clock.name}** ${progressBar(clock.filled, clock.segments)} ${clock.filled}/${clock.segments}${note}`);
			}
		}

		const pending = this.pendingRoll;
		if (pending) {
			const dc = pending.dc ? ` (DC ${pending.dc})` : "";
			lines.push("", "## Waiting on", "", `The player still owes a roll: ${pending.expression} for ${pending.reason}${dc}.`);
		}

		const recent = await this.recentJournal(options.scenes ?? 2);
		if (recent) lines.push("", "## Recently", "", recent);

		const rolls = this.#ledger.recent(options.rolls ?? 5);
		if (rolls.length > 0) {
			lines.push("", "## Last rolls", "");
			for (const entry of rolls) lines.push(`- \`${entry.id}\` ${entry.reason ?? entry.kind}: ${entry.result}`);
		}

		const problems = await this.problems();
		if (problems.length > 0) {
			lines.push("", "## Problems", "");
			for (const problem of problems) lines.push(`- ${problem}`);
		}

		return `${lines.join("\n")}\n`;
	}

	/** Everything inconsistent about the campaign on disk. */
	async problems(): Promise<string[]> {
		const problems = this.#ledger.problems();
		if (typeof this.#data.name !== "string" || this.#data.name === "") {
			problems.push("the campaign has no name in its frontmatter");
		}
		if (this.#data.system === undefined) problems.push("the campaign has no system recorded");
		// Only for a system whose printings are known: an unusual system is nobody's
		// business to second-guess.
		if (knownSystem(this.system) && defaultEdition(this.system) && this.edition === undefined) {
			problems.push(
				`${systemLabel(this.system)} has more than one printing but none is recorded; ` +
					`write it as "${formatSystem(this.system, defaultEdition(this.system))}" before character creation`,
			);
		}
		for (const clock of this.clocks) {
			if (clock.filled >= clock.segments) problems.push(`clock "${clock.name}" is full and should resolve or be removed`);
		}
		const active = this.activeCharacter;
		if (active && !(await this.#deps.storage.exists(this.#keys.character(active)))) {
			problems.push(`the active character "${active}" has no sheet on disk`);
		}
		return problems;
	}

	/** Section headings in the overview, for a caller that wants to show them. */
	overviewSections(): string[] {
		return sectionHeadings(this.#body);
	}

	async overviewSection(heading: string): Promise<string | undefined> {
		return sectionBody(this.#body, heading);
	}
}
