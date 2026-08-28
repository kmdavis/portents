/**
 * Portents as a pi extension: run a real tabletop session for one human player.
 *
 * Three things it guarantees that prompting alone cannot:
 *
 * 1. **Every random outcome comes from real dice and lands in an append-only
 *    ledger with an id.** A number with no id was invented. The id's prefix
 *    encodes what kind of roll it was, so a fabricated citation resolves to the
 *    wrong kind and says so.
 * 2. **State lives on disk as markdown**, so it survives `/compact`, `/reload`,
 *    a new session and a week off.
 * 3. **A campaign banner is re-injected into the system prompt every turn**, so
 *    the GM cannot forget whose game it is or what the player's HP is after a
 *    compaction.
 *
 * All the logic lives in `@portents/core`. This file is a harness adapter: it
 * turns tool calls into library calls and library results into text. Anything
 * here that starts to look like a rule of play belongs in the library instead,
 * where it can be tested without a harness.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { availableSystems as listSystems, GUIDANCE_TOPICS, guidanceTopic, sessionGuidance } from "./guidance.ts";
import {
	analyze,
	appendToSection,
	Campaign,
	type CampaignDeps,
	chanceOf,
	createPile,
	createRegistry,
	defaultRandomSource,
	describeRules,
	drawEphemeral,
	drawFromPile,
	type EventKind,
	formatCard,
	formatDistribution,
	formatRoll,
	formatTableResult,
	generateDungeon,
	isSecretKind,
	KNOWN_SYSTEMS,
	knownSystem,
	type Likelihood,
	LIKELIHOODS,
	MAX_REPEATS,
	oracleAnswer,
	ORACLE_KINDS,
	parseTileSet,
	type OracleKind,
	pileStatus,
	recentlyDrawn,
	renderAsciiView,
	roll,
	rollTable,
	setSection,
	splitRepeat,
	statusDigest,
	seededRandomSource,
	systemClock,
	createView,
	revealAll,
	WORLD_SECTIONS,
	type WorldSection,
} from "@portents/core";
import { openHomeStorage, portentsHome } from "@portents/core/node";
import { commonContent, decks, dungeonTiles, tables } from "@portents/content";

export default function activate(pi: ExtensionAPI): void {
	const storage = openHomeStorage();
	// Built once: createRegistry validates ids, applies each pack's declared
	// overrides, and gives the "available: ..." lists that broken references print.
	const registry = createRegistry(commonContent);
	const deps: CampaignDeps = { storage, clock: systemClock, random: defaultRandomSource(), registry };

	/** The open campaign, or undefined. Re-resolved on session start. */
	let campaign: Campaign | undefined;

	// ── Harness plumbing ─────────────────────────────────────────────────────

	function text(body: string, details: Record<string, unknown> = {}) {
		return { content: [{ type: "text" as const, text: body }], details };
	}

	function requireCampaign(): Campaign {
		if (!campaign) {
			throw new Error(
				'No campaign loaded. Use portents_campaign with action "list" to see saved campaigns, or "create" to start one.',
			);
		}
		return campaign;
	}

	/** Totals line under a batch of rolls, so a set of six reads at a glance. */
	function summariseBatch(totals: number[]): string {
		if (totals.length < 2) return "";
		const sum = totals.reduce((a, b) => a + b, 0);
		const sorted = [...totals].sort((a, b) => b - a);
		return `\n\nTotals: ${totals.join(", ")} · sum ${sum} · sorted ${sorted.join(", ")}`;
	}

	async function showStatus(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) return;
		if (!campaign) {
			ctx.ui.setStatus("portents", undefined);
			ctx.ui.setWidget("portents", []);
			return;
		}
		ctx.ui.setStatus("portents", `🎲 ${campaign.name} (${campaign.systemLine})`);
		const pending = campaign.pendingRoll;
		ctx.ui.setWidget(
			"portents",
			pending
				? [`🎲 Owed: ${pending.expression} — ${pending.reason}${pending.dc ? ` vs DC ${pending.dc}` : ""}`]
				: [],
		);
	}

	/**
	 * Roll and record in one step.
	 *
	 * Every path that produces a number goes through here, so there is no way to
	 * put a die result in front of the player without it reaching the ledger.
	 */
	async function rollAndRecord(
		expression: string,
		options: { kind?: EventKind; actor?: string; reason?: string; dc?: number },
	): Promise<{ text: string; id: string; total: number }> {
		const active = requireCampaign();
		const result = roll(expression, { rng: deps.random });
		const outcome = options.dc === undefined ? undefined : result.total >= options.dc ? "success" : "failure";
		const entry = await active.ledger.append({
			kind: options.kind ?? "roll",
			...(options.actor ? { actor: options.actor } : {}),
			...(options.reason ? { reason: options.reason } : {}),
			request: expression,
			result: formatRoll(result),
			total: result.total,
			...(options.dc === undefined ? {} : { dc: options.dc }),
			...(outcome ? { outcome } : {}),
			data: {
				groups: result.groups.map((group) => ({
					die: `${group.die.count}d${group.die.sides}`,
					rolls: group.rolls,
					kept: group.kept,
				})),
				hasMax: result.hasMax ?? false,
				hasMin: result.hasMin ?? false,
			},
		});
		await active.bumpCounter("rolls");
		const verdict = outcome ? ` — **${outcome}** vs DC ${options.dc}` : "";
		return { text: `\`${entry.id}\` ${formatRoll(result)}${verdict}`, id: entry.id, total: result.total };
	}

	/**
	 * Draw and record in one step, so no caller can produce a card the ledger
	 * never saw. `/draw` used to bypass the tool's append and left the draw
	 * counter ahead of the ledger.
	 */
	async function drawAndRecord(active: Campaign, deck: Parameters<Campaign["draw"]>[0], count: number) {
		const result = await active.draw(deck, count);
		const entry = await active.ledger.append({
			kind: "card",
			request: deck.id,
			result: result.cards.map((card) => card.name).join(", "),
			data: { deck: deck.id, cards: result.cards.map((card) => card.name) },
		});
		return { result, entry };
	}

	/** Roll a repeat expression, recording each one. */
	async function rollBatch(
		input: string,
		options: { kind?: EventKind; actor?: string; reason?: string; dc?: number },
	): Promise<{ body: string; totals: number[] }> {
		const { times, expression } = splitRepeat(input);
		const results: Array<{ text: string; total: number }> = [];
		for (let i = 0; i < times; i++) results.push(await rollAndRecord(expression, options));
		const totals = results.map((result) => result.total);
		return { body: results.map((result) => result.text).join("\n") + summariseBatch(totals), totals };
	}

	// ── Tool activation ──────────────────────────────────────────────────────

	/**
	 * What is active before a game starts.
	 *
	 * Every tool is registered up front -- pi needs them in `getAllTools()` to use
	 * native deferred loading, which keeps the prompt prefix cached when the rest
	 * switch on. But only these two are *active*, so a session that is not a game
	 * carries two tool definitions instead of ten.
	 *
	 * `portents_campaign` is the way in, and its description carries the trigger text
	 * that used to live in a skill's frontmatter. `portents_roll` is here because
	 * "roll 3d6" is a reasonable thing to ask with no campaign loaded at all.
	 */
	const PRE_CAMPAIGN_TOOLS = ["portents_campaign", "portents_roll"] as const;

	/** The rest: only meaningful once there is a campaign to act on. */
	const PLAY_TOOLS = [
		"portents_ask_roll",
		"portents_odds",
		"portents_verify_roll",
		"portents_deck",
		"portents_table",
		"portents_oracle",
		"portents_map",
		"portents_sheet",
		"portents_guidance",
	] as const;

	/**
	 * Switch the play tools on. Idempotent, and additive on purpose.
	 *
	 * pi's docs are explicit that a non-additive change to the active set loses
	 * deferred loading, so this never removes anything -- including on a campaign
	 * switch, where the tools are already right.
	 */
	function activatePlayTools() {
		const active = pi.getActiveTools();
		const missing = PLAY_TOOLS.filter((name) => !active.includes(name));
		if (missing.length > 0) pi.setActiveTools([...active, ...missing]);
	}

	/**
	 * Take the play tools back out, leaving everything else alone.
	 *
	 * **Subtracts rather than replaces.** `pi.setActiveTools()` governs built-in tools
	 * as well as ours, so passing the pre-campaign list literally would switch off
	 * read, bash and everything else in the session. The only safe form is
	 * "whatever is active now, minus mine".
	 *
	 * This is the one non-additive call, which costs native deferred loading. It runs
	 * at session start before any model request, so there is no prefix to invalidate.
	 */
	function deactivatePlayTools() {
		const active = pi.getActiveTools();
		if (active.some((name) => (PLAY_TOOLS as readonly string[]).includes(name))) {
			pi.setActiveTools(active.filter((name) => !(PLAY_TOOLS as readonly string[]).includes(name)));
		}
	}

	/**
	 * The single funnel for "a campaign is now loaded".
	 *
	 * Every assignment goes through here so activation cannot be forgotten at one of
	 * the four call sites that load or create one.
	 */
	function setCampaign<T extends Campaign | undefined>(next: T): T {
		campaign = next;
		if (next) activatePlayTools();
		else deactivatePlayTools();
		return next;
	}

	// ── Session lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		setCampaign(undefined);
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "portents-active-campaign") {
				const slug = (entry.data as { slug: string | null })?.slug;
				if (slug) {
					try {
						// A resumed game re-activates the play tools, so picking a session back
						// up does not require starting a campaign again to get them.
						setCampaign(await Campaign.open(deps, slug));
					} catch {
						// A campaign deleted between sessions is not an error worth
						// crashing a session over; the briefing will say none is loaded.
						setCampaign(undefined);
					}
				}
			}
		}
		await showStatus(ctx);
	});

	/**
	 * The standing half of the briefing: everything that does not change while a
	 * campaign is loaded.
	 *
	 * This goes in the system prompt, and it is **byte-identical every turn** for as
	 * long as the campaign and system hold. That is the whole point. The system
	 * prompt is the front of the request, so anything volatile in it invalidates the
	 * provider's cached prefix on every single turn -- which is exactly what an
	 * earlier version of this file did, by putting HP, clocks and the last five
	 * ledger ids in here. A long session then pays full input price per turn on a
	 * transcript that only grows.
	 *
	 * The rule that came out of it: stable content at the front, volatile content at
	 * the end. See {@link volatileDigest}.
	 */
	function standingBriefing(active: Campaign): string {
		return [
			"# Active tabletop session",
			`Campaign: **${active.name}** (\`${active.slug}\`) · ${describeRules(active.system, active.edition)}`,
			`Files: \`${portentsHome()}/${active.keys.dir}\` — campaign.md, world.md, journal.md, characters/, maps/`,
			"",
			"Rules for this session that override your usual habits:",
			"- Never state a die result, card, or random outcome you did not get from a portents_* tool.",
			"- **Cite the ledger id only for mechanics the player can see happening to their character**: attack rolls, damage, saves, checks against a DC. Write it inline, e.g. \`19 to hit [h-42]\`.",
			"- **Never cite an id, name a tool, or describe the mechanism for world-generation randomness**: oracle answers, scene checks, table rolls, card draws. Those are your private scaffolding. Translate the result into fiction and say nothing about where it came from. Phrases like “the dice decided”, “the oracle says” or “scene: skewed” break the game. The ledger is the audit trail; the player can run /portents-status to look.",
			"- Rolls that belong to the player are asked for with portents_ask_roll, never rolled for them.",
			"- Update the sheet and journal on disk as play happens, not at the end.",
			"",
			"---",
			"",
			sessionGuidance(registry, active.system, active.edition),
		].join("\n");
	}

	/**
	 * The changing half: state as of this turn.
	 *
	 * Delivered as an injected message rather than in the system prompt, so it lands
	 * at the END of the request where it cannot invalidate the prefix in front of it.
	 * pi stores injected messages in the session, so this still survives a
	 * compaction -- which was the reason the whole briefing was re-injected in the
	 * first place.
	 *
	 * Returns undefined when there is nothing worth saying, so a quiet turn injects
	 * nothing at all.
	 */
	async function volatileDigest(active: Campaign): Promise<string | undefined> {
		const lines: string[] = [];

		if (knownSystem(active.system) && !active.edition) {
			const printings = KNOWN_SYSTEMS.find((system) => system.id === active.system.toLowerCase())?.editions ?? [];
			if (printings.length > 0) {
				lines.push(
					`**Printing not recorded.** Ask the player which they want — ${printings.join(" or ")} — ` +
						'then set it with portents_campaign action "system".',
				);
			}
		}

		const character = active.activeCharacter;
		if (character) {
			const sheet = await active.readCharacter(character);
			lines.push(
				sheet
					? `Character: \`${character}\` — ${statusDigest(sheet) || "no status recorded"}`
					: `Character: \`${character}\` — **sheet missing on disk**`,
			);
		} else {
			lines.push("Character: **none yet — build one with portents_sheet before play starts**");
		}

		const scene = active.scene;
		if (scene) {
			lines.push(
				`Scene: ${[scene.summary, scene.location, scene.time, scene.tension].filter(Boolean).join(" · ")}`,
			);
		}
		const clocks = active.clocks;
		if (clocks.length > 0) {
			lines.push(`Clocks: ${clocks.map((clock) => `${clock.name} ${clock.filled}/${clock.segments}`).join(" · ")}`);
		}
		const pending = active.pendingRoll;
		if (pending) {
			lines.push(
				`**Waiting on the player** for ${pending.expression} (${pending.reason}). ` +
					"Do not roll it for them and do not assume a result.",
			);
		}
		const recent = active.ledger.recent(5);
		if (recent.length > 0) {
			lines.push(`Recent results: ${recent.map((entry) => `\`${entry.id}\` ${entry.result}`).join(" · ")}`);
		}

		if (lines.length === 0) return undefined;
		return [`## Session state — ${active.name}`, ...lines].join("\n");
	}

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!campaign) return;
		const digest = await volatileDigest(campaign);
		return {
			systemPrompt: `${event.systemPrompt}\n\n${standingBriefing(campaign)}`,
			...(digest ? { message: { customType: "portents-state", content: digest, display: false } } : {}),
		};
	});

	// No skill is contributed, deliberately.
	//
	// A skill would be loaded in every session whether or not anyone is playing, and
	// its only real job was to be *found* when someone asks to play. A tool
	// description does that job already, so the trigger text lives on
	// `portents_campaign` and the GM guidance is injected when a game actually starts.
	// That also retires a bug: the old skill path came from `new URL(...).pathname`,
	// which percent-encodes, so any user whose checkout contained a space got a path
	// that did not resolve.

	// ── Rolling ──────────────────────────────────────────────────────────────

	const ROLL_KINDS = ["roll", "hit", "damage", "skill", "save", "death-save", "initiative"] as const;

	pi.registerTool({
		name: "portents_roll",
		label: "Roll dice",
		description: [
			"Roll dice and log the result to the campaign ledger. Use for anything the GM rolls:",
			"monster attacks, damage, saves for NPCs, random checks.",
			"Do NOT use for rolls that belong to the player — use portents_ask_roll for those.",
			'Notation: 4d6kh3, 2d20kh1 (advantage), 2d20kl1 (disadvantage), 1d8+3, 1d6x (explode), 4d6r1,',
			"1d20min10, 5d10cs>=7, d%, 4dF, floor((2d6+3)/2), 8d6 # fireball.",
			"A leading count repeats the whole expression: 6#4d6kh3 rolls six ability scores.",
			"Every result comes back with a ledger id like `h-42`. Cite it when the player can see the mechanic land.",
		].join(" "),
		promptSnippet: "Roll dice for anything the GM decides; cite the returned id",
		promptGuidelines: [
			"Use portents_roll for every die the GM rolls, and never write a result you did not get back from it.",
			"Use a leading repeat count with portents_roll for a set of identical rolls, e.g. 6#4d6kh3, rather than calling it six times.",
		],
		parameters: Type.Object({
			expression: Type.String({ description: 'Dice expression, e.g. "2d20kh1+5"' }),
			kind: Type.Optional(
				StringEnum(ROLL_KINDS, {
					description: "What sort of roll, which sets the ledger id prefix. Defaults to a generic roll.",
				}),
			),
			actor: Type.Optional(Type.String({ description: 'Who is rolling, e.g. "goblin archer"' })),
			reason: Type.Optional(Type.String({ description: "What this roll is for" })),
			dc: Type.Optional(Type.Number({ description: "Target number; the result reports success or failure" })),
		}),
		async execute(_id, params) {
			requireCampaign();
			const { body } = await rollBatch(params.expression, {
				kind: params.kind as EventKind | undefined,
				actor: params.actor ?? "gm",
				reason: params.reason,
				dc: params.dc,
			});
			return text(body);
		},
	});

	pi.registerTool({
		name: "portents_ask_roll",
		label: "Ask player to roll",
		description: [
			"Ask the human player to roll their own dice. Puts a dialog on their screen: they confirm to roll it,",
			"or cancel to do something else instead.",
			"Use for the player character's attacks, damage, ability checks, saving throws, death saves,",
			"initiative and hit dice.",
			"The result comes back in this tool's own result, so narrate it straight away — but if the player",
			"cancels, they have chosen a different action: ask what they do instead and do not roll it for them.",
		].join(" "),
		promptSnippet: "Ask the human player to roll; they confirm or decline in a dialog",
		promptGuidelines: [
			"Use portents_ask_roll for any roll belonging to the player's character rather than rolling it yourself.",
			"portents_ask_roll returns the player's result directly, so narrate the outcome in the same turn; if it reports they declined, ask what they do instead rather than rolling it yourself.",
		],
		parameters: Type.Object({
			expression: Type.String({ description: 'What they should roll, e.g. "1d20+5"' }),
			reason: Type.String({ description: 'What it is for, e.g. "Stealth past the sentry"' }),
			kind: Type.Optional(StringEnum(ROLL_KINDS, { description: "What sort of roll, for the ledger id prefix" })),
			dc: Type.Optional(Type.Number({ description: "The DC, if the player is allowed to know it" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const active = requireCampaign();
			const dc = params.dc ? ` (DC ${params.dc})` : "";
			const kind = (params.kind as EventKind | undefined) ?? "roll";

			// Recorded before asking, so a crash mid-dialog leaves the request
			// recoverable rather than lost.
			await active.setPendingRoll({
				expression: params.expression,
				reason: params.reason,
				kind,
				dc: params.dc,
			});
			await showStatus(ctx);

			if (!ctx.hasUI) {
				return text(
					`Asked the player to roll \`${params.expression}\` for ${params.reason}${dc}. ` +
						"No interactive UI, so they will run /roll themselves. Stop here and wait — do not narrate an outcome yet.",
					{ pending: true },
				);
			}

			const confirmed = await ctx.ui.confirm(
				`🎲 ${params.reason}${dc}`,
				`The GM asks for ${params.expression}. Confirm to roll it, or cancel to do something else.`,
				{ signal },
			);

			if (!confirmed) {
				// Cancelling is a choice, not a failure. Clearing it stops the next
				// /roll answering a request the player already declined.
				await active.setPendingRoll(undefined);
				await showStatus(ctx);
				return text(
					`The player declined to roll ${params.expression} for ${params.reason}. ` +
						"They want to do something else instead. Ask what they do — do not roll it for them, " +
						"and do not narrate the action as attempted.",
					{ declined: true },
				);
			}

			let body: string;
			try {
				({ body } = await rollBatch(params.expression, {
					kind,
					actor: active.activeCharacter ?? "player",
					reason: params.reason,
					dc: params.dc,
				}));
			} catch (error) {
				// Clear it: a request nobody can answer would otherwise be resolved by
				// the player's next unrelated /roll.
				await active.setPendingRoll(undefined);
				await showStatus(ctx);
				return text(
					`Could not roll \`${params.expression}\`: ${(error as Error).message}. Fix the expression and ask again.`,
					{ error: true },
				);
			}

			await active.setPendingRoll(undefined);
			await showStatus(ctx);
			return text(`The player rolled for ${params.reason}${dc}:\n${body}\n\nResolve it now.`);
		},
	});

	pi.registerTool({
		name: "portents_odds",
		label: "Dice odds",
		description: [
			"Probability of a dice expression: mean, spread, and the chance of meeting a DC.",
			"Use when deciding whether an encounter or DC is fair, not during narration.",
		].join(" "),
		parameters: Type.Object({
			expression: Type.String(),
			dc: Type.Optional(Type.Number({ description: "Report the chance of rolling at least this" })),
		}),
		async execute(_id, params) {
			const distribution = analyze(params.expression);
			const lines = [formatDistribution(distribution, params.expression)];
			if (params.dc !== undefined) {
				const chance = chanceOf(distribution, params.dc, "atLeast");
				lines.push(`Chance of ${params.dc} or more: **${(chance * 100).toFixed(1)}%**`);
			}
			return text(lines.join("\n\n"));
		},
	});

	pi.registerTool({
		name: "portents_guidance",
		label: "GM guidance",
		description: [
			"Read deeper GM guidance on one topic. The standing guidance is already in your context;",
			"this is the detail that is not needed every turn.",
			`Topics: ${GUIDANCE_TOPICS.join(", ")}.`,
			"Read a topic when it is about to matter — character-creation before building a sheet,",
			"combat at the start of a fight — rather than up front.",
		].join(" "),
		parameters: Type.Object({
			topic: StringEnum([...GUIDANCE_TOPICS]),
		}),
		async execute(_id, params: { topic: string }) {
			const body = guidanceTopic(params.topic);
			if (!body) {
				// Reported rather than thrown: the GM can carry on without it.
				return text(
					`No guidance file for **${params.topic}** is installed. Run the session on the standing ` +
						"guidance you already have, and tell the player the reference is missing if it matters.",
				);
			}
			return text(body);
		},
	});

	pi.registerTool({
		name: "portents_verify_roll",
		label: "Verify a roll",
		description: [
			"Look up a ledger id to confirm a roll, draw or oracle answer really happened and what it produced.",
			"Use when the player challenges a number, or when resuming and you want to check a result you cited.",
		].join(" "),
		parameters: Type.Object({ id: Type.String({ description: 'Ledger id, e.g. "h-42"' }) }),
		async execute(_id, params) {
			return text(requireCampaign().ledger.describe(params.id));
		},
	});

	// ── Content ──────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "portents_deck",
		label: "Draw cards",
		description: [
			"Draw from a content deck. With a campaign loaded, each deck keeps a real draw pile: a drawn card",
			"stays gone until the deck is reshuffled, and the pile persists across sessions.",
			'Call with action "list" first if you are unsure of the deck ids.',
		].join(" "),
		promptGuidelines: [
			"Use portents_deck rather than inventing card results. Keep GM-facing draws hidden and narrate only their effect; a crit or fumble card that resolves the player's own attack can be named, because they watched it happen.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "draw", "shuffle", "status", "recent"]),
			deck: Type.Optional(Type.String({ description: "Deck id, e.g. crit-hits" })),
			count: Type.Optional(Type.Number({ description: "How many cards to draw (default 1)" })),
			ephemeral: Type.Optional(
				Type.Boolean({ description: "Draw without consuming the saved pile. Use for one-off inspiration." }),
			),
		}),
		async execute(_id, params) {
			if (params.action === "list") {
				return text(
					["Decks:", ...decks.map((deck) => `- \`${deck.id}\` — ${deck.name}: ${deck.description}`)].join("\n"),
				);
			}
			const deck = decks.find((candidate) => candidate.id === params.deck);
			if (!deck) {
				throw new Error(
					`Unknown deck ${JSON.stringify(params.deck)}. Available: ${decks.map((d) => d.id).join(", ")}`,
				);
			}
			const active = campaign;

			// Only a draw may fall back to an ephemeral draw. Asking for status or a
			// shuffle used to hand back a random card, which reads as a real result.
			if (params.action === "draw" && (params.ephemeral || !active)) {
				const cards = drawEphemeral(deck, { count: params.count ?? 1, rng: deps.random });
				return text(cards.map((card) => formatCard(card)).join("\n\n"));
			}
			if (!active) {
				throw new Error(
					`"${params.action}" needs a loaded campaign, because the draw pile belongs to the campaign. ` +
						'Load one, or use action "draw" with ephemeral: true.',
				);
			}

			switch (params.action) {
				case "shuffle": {
					await active.reshuffle(deck);
					return text(`Shuffled **${deck.name}**. All ${deck.cards.length} cards are back in the pile.`);
				}
				case "status": {
					const pile = (await active.pileFor(deck)) ?? createPile(deck, { rng: deps.random });
					const status = pileStatus(deck, pile);
					return text(
						`**${deck.name}**: ${status.remaining} of ${status.total} left, ${status.discarded} discarded.`,
					);
				}
				case "recent": {
					const pile = await active.pileFor(deck);
					if (!pile) return text(`Nothing drawn from **${deck.name}** yet.`);
					const cards = recentlyDrawn(deck, pile, params.count ?? 5);
					return text(
						cards.length === 0
							? `Nothing drawn from **${deck.name}** yet.`
							: cards.map((card) => `- ${card.name}`).join("\n"),
					);
				}
				default: {
					const { result, entry } = await drawAndRecord(active, deck, params.count ?? 1);
					const note = result.reshuffled ? "\n\n_The deck ran out and was reshuffled._" : "";
					const remaining = `\n\n_${result.remaining} of ${result.total} left._`;
					return text(
						`${result.cards.map((card) => formatCard(card)).join("\n\n")}${note}${remaining}`,
						{ id: entry.id },
					);
				}
			}
		},
	});

	pi.registerTool({
		name: "portents_table",
		label: "Roll a table",
		description: [
			"Roll on a random content table: encounters, weather, rumours, names, quest hooks, dungeon dressing,",
			"room purpose, traps, treasure, NPC mannerisms, GM moves. Entries can pull in other tables, so one",
			'roll can produce a composed result. Call with action "list" to see the table ids.',
			"Prefer this over inventing content: it keeps the world's texture out of your own defaults.",
		].join(" "),
		promptGuidelines: [
			"Use portents_table for random world content rather than inventing it, and keep the result behind the curtain: describe what it means in the fiction without quoting the entry, naming the table, or citing its ledger id to the player.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "roll"]),
			table: Type.Optional(Type.String({ description: "Table id, e.g. encounters-dungeon" })),
			count: Type.Optional(Type.Number({ description: "Roll this many times (max 10)" })),
		}),
		async execute(_id, params) {
			if (params.action === "list") {
				return text(
					["Tables:", ...tables.map((table) => `- \`${table.id}\` — ${table.name}`)].join("\n"),
				);
			}
			const table = tables.find((candidate) => candidate.id === params.table);
			if (!table) {
				throw new Error(
					`Unknown table ${JSON.stringify(params.table)}. Available: ${tables.map((t) => t.id).join(", ")}`,
				);
			}
			const count = Math.max(1, Math.min(params.count ?? 1, 10));
			const results: string[] = [];
			for (let i = 0; i < count; i++) {
				// rollTable already resolves nested {{table:}} references.
				results.push(formatTableResult(rollTable(table, { rng: deps.random, registry })));
			}
			if (campaign) {
				await campaign.ledger.append({
					kind: "table",
					request: table.id,
					result: results.join(" | "),
					data: { table: table.id },
				});
			}
			return text(results.map((result) => `- ${result}`).join("\n"));
		},
	});

	pi.registerTool({
		name: "portents_oracle",
		label: "Ask the oracle",
		description: [
			"Answer a question about the world you have not already decided, using dice instead of your own",
			"judgement. This is what keeps solo play honest: when the player asks something you have no",
			"prepared answer for, roll for it rather than choosing whatever suits the story.",
		].join(" "),
		promptGuidelines: [
			"Use portents_oracle whenever the player asks about something you have not already established, instead of deciding what is convenient.",
			'Use portents_oracle with kind "scene" before framing a new scene, and kind "gm_move" when a roll fails and you need a consequence.',
			"Keep portents_oracle results hidden: narrate what they mean in the fiction and never quote the answer, the label, the ledger id, or the fact that dice were consulted.",
		],
		parameters: Type.Object({
			kind: StringEnum(ORACLE_KINDS),
			question: Type.Optional(Type.String({ description: "The question, for yes_no" })),
			likelihood: Type.Optional(StringEnum(LIKELIHOODS, { description: "How likely a yes is" })),
			expression: Type.Optional(Type.String({ description: 'Dice for how_many, e.g. "2d6"' })),
			modifier: Type.Optional(Type.Number({ description: "Modifier for a reaction roll" })),
		}),
		async execute(_id, params) {
			const answer = oracleAnswer({
				kind: params.kind as OracleKind,
				question: params.question,
				likelihood: params.likelihood as Likelihood | undefined,
				expression: params.expression,
				modifier: params.modifier,
				rng: deps.random,
				registry,
			});
			if (campaign) {
				await campaign.ledger.append({
					kind: "oracle",
					request: params.kind,
					reason: params.question,
					result: answer.text,
				});
			}
			// No ledger id in the body: an oracle answer is the GM's scaffolding, and
			// an id in the text is an invitation to cite it.
			return text(answer.text);
		},
	});

	pi.registerTool({
		name: "portents_map",
		label: "Generate a dungeon",
		description: [
			"Generate a rooms-and-corridors dungeon as a text grid, built from 7x7 tiles that are connected by",
			"construction rather than by luck. Seeded, so the same seed regenerates the same dungeon exactly.",
			"Show the player the grid; it reads fine in a terminal.",
			"Caves, wilderness hexes and settlements are not available yet.",
		].join(" "),
		parameters: Type.Object({
			rooms: Type.Optional(Type.Number({ description: "Target room count (default 6)" })),
			seed: Type.Optional(Type.String({ description: "Reuse a seed to regenerate an existing dungeon" })),
			save_as: Type.Optional(Type.String({ description: "Save to the campaign's maps/ directory" })),
		}),
		async execute(_id, params) {
			const seed = params.seed ?? `m-${Date.now().toString(36)}`;
			// Lattice dimensions rather than a room count: the generator carves a
			// spanning tree over the lattice, so the grid is what it takes.
			const side = Math.max(2, Math.min(Math.ceil(Math.sqrt(params.rooms ?? 6)), 5));
			const dungeon = generateDungeon(parseTileSet(dungeonTiles), {
				cols: side,
				rows: side,
				seed,
				rng: seededRandomSource(seed),
			});
			const view = revealAll(createView(dungeon.map));
			const rendered = renderAsciiView(view);
			if (params.save_as && campaign) {
				await storage.write(campaign.keys.map(params.save_as), `${rendered}\n`);
				await campaign.ledger.append({
					kind: "map",
					request: "dungeon",
					result: `seed ${seed}`,
					data: { seed, savedAs: params.save_as, cols: dungeon.map.cols, rows: dungeon.map.rows },
				});
			}
			return text(`\`\`\`\n${rendered}\n\`\`\`\n\n_Seed: \`${seed}\`_`);
		},
	});

	// ── Campaign ─────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "portents_campaign",
		label: "Campaign state",
		description: [
			"Start, resume or update a solo tabletop RPG game, and run it as GM for one human player.",
			"**Use this when the player asks to play D&D or Pathfinder, run a one-shot or a campaign, start or",
			"resume a solo adventure, be their DM or GM, make a character, or continue a game already in",
			"progress.** Covers D&D 5E (both printings), Pathfinder 2E (remaster and legacy), Pathfinder 1E and",
			"generic d20 fantasy.",
			"Starting or loading a campaign activates the rest of the portents_* tools — dice, decks, oracles,",
			"tables, maps, character sheets — and briefs you on how to run a session, so you do not need to",
			"know any of that in advance.",
			"Everything a human would read is markdown under",
			`\`${portentsHome()}\`.`,
			'Actions: "list" saved campaigns; "create" a new one; "load" one into this session; "brief" to',
			'recover context after a compaction or a break; "journal" to append what just happened; "scene" to',
			'record where the party is; "clock" to set a countdown; "world" to append NPCs, places or threads;',
			'"system" to record which rules and printing are in play.',
			"Write to the journal at the end of every scene, not at the end of the session.",
		].join(" "),
		promptGuidelines: [
			'Use portents_campaign with action "brief" at the start of a resumed game, or any time you are unsure of the current state, instead of guessing from the conversation.',
			'Use portents_campaign with action "journal" after each scene so the game survives a new session.',
		],
		parameters: Type.Object({
			action: StringEnum(["list", "create", "load", "brief", "journal", "scene", "clock", "world", "system"]),
			name: Type.Optional(Type.String({ description: "Campaign name (create) or slug (load)" })),
			system: Type.Optional(
				Type.String({ description: 'Rules and printing, freeform: "5e (2024)", "Call of Cthulhu 7e"' }),
			),
			premise: Type.Optional(Type.String()),
			tone: Type.Optional(Type.String()),
			safety: Type.Optional(Type.String({ description: "Lines and veils agreed with the player" })),
			heading: Type.Optional(Type.String({ description: "Journal entry heading" })),
			body: Type.Optional(Type.String({ description: "Journal or world text to append (markdown)" })),
			section: Type.Optional(StringEnum(WORLD_SECTIONS)),
			summary: Type.Optional(Type.String({ description: "Scene summary" })),
			location: Type.Optional(Type.String()),
			time: Type.Optional(Type.String()),
			tension: Type.Optional(Type.String()),
			clock_name: Type.Optional(Type.String()),
			filled: Type.Optional(Type.Number()),
			segments: Type.Optional(Type.Number()),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			switch (params.action) {
				case "list": {
					const list = await Campaign.list(deps);
					// The systems on offer come with the list, because session zero happens
					// before a campaign exists and therefore before any system guidance is
					// loaded. Generated from the registry, so a content pack someone installs
					// later shows up here without this file changing.
					const systems = [
						"",
						"Systems available in this installation:",
						...listSystems(registry).map((entry) => `- ${entry}`),
						"",
						"Where a system has more than one printing the newer one is the default. Take it unless",
						"the player asks for the older, state which you are using in one clause, and record it.",
					];
					if (list.length === 0) {
						return text([`No campaigns yet under \`${portentsHome()}\`.`, ...systems].join("\n"));
					}
					return text(
						[
							"Campaigns:",
							...list.map(
								(entry) =>
									`- \`${entry.slug}\` — ${entry.name} (${entry.systemLine ?? entry.system})` +
									`${entry.scene ? ` · ${entry.scene}` : ""}`,
							),
							...systems,
						].join("\n"),
					);
				}
				case "create": {
					if (!params.name) throw new Error("Creating a campaign needs a name");
					if (!params.system) throw new Error('Creating a campaign needs a system, e.g. "5e (2024)"');
					const created = setCampaign(
						await Campaign.create(deps, {
							name: params.name,
							system: params.system,
							premise: params.premise,
							tone: params.tone,
							safety: params.safety,
						}),
					);
					pi.appendEntry("portents-active-campaign", { slug: created.slug });
					await showStatus(ctx);
					return text(
						`Created **${created.name}** (\`${created.slug}\`), ${describeRules(created.system, created.edition)}.\n\n` +
							`Files under \`${portentsHome()}/${created.keys.dir}\`. Build a character with portents_sheet before play starts.`,
					);
				}
				case "load": {
					if (!params.name) throw new Error("Loading a campaign needs its slug");
					const opened = setCampaign(await Campaign.open(deps, params.name));
					pi.appendEntry("portents-active-campaign", { slug: opened.slug });
					await showStatus(ctx);
					return text(await opened.brief());
				}
				case "brief":
					return text(await requireCampaign().brief());
				case "journal": {
					const active = requireCampaign();
					if (!params.heading) throw new Error("A journal entry needs a heading");
					await active.journal(params.heading, params.body ?? "");
					return text(`Journalled **${params.heading}**.`);
				}
				case "scene": {
					const active = requireCampaign();
					if (!params.summary) throw new Error("A scene needs a summary");
					await active.setScene({
						summary: params.summary,
						location: params.location,
						time: params.time,
						tension: params.tension,
					});
					await showStatus(ctx);
					return text(`Scene recorded: ${params.summary}`);
				}
				case "clock": {
					const active = requireCampaign();
					if (!params.clock_name) throw new Error("A clock needs a name");
					const clock = await active.setClock(
						params.clock_name,
						params.filled ?? 0,
						params.segments,
						params.body,
					);
					return text(`Clock **${clock.name}**: ${clock.filled}/${clock.segments}`);
				}
				case "world": {
					const active = requireCampaign();
					if (!params.section) throw new Error(`A world note needs a section: ${WORLD_SECTIONS.join(", ")}`);
					if (!params.body) throw new Error("A world note needs a body");
					await active.addToWorld(params.section as WorldSection, params.body);
					return text(`Added to **${params.section}**.`);
				}
				default: {
					const active = requireCampaign();
					if (!params.system) throw new Error('Recording the system needs a value, e.g. "5e (2024)"');
					await active.setSystem(params.system);
					await showStatus(ctx);
					return text(`System recorded: ${describeRules(active.system, active.edition)}`);
				}
			}
		},
	});

	pi.registerTool({
		name: "portents_sheet",
		label: "Character sheet",
		description: [
			"Read and write the character sheet, which is a markdown file in the campaign — never only in your",
			"context. Machine-readable values live in frontmatter; the `## Status` and `## Ability Scores`",
			"sections are generated from it. Everything else is ordinary markdown you can rewrite.",
			'Actions: "create" a new sheet; "read" it; "patch_status" to change HP, conditions, slots, gold and',
			'the like (values support deltas: "-7" off "22/26" gives "15/26"); "set_section" to replace a',
			'section; "append_section" to add to one; "list" the characters in this campaign.',
			"Patch the sheet the moment something changes: damage, healing, a spent slot, a new item.",
		].join(" "),
		promptGuidelines: [
			"Use portents_sheet to persist every change to the character: damage, healing, resources, inventory, level. The sheet on disk is the source of truth, not your memory of it.",
			'Use portents_sheet with action "create" before play begins; a session must not start without a sheet on disk.',
		],
		parameters: Type.Object({
			action: StringEnum(["create", "read", "patch_status", "set_section", "append_section", "list"]),
			character: Type.Optional(Type.String({ description: "Character name" })),
			concept: Type.Optional(Type.String({ description: 'e.g. "Level 3 Wood Elf Ranger (Hunter)"' })),
			status: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description: 'Status keys to set, e.g. {"HP": "-7"}. Deltas allowed.',
				}),
			),
			abilities: Type.Optional(
				Type.Record(Type.String(), Type.String(), { description: 'e.g. {"STR": "12 (+1)"}' }),
			),
			section: Type.Optional(Type.String({ description: "Section heading to set or append to" })),
			body: Type.Optional(Type.String({ description: "Markdown for the section" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const active = requireCampaign();

			if (params.action === "list") {
				const characters = await active.listCharacters();
				return text(
					characters.length === 0
						? "No characters in this campaign yet."
						: ["Characters:", ...characters.map((name) => `- ${name}`)].join("\n"),
				);
			}

			const name = params.character ?? active.activeCharacter;
			if (!name) throw new Error("Which character? Pass `character`, or create one first.");

			if (params.action === "create") {
				// No section list here on purpose: the campaign resolves one from the
				// content packs for its own system, and falls back to a generic scaffold.
				// A hardcoded list stamped 5E headings onto a Call of Cthulhu character.
				const sheet = await active.createCharacter({
					name,
					concept: params.concept,
					status: params.status,
					abilities: params.abilities,
				});
				const template = active.sheetTemplate();
				await showStatus(ctx);
				return text(
					`Created a sheet for **${name}**.\n\n${statusDigest(sheet) || "No status recorded yet."}` +
						(template?.generic
							? `\n\n_${template.note ?? "Generic scaffold used."}_`
							: ""),
				);
			}

			const sheet = await active.readCharacter(name);
			if (!sheet) throw new Error(`No character "${name}" in this campaign.`);

			switch (params.action) {
				case "read":
					return text(sheet.body ? `${statusDigest(sheet)}\n\n${sheet.body}` : statusDigest(sheet));
				case "patch_status": {
					if (!params.status) throw new Error("patch_status needs a `status` object");
					const patched = await active.patchCharacter(name, params.status);
					await showStatus(ctx);
					return text(`**${name}** — ${statusDigest(patched)}`);
				}
				default: {
					if (!params.section) throw new Error("That action needs a `section`");
					if (params.body === undefined) throw new Error("That action needs a `body`");
					const next =
						params.action === "set_section"
							? setSection(sheet, params.section, params.body)
							: appendToSection(sheet, params.section, params.body);
					await active.writeCharacter(next);
					return text(`Updated **${params.section}** on ${name}'s sheet.`);
				}
			}
		},
	});

	// ── Commands ─────────────────────────────────────────────────────────────

	pi.registerCommand("roll", {
		description: "Roll dice (Foundry notation). 6#4d6kh3 rolls six times. Shared with the GM during a game.",
		handler: async (args, ctx) => {
			const input = args.trim();
			if (!input) {
				ctx.ui.notify("Usage: /roll 2d20kh1+5 · /roll 6#4d6kh3 · /roll 4d6kh3 # stats · /roll d%", "info");
				return;
			}
			if (!campaign) {
				// Without a campaign there is nowhere to record it, so roll it plainly
				// rather than refusing: someone may just want a number.
				try {
					const { times, expression } = splitRepeat(input);
					const results = Array.from({ length: times }, () => roll(expression, { rng: deps.random }));
					ctx.ui.notify(results.map((result) => formatRoll(result)).join("\n"), "info");
				} catch (error) {
					ctx.ui.notify(`Bad dice expression: ${(error as Error).message}`, "error");
				}
				return;
			}

			const active = campaign;
			const pending = active.pendingRoll;
			let body: string;
			try {
				({ body } = await rollBatch(input, {
					kind: pending?.kind as EventKind | undefined,
					actor: active.activeCharacter ?? "player",
					reason: pending?.reason,
					dc: pending?.dc,
				}));
			} catch (error) {
				ctx.ui.notify(`Bad dice expression: ${(error as Error).message}`, "error");
				return;
			}

			if (pending) {
				await active.setPendingRoll(undefined);
				await showStatus(ctx);
				pi.sendMessage(
					{
						customType: "portents-roll",
						content: `**Player rolled**\n${body}\n\n_Requested for: ${pending.reason}${
							pending.dc ? ` (DC ${pending.dc})` : ""
						}. Resolve it now._`,
						display: true,
					},
					{ deliverAs: ctx.isIdle() ? "followUp" : "steer", triggerTurn: true },
				);
				return;
			}

			// An unprompted roll should appear at once, but must not make the GM
			// narrate at a d6 rolled out of idle curiosity. "nextTurn" would queue it
			// until the next ordinary message, which reads as a hung command.
			pi.sendMessage(
				{ customType: "portents-roll", content: `**Player rolled**\n${body}`, display: true },
				{ deliverAs: "followUp" },
			);
		},
	});

	pi.registerCommand("portents", {
		description: "Start or resume a tabletop session.",
		getArgumentCompletions: async (prefix) => {
			const list = await Campaign.list(deps);
			const items = list
				.map((entry) => ({ value: entry.slug, label: `${entry.slug} — ${entry.name}` }))
				.filter((item) => item.value.startsWith(prefix));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const slug = args.trim();
			if (!slug) {
				const list = await Campaign.list(deps);
				ctx.ui.notify(
					list.length === 0
						? "No campaigns yet. Ask the GM to create one."
						: `Campaigns: ${list.map((entry) => entry.slug).join(", ")}`,
					"info",
				);
				return;
			}
			let opened: Campaign;
			try {
				opened = setCampaign(await Campaign.open(deps, slug));
			} catch (error) {
				ctx.ui.notify((error as Error).message, "error");
				return;
			}
			pi.appendEntry("portents-active-campaign", { slug: opened.slug });
			await showStatus(ctx);
			pi.sendMessage(
				{ customType: "portents-brief", content: await opened.brief(), display: true },
				{ deliverAs: "followUp", triggerTurn: true },
			);
		},
	});

	pi.registerCommand("portents-status", {
		description: "Show the campaign's recent rolls and current state.",
		handler: async (_args, ctx) => {
			if (!campaign) {
				ctx.ui.notify("No campaign loaded.", "info");
				return;
			}
			const recent = campaign.ledger.recent(10);
			const lines = [
				`**${campaign.name}** — ${campaign.systemLine}`,
				`Rolls: ${campaign.counters.rolls} · draws: ${campaign.counters.draws}`,
				"",
				...(recent.length === 0
					? ["No rolls yet."]
					: recent.map(
							(entry) =>
								`\`${entry.id}\` ${entry.reason ?? entry.kind}: ${entry.result}` +
								(isSecretKind(entry.kind) ? " _(GM)_" : ""),
						)),
			];
			const problems = await campaign.problems();
			if (problems.length > 0) lines.push("", "Problems:", ...problems.map((problem) => `- ${problem}`));
			pi.appendEntry("portents-status", { text: lines.join("\n") });
			ctx.ui.notify(lines.slice(0, 3).join(" · "), "info");
		},
	});

	pi.registerCommand("sheet", {
		description: "Show the active character's sheet.",
		handler: async (_args, ctx) => {
			if (!campaign) {
				ctx.ui.notify("No campaign loaded.", "info");
				return;
			}
			const name = campaign.activeCharacter;
			if (!name) {
				ctx.ui.notify("No active character.", "info");
				return;
			}
			const sheet = await campaign.readCharacter(name);
			if (!sheet) {
				ctx.ui.notify(`No sheet on disk for ${name}.`, "error");
				return;
			}
			pi.appendEntry("portents-sheet", { text: sheet.body });
			ctx.ui.notify(`${name} — ${statusDigest(sheet)}`, "info");
		},
	});

	pi.registerCommand("draw", {
		description: "Draw a card from a deck.",
		getArgumentCompletions: (prefix) => {
			const items = decks
				.map((deck) => ({ value: deck.id, label: `${deck.id} — ${deck.name}` }))
				.filter((item) => item.value.startsWith(prefix));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const deck = decks.find((candidate) => candidate.id === args.trim());
			if (!deck) {
				ctx.ui.notify(`Decks: ${decks.map((candidate) => candidate.id).join(", ")}`, "info");
				return;
			}
			const cards = campaign
				? (await drawAndRecord(campaign, deck, 1)).result.cards
				: drawEphemeral(deck, { count: 1, rng: deps.random });
			pi.sendMessage(
				{
					customType: "portents-draw",
					content: `**Drew from ${deck.name}**\n\n${cards.map((card) => formatCard(card)).join("\n\n")}`,
					display: true,
				},
				{ deliverAs: "followUp" },
			);
		},
	});

	pi.registerCommand("oracle", {
		description: "Ask the oracle a yes/no question.",
		handler: async (args, ctx) => {
			const question = args.trim();
			if (!question) {
				ctx.ui.notify("Usage: /oracle is the gate still guarded?", "info");
				return;
			}
			const answer = oracleAnswer({ kind: "yes_no", question, rng: deps.random, registry });
			if (campaign) {
				await campaign.ledger.append({ kind: "oracle", request: "yes_no", reason: question, result: answer.text });
			}
			pi.sendMessage(
				{
					customType: "portents-oracle",
					content: `_Oracle, asked by the player:_ **${question}**\n\n${answer.text}`,
					display: true,
				},
				{ deliverAs: ctx.isIdle() ? "followUp" : "steer", triggerTurn: true },
			);
		},
	});
}
