/**
 * `portent` — dice, oracles, decks, tables and dungeon maps at the command line.
 *
 * Written so the whole thing is testable without a terminal: `run()` takes argv
 * and returns an exit code plus what it would have written, and the executable in
 * `bin/` is the only part that touches `process.stdout` or `process.exit`. That
 * boundary is the reason the tests can assert on output rather than on mocks.
 *
 * Two conventions the commands all share:
 *
 * - **Machine-readable on request.** Every command takes `--json`, because a
 *   dice roller is exactly the sort of thing people script against.
 * - **Randomness is reproducible on request.** Every command that consumes
 *   randomness takes `--seed`, so a bug report can carry the seed that caused it.
 */

import {
	analyze,
	chanceOf,
	createPile,
	createRegistry,
	defaultRandomSource,
	drawFromPile,
	formatCard,
	formatDistribution,
	formatRoll,
	formatTableResult,
	generateDungeon,
	LIKELIHOODS,
	type Likelihood,
	MAX_REPEATS,
	oracleAnswer,
	ORACLE_KINDS,
	type OracleKind,
	parseTileSet,
	type RandomSource,
	renderAsciiView,
	renderSvg,
	roll,
	rollTable,
	seededRandomSource,
	splitRepeat,
	createView,
	revealAll,
} from "@portent/core";
import { commonContent, decks, dungeonTiles, tables } from "@portent/content";
import { intFlag, parseArgs, stringFlag, UsageError } from "./args.ts";
import { bold, cyan, dim, plain, table } from "./format.ts";

export interface RunResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

const registry = createRegistry(commonContent, { allowOverride: true });

function ok(stdout: string): RunResult {
	return { code: 0, stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`, stderr: "" };
}

function fail(stderr: string, code = 1): RunResult {
	return { code, stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n` };
}

function json(value: unknown): RunResult {
	return ok(JSON.stringify(value, null, 2));
}

function sourceFor(seed: string | undefined): { rng: RandomSource; seed: string | undefined } {
	return seed === undefined ? { rng: defaultRandomSource(), seed: undefined } : { rng: seededRandomSource(seed), seed };
}

// ── portent roll ─────────────────────────────────────────────────────────────

function cmdRoll(argv: readonly string[]): RunResult {
	const { positional, flags } = parseArgs(argv, {
		value: ["seed", "dc", "times"],
		boolean: ["json", "verbose"],
	});
	const input = positional.join(" ").trim();
	if (!input) return fail("portent roll: needs a dice expression, e.g. `portent roll 2d20kh1+5`", 2);

	const dc = intFlag(flags, "dc");
	const { rng, seed } = sourceFor(stringFlag(flags, "seed"));
	const { times: prefixed, expression } = splitRepeat(input);
	const times = intFlag(flags, "times", { min: 1, max: MAX_REPEATS }) ?? prefixed;

	const results = Array.from({ length: times }, () => roll(expression, { rng }));

	if (flags.json) {
		return json({
			expression,
			times,
			seed,
			dc,
			results: results.map((result) => ({
				total: result.total,
				dice: result.groups.map((group) => ({
					die: `${group.die.count}d${group.die.sides}`,
					rolls: group.rolls,
					kept: group.kept,
				})),
				hasMax: result.hasMax ?? false,
				hasMin: result.hasMin ?? false,
				...(dc === undefined ? {} : { outcome: result.total >= dc ? "success" : "failure" }),
			})),
			...(times > 1 ? { sum: results.reduce((a, r) => a + r.total, 0) } : {}),
		});
	}

	const lines = results.map((result) => {
		const verdict = dc === undefined ? "" : result.total >= dc ? `  ${bold("success")}` : `  ${dim("failure")}`;
		return `${plain(formatRoll(result))}${verdict}`;
	});
	if (times > 1) {
		const totals = results.map((result) => result.total);
		lines.push(
			"",
			dim(
				`Totals: ${totals.join(", ")} · sum ${totals.reduce((a, b) => a + b, 0)} · sorted ${[...totals]
					.sort((a, b) => b - a)
					.join(", ")}`,
			),
		);
	}
	if (seed) lines.push(dim(`Seed: ${seed}`));
	return ok(lines.join("\n"));
}

// ── portent odds ─────────────────────────────────────────────────────────────

function cmdOdds(argv: readonly string[]): RunResult {
	const { positional, flags } = parseArgs(argv, { value: ["dc"], boolean: ["json"] });
	const expression = positional.join(" ").trim();
	if (!expression) return fail("portent odds: needs a dice expression, e.g. `portent odds 4d6kh3`", 2);

	const distribution = analyze(expression);
	const dc = intFlag(flags, "dc");

	if (flags.json) {
		return json({
			expression,
			min: distribution.min,
			max: distribution.max,
			mean: distribution.mean,
			stdDev: distribution.stdDev,
			simulated: distribution.isSimulated,
			...(dc === undefined ? {} : { dc, atLeast: chanceOf(distribution, dc, "atLeast") }),
			probabilities: Object.fromEntries([...distribution.probabilities].sort((a, b) => a[0] - b[0])),
		});
	}

	const lines = [plain(formatDistribution(distribution, expression))];
	if (dc !== undefined) {
		const chance = chanceOf(distribution, dc, "atLeast");
		lines.push("", `Chance of ${dc} or more: ${bold(`${(chance * 100).toFixed(1)}%`)}`);
	}
	return ok(lines.join("\n"));
}

// ── portent map ──────────────────────────────────────────────────────────────

interface MapOutput {
	readonly ascii: string;
	readonly svg: string;
	readonly seed: string;
	readonly cols: number;
	readonly rows: number;
}

export function buildMap(options: { rooms?: number; seed?: string }): MapOutput {
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
		// The library's own renderer, not a picture of the text. The tile suite
		// already proves the two projections describe the same tile, so this cannot
		// disagree with the ASCII printed beside it -- which was the only reason to
		// consider rendering the characters instead.
		svg: renderSvg(dungeon.map),
		seed,
		cols: dungeon.map.cols,
		rows: dungeon.map.rows,
	};
}

async function cmdMap(argv: readonly string[]): Promise<RunResult> {
	const { flags } = parseArgs(argv, { value: ["rooms", "seed", "out", "png", "svg"], boolean: ["json"] });
	const map = buildMap({
		rooms: intFlag(flags, "rooms", { min: 2, max: 36 }),
		seed: stringFlag(flags, "seed"),
	});

	const out = stringFlag(flags, "out");
	const png = stringFlag(flags, "png");
	const written: string[] = [];

	if (out) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(out, `${map.ascii}\n`, "utf8");
		written.push(out);
	}
	const svgPath = stringFlag(flags, "svg");
	if (svgPath) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(svgPath, `${map.svg}\n`, "utf8");
		written.push(svgPath);
	}
	if (png) {
		const result = await writePng(map, png);
		if (!result.ok) return fail(result.message, 1);
		written.push(png);
	}

	// The SVG is omitted from --json unless it was asked for: a caller wanting the
	// grid should not have to page past a vector document to find it.
	if (flags.json) {
		const { svg, ...rest } = map;
		return json({ ...rest, written, ...(svgPath ? { svg } : {}) });
	}

	const lines = [map.ascii, "", dim(`Seed: ${map.seed}  ·  ${map.cols}x${map.rows} tiles`)];
	for (const path of written) lines.push(dim(`Wrote ${path}`));
	return ok(lines.join("\n"));
}

/**
 * Rasterise to PNG.
 *
 * `@resvg/resvg-js` is an **optional** dependency with a native binary, so it is
 * imported only here and only when `--png` is used. Someone who never wants a
 * PNG should not be made to compile one, and `@portent/core` must not carry a
 * native binary in its dependency tree at all.
 */
/**
 * Exported so it can be tested where resvg is installed.
 *
 * With the dependency present the failure branch never runs, so a mutation that
 * replaced this whole message with `String(error)` passed the suite. Naming it
 * lets the message itself be pinned.
 */
export const MISSING_RASTERISER = [
	"portent map --png needs @resvg/resvg-js, which is not installed.",
	"",
	"  It is an optional dependency because it ships a native binary, so a",
	"  text-only install does not pay for it.",
	"",
	"  pnpm add @resvg/resvg-js",
].join("\n");

async function writePng(map: MapOutput, path: string): Promise<{ ok: true } | { ok: false; message: string }> {
	let Resvg: typeof import("@resvg/resvg-js").Resvg;
	try {
		({ Resvg } = await import("@resvg/resvg-js"));
	} catch {
		return { ok: false, message: MISSING_RASTERISER };
	}
	const { writeFile } = await import("node:fs/promises");
	await writeFile(path, new Resvg(map.svg, { fitTo: { mode: "width", value: 1400 } }).render().asPng());
	return { ok: true };
}

// ── portent table / deck / oracle ────────────────────────────────────────────

function cmdTable(argv: readonly string[]): RunResult {
	const { positional, flags } = parseArgs(argv, { value: ["seed", "count"], boolean: ["json", "list"] });
	const id = positional[0];

	if (flags.list || !id) {
		if (flags.json) return json(tables.map((entry) => ({ id: entry.id, name: entry.name })));
		return ok(
			[bold("Tables"), table(tables.map((entry) => [entry.id, entry.name] as const))].join("\n"),
		);
	}

	const found = tables.find((entry) => entry.id === id);
	if (!found) {
		return fail(
			`Unknown table ${JSON.stringify(id)}.\nAvailable: ${tables.map((entry) => entry.id).join(", ")}`,
			2,
		);
	}
	const { rng, seed } = sourceFor(stringFlag(flags, "seed"));
	const count = intFlag(flags, "count", { min: 1, max: 20, default: 1 })!;
	const results = Array.from({ length: count }, () =>
		formatTableResult(rollTable(found, { rng, registry })),
	);
	if (flags.json) return json({ table: found.id, seed, results });
	return ok(results.map((result) => `- ${plain(result)}`).join("\n") + (seed ? `\n${dim(`Seed: ${seed}`)}` : ""));
}

function cmdDeck(argv: readonly string[]): RunResult {
	const { positional, flags } = parseArgs(argv, { value: ["seed", "count"], boolean: ["json", "list"] });
	const id = positional[0];

	if (flags.list || !id) {
		if (flags.json) return json(decks.map((deck) => ({ id: deck.id, name: deck.name, cards: deck.cards.length })));
		return ok([bold("Decks"), table(decks.map((deck) => [deck.id, deck.name] as const))].join("\n"));
	}

	const deck = decks.find((entry) => entry.id === id);
	if (!deck) {
		return fail(`Unknown deck ${JSON.stringify(id)}.\nAvailable: ${decks.map((entry) => entry.id).join(", ")}`, 2);
	}
	const { rng, seed } = sourceFor(stringFlag(flags, "seed"));
	const count = intFlag(flags, "count", { min: 1, max: 20, default: 1 })!;

	// A one-off pile: the CLI has no campaign, so a draw cannot persist. That is
	// the honest behaviour rather than a hidden state file in the user's home.
	const result = drawFromPile(deck, createPile(deck, { rng }), { count, rng });
	if (flags.json) {
		return json({ deck: deck.id, seed, cards: result.cards.map((card) => ({ name: card.name, text: card.text })) });
	}
	return ok(
		result.cards.map((card) => plain(formatCard(card))).join("\n\n") + (seed ? `\n\n${dim(`Seed: ${seed}`)}` : ""),
	);
}

function cmdOracle(argv: readonly string[]): RunResult {
	const { positional, flags } = parseArgs(argv, {
		value: ["seed", "kind", "likelihood", "expression", "modifier"],
		boolean: ["json"],
	});
	const kind = (stringFlag(flags, "kind") ?? "yes_no") as OracleKind;
	if (!ORACLE_KINDS.includes(kind)) {
		return fail(`Unknown oracle kind ${JSON.stringify(kind)}.\nAvailable: ${ORACLE_KINDS.join(", ")}`, 2);
	}
	const likelihood = stringFlag(flags, "likelihood") as Likelihood | undefined;
	if (likelihood && !LIKELIHOODS.includes(likelihood)) {
		return fail(`Unknown likelihood ${JSON.stringify(likelihood)}.\nAvailable: ${LIKELIHOODS.join(", ")}`, 2);
	}

	const { rng, seed } = sourceFor(stringFlag(flags, "seed"));
	const answer = oracleAnswer({
		kind,
		question: positional.join(" ").trim() || undefined,
		likelihood,
		expression: stringFlag(flags, "expression"),
		modifier: intFlag(flags, "modifier"),
		rng,
		registry,
	});
	if (flags.json) return json({ kind: answer.kind, seed, text: answer.text, answer: answer.answer ?? null });
	return ok(plain(answer.text) + (seed ? `\n${dim(`Seed: ${seed}`)}` : ""));
}

// ── Help ─────────────────────────────────────────────────────────────────────

const VERSION = "0.0.0";

const HELP = `${bold("portent")} — solo tabletop dice, oracles and dungeons

${bold("USAGE")}
  portent <command> [args] [flags]

${bold("COMMANDS")}
${table([
	["roll <expr>", "Roll dice. 6#4d6kh3 rolls six times."],
	["odds <expr>", "Mean, spread, and the chance of meeting a DC."],
	["map", "Generate a dungeon. Connected by construction."],
	["table [id]", "Roll a random table. No id lists them."],
	["deck [id]", "Draw a card. No id lists the decks."],
	["oracle [question]", "Ask the dice about the world."],
])}

${bold("SHARED FLAGS")}
${table([
	["--json", "Machine-readable output."],
	["--seed <s>", "Reproducible randomness. Same seed, same result."],
	["--out/--svg/--png", "Write text, vector, or raster (map only)."],
])}

${bold("EXAMPLES")}
  portent roll 2d20kh1+5 --dc 15
  portent roll 6#4d6kh3
  portent odds 4d6kh3 --dc 15
  portent map --rooms 9 --seed grimhold --out map.txt
  portent map --seed grimhold --svg map.svg --png map.png
  portent table encounters-dungeon --count 3
  portent oracle "is the gate still guarded?" --likelihood unlikely
  portent deck crit-hits --json

${dim("Campaigns, sheets and the roll ledger live in the pi extension, which keeps")}
${dim("state on disk. This is the stateless half: nothing here writes to ~/.portent.")}`;

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Run one invocation.
 *
 * Returns rather than printing, so a test can assert on exactly what a user would
 * see. `bin/portent.mjs` is the only place that writes to a stream.
 */
export async function run(argv: readonly string[]): Promise<RunResult> {
	const [command, ...rest] = argv;

	try {
		switch (command) {
			case undefined:
			case "help":
			case "--help":
			case "-h":
				return ok(HELP);
			case "version":
			case "--version":
			case "-v":
				return ok(VERSION);
			case "roll":
				return cmdRoll(rest);
			case "odds":
				return cmdOdds(rest);
			case "map":
				return await cmdMap(rest);
			case "table":
				return cmdTable(rest);
			case "deck":
				return cmdDeck(rest);
			case "oracle":
				return cmdOracle(rest);
			default:
				return fail(
					`Unknown command ${JSON.stringify(command)}.\n` +
						"Commands: roll, odds, map, table, deck, oracle. Try `portent help`.",
					2,
				);
		}
	} catch (error) {
		// A usage mistake exits 2 and a genuine failure exits 1, so a script can
		// tell "I called it wrong" from "it broke".
		if (error instanceof UsageError) return fail(`${error.message}\nTry \`portent help\`.`, 2);
		return fail(`${cyan(String(command))}: ${(error as Error).message}`, 1);
	}
}
