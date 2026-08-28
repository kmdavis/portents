/**
 * The CLI's own tests.
 *
 * `run()` returns its output instead of printing, so these assert on exactly what
 * a user sees. `NO_COLOR` is set before importing so the assertions can match
 * plain text rather than escape codes.
 */

process.env.NO_COLOR = "1";

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { intFlag, parseArgs, stringFlag, UsageError } from "./args.ts";
import { buildMap, MISSING_RASTERISER, run } from "./index.ts";

const scratch = mkdtempSync(join(tmpdir(), "portent-cli-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

async function cli(...argv: string[]) {
	return run(argv);
}

describe("argument parsing", () => {
	it("separates positionals from flags", () => {
		const { positional, flags } = parseArgs(["2d6", "--seed", "abc", "--json"], {
			value: ["seed"],
			boolean: ["json"],
		});
		assert.deepEqual(positional, ["2d6"]);
		assert.deepEqual(flags, { seed: "abc", json: true });
	});

	it("accepts --flag=value", () => {
		assert.equal(parseArgs(["--seed=abc"], { value: ["seed"] }).flags.seed, "abc");
	});

	it("stops flag parsing at --", () => {
		const { positional } = parseArgs(["--", "--not-a-flag"], { boolean: ["json"] });
		assert.deepEqual(positional, ["--not-a-flag"]);
	});

	it("refuses an unknown flag rather than ignoring it", () => {
		// A typo'd --seed would silently produce a different result and look like
		// the tool misbehaving.
		assert.throws(() => parseArgs(["--sed", "x"], { value: ["seed"] }), /Unknown flag --sed/);
		assert.throws(() => parseArgs(["--sed", "x"], { value: ["seed"] }), /Known: --seed/);
	});

	it("refuses a value flag with no value", () => {
		assert.throws(() => parseArgs(["--seed"], { value: ["seed"] }), UsageError);
	});

	it("refuses a value given to a boolean flag", () => {
		assert.throws(() => parseArgs(["--json=yes"], { boolean: ["json"] }), /does not take a value/);
	});

	it("validates integers and names the flag in the error", () => {
		assert.equal(intFlag({ n: "5" }, "n"), 5);
		assert.throws(() => intFlag({ n: "x" }, "n"), /--n must be a whole number/);
		assert.throws(() => intFlag({ n: "0" }, "n", { min: 1 }), /--n must be at least 1/);
		assert.throws(() => intFlag({ n: "99" }, "n", { max: 10 }), /--n must be at most 10/);
		assert.equal(intFlag({}, "n", { default: 3 }), 3);
	});

	it("rejects a bare boolean where a string is wanted", () => {
		assert.throws(() => stringFlag({ seed: true }, "seed"), /needs a value/);
	});
});

describe("portent roll", () => {
	it("rolls and shows the breakdown", async () => {
		const { code, stdout } = await cli("roll", "2d6+3", "--seed", "fixed");
		assert.equal(code, 0);
		assert.match(stdout, /2d6\+3:/);
		assert.match(stdout, /= \d+/);
	});

	it("is reproducible from a seed", async () => {
		const first = await cli("roll", "4d6kh3", "--seed", "same");
		const second = await cli("roll", "4d6kh3", "--seed", "same");
		assert.equal(first.stdout, second.stdout);
	});

	it("differs on a different seed", async () => {
		// Otherwise the seed is decorative and the reproducibility test above
		// would pass against a constant.
		const outputs = new Set<string>();
		for (const seed of ["a", "b", "c", "d", "e"]) {
			outputs.add((await cli("roll", "10d20", "--seed", seed)).stdout);
		}
		assert.ok(outputs.size > 1, "every seed produced the same roll");
	});

	it("reports success and failure against a DC", async () => {
		assert.match((await cli("roll", "1d20+100", "--dc", "15")).stdout, /success/);
		assert.match((await cli("roll", "1d20-100", "--dc", "15")).stdout, /failure/);
	});

	it("handles the repeat prefix and summarises", async () => {
		const { stdout } = await cli("roll", "6#4d6kh3", "--seed", "abc");
		assert.equal(stdout.match(/4d6kh3:/g)?.length, 6);
		assert.match(stdout, /Totals: (\d+, ){5}\d+ · sum \d+/);
	});

	it("takes --times as an alternative to the prefix", async () => {
		assert.equal((await cli("roll", "1d6", "--times", "3", "--seed", "x")).stdout.match(/1d6:/g)?.length, 3);
	});

	it("caps --times at the library's limit", async () => {
		const { code, stderr } = await cli("roll", "1d6", "--times", "9999");
		assert.equal(code, 2);
		assert.match(stderr, /--times must be at most/);
	});

	it("emits machine-readable output on --json", async () => {
		const { stdout } = await cli("roll", "2d6+3", "--seed", "j", "--dc", "5", "--json");
		const parsed = JSON.parse(stdout);
		assert.equal(parsed.expression, "2d6+3");
		assert.equal(parsed.seed, "j");
		assert.equal(parsed.results.length, 1);
		assert.equal(typeof parsed.results[0].total, "number");
		assert.deepEqual(Object.keys(parsed.results[0].dice[0]), ["die", "rolls", "kept"]);
		assert.ok(["success", "failure"].includes(parsed.results[0].outcome));
	});

	it("sums a batch in --json", async () => {
		const parsed = JSON.parse((await cli("roll", "3#1d6", "--seed", "s", "--json")).stdout);
		assert.equal(parsed.sum, parsed.results.reduce((a: number, r: { total: number }) => a + r.total, 0));
	});

	it("exits 2 with usage advice when given nothing", async () => {
		const { code, stderr } = await cli("roll");
		assert.equal(code, 2);
		assert.match(stderr, /needs a dice expression/);
	});

	it("exits 1 on a bad expression, not 2", async () => {
		// 2 means "you called it wrong", 1 means "it could not do it". A script
		// needs to tell those apart.
		const { code, stderr } = await cli("roll", "not dice");
		assert.equal(code, 1);
		assert.ok(stderr.trim().length > 0);
	});
});

describe("portent odds", () => {
	it("reports range, mean and spread", async () => {
		const { stdout } = await cli("odds", "4d6kh3");
		assert.match(stdout, /Range 3–18/);
		assert.match(stdout, /mean 1[12]\./);
	});

	it("reports the chance of meeting a DC", async () => {
		assert.match((await cli("odds", "1d20", "--dc", "15")).stdout, /Chance of 15 or more: 30\.0%/);
	});

	it("is exact for a flat die", async () => {
		const parsed = JSON.parse((await cli("odds", "1d20", "--json")).stdout);
		assert.equal(parsed.simulated, false, "1d20 should be computed exactly, not simulated");
		assert.equal(parsed.probabilities["1"].toFixed(3), "0.050");
	});

	it("needs an expression", async () => {
		assert.equal((await cli("odds")).code, 2);
	});
});

describe("portent map", () => {
	it("draws a grid and reports its seed", async () => {
		const { code, stdout } = await cli("map", "--rooms", "4", "--seed", "grimhold");
		assert.equal(code, 0);
		assert.match(stdout, /#/);
		assert.match(stdout, /Seed: grimhold/);
	});

	it("regenerates an identical dungeon from the same seed", async () => {
		const first = buildMap({ rooms: 9, seed: "stable" });
		const second = buildMap({ rooms: 9, seed: "stable" });
		assert.equal(first.ascii, second.ascii);
	});

	it("gives different dungeons for different seeds", async () => {
		assert.notEqual(buildMap({ rooms: 9, seed: "one" }).ascii, buildMap({ rooms: 9, seed: "two" }).ascii);
	});

	it("writes the grid to --out", async () => {
		const path = join(scratch, "map.txt");
		const { stdout } = await cli("map", "--rooms", "4", "--seed", "w", "--out", path);
		const written = readFileSync(path, "utf8");
		assert.match(written, /#/);
		assert.ok(written.endsWith("\n"));
		assert.match(stdout, new RegExp(`Wrote ${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
	});

	it("lists what it wrote in --json", async () => {
		const path = join(scratch, "map2.txt");
		const parsed = JSON.parse((await cli("map", "--seed", "j", "--out", path, "--json")).stdout);
		assert.deepEqual(parsed.written, [path]);
		assert.equal(parsed.seed, "j");
	});

	it("validates --rooms", async () => {
		assert.match((await cli("map", "--rooms", "1")).stderr, /--rooms must be at least 2/);
		assert.match((await cli("map", "--rooms", "999")).stderr, /--rooms must be at most 36/);
	});

	it("has an install message that names the package and the command", () => {
		// Pinned directly: with resvg installed the failure branch never runs, and a
		// mutation replacing the whole message with the raw error passed the suite.
		assert.match(MISSING_RASTERISER, /@resvg\/resvg-js/);
		assert.match(MISSING_RASTERISER, /pnpm add @resvg\/resvg-js/);
		assert.match(MISSING_RASTERISER, /optional dependency/);
		assert.doesNotMatch(MISSING_RASTERISER, /Cannot find module|Error:/);
	});

	it("explains what to install when --png has no rasteriser", async () => {
		// Passes either way: with resvg present it writes a PNG, without it says
		// how to get one. What must never happen is a bare module-not-found.
		const path = join(scratch, "map.png");
		const { code, stderr } = await cli("map", "--seed", "p", "--png", path);
		if (code === 0) {
			assert.ok(readFileSync(path).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "not a PNG");
		} else {
			assert.match(stderr, /needs @resvg\/resvg-js/);
			assert.match(stderr, /pnpm add @resvg\/resvg-js/);
			assert.doesNotMatch(stderr, /Cannot find module/);
		}
	});
});

describe("the vector output", () => {
	it("uses the library renderer, so it cannot disagree with the ASCII", () => {
		// The tile suite already proves the ASCII and SVG projections describe the
		// same tile. Rendering a picture of the characters instead would create a
		// second renderer that could drift.
		const map = buildMap({ rooms: 4, seed: "v" });
		assert.match(map.svg, /<svg/);
		assert.match(map.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		assert.ok(map.svg.length > map.ascii.length, "the vector should carry more than the text");
	});

	it("writes the vector to --svg", async () => {
		const path = join(scratch, "map.svg");
		await run(["map", "--rooms", "4", "--seed", "s", "--svg", path]);
		assert.match(readFileSync(path, "utf8"), /^<svg/);
	});

	it("keeps the vector out of --json unless asked for", async () => {
		const bare = JSON.parse((await run(["map", "--seed", "j2", "--json"])).stdout);
		assert.ok(!("svg" in bare), "a whole SVG document in --json by default");
		const withSvg = JSON.parse(
			(await run(["map", "--seed", "j2", "--svg", join(scratch, "j.svg"), "--json"])).stdout,
		);
		assert.match(withSvg.svg, /^<svg/);
	});
});

describe("portent table", () => {
	it("lists tables when given no id", async () => {
		const { stdout } = await cli("table");
		assert.match(stdout, /Tables/);
		assert.match(stdout, /weather/);
	});

	it("rolls a table reproducibly", async () => {
		const first = await cli("table", "weather", "--seed", "t");
		assert.equal(first.stdout, (await cli("table", "weather", "--seed", "t")).stdout);
		assert.match(first.stdout, /^- \S/m);
	});

	it("rolls several", async () => {
		assert.equal((await cli("table", "weather", "--count", "3", "--seed", "c")).stdout.match(/^- /gm)?.length, 3);
	});

	it("names the available tables when asked for one that does not exist", async () => {
		const { code, stderr } = await cli("table", "nope");
		assert.equal(code, 2);
		assert.match(stderr, /Unknown table "nope"/);
		assert.match(stderr, /Available: /);
	});
});

describe("portent deck", () => {
	it("lists decks when given no id", async () => {
		assert.match((await cli("deck")).stdout, /crit-hits/);
	});

	it("draws reproducibly", async () => {
		const first = await cli("deck", "crit-hits", "--seed", "d");
		assert.equal(first.stdout, (await cli("deck", "crit-hits", "--seed", "d")).stdout);
	});

	it("draws several distinct cards", async () => {
		const parsed = JSON.parse((await cli("deck", "crit-hits", "--count", "3", "--seed", "m", "--json")).stdout);
		assert.equal(parsed.cards.length, 3);
		assert.equal(new Set(parsed.cards.map((card: { name: string }) => card.name)).size, 3);
	});

	it("names the available decks for an unknown one", async () => {
		const { code, stderr } = await cli("deck", "nope");
		assert.equal(code, 2);
		assert.match(stderr, /Available: /);
	});
});

describe("portent oracle", () => {
	it("answers a yes/no question by default", async () => {
		const { stdout } = await cli("oracle", "is the gate guarded?", "--seed", "o");
		assert.match(stdout, /is the gate guarded\?/);
		assert.match(stdout, /YES|NO/);
	});

	it("respects likelihood", async () => {
		const { stdout } = await cli("oracle", "x", "--likelihood", "very unlikely", "--seed", "l");
		assert.match(stdout, /very unlikely/);
	});

	it("supports every kind", async () => {
		for (const kind of ["yes_no", "meaning", "how_many", "reaction", "scene", "gm_move"]) {
			const { code, stdout } = await cli("oracle", "x", "--kind", kind, "--seed", "k");
			assert.equal(code, 0, `${kind} failed`);
			assert.ok(stdout.trim().length > 0, `${kind} produced nothing`);
		}
	});

	it("names the valid kinds for an unknown one", async () => {
		const { code, stderr } = await cli("oracle", "x", "--kind", "tarot");
		assert.equal(code, 2);
		assert.match(stderr, /Unknown oracle kind "tarot"/);
		assert.match(stderr, /yes_no/);
	});

	it("names the valid likelihoods for an unknown one", async () => {
		assert.match((await cli("oracle", "x", "--likelihood", "maybe")).stderr, /Unknown likelihood "maybe"/);
	});

	it("reports the bare answer in --json", async () => {
		const parsed = JSON.parse((await cli("oracle", "x", "--seed", "j", "--json")).stdout);
		assert.equal(parsed.kind, "yes_no");
		assert.ok(["yes, and", "yes", "yes, but", "no, but", "no", "no, and"].includes(parsed.answer));
	});
});

describe("help and errors", () => {
	it("prints help with no arguments", async () => {
		const { code, stdout } = await cli();
		assert.equal(code, 0);
		assert.match(stdout, /USAGE/);
		assert.match(stdout, /portent roll/);
	});

	it("documents every command it accepts", async () => {
		const { stdout } = await cli("help");
		for (const command of ["roll", "odds", "map", "table", "deck", "oracle"]) {
			assert.match(stdout, new RegExp(`\\b${command}\\b`), `help does not mention ${command}`);
		}
	});

	it("says where state lives, since this half keeps none", async () => {
		assert.match((await cli("help")).stdout, /nothing here writes to ~\/\.portent/);
	});

	it("prints a version", async () => {
		assert.match((await cli("--version")).stdout, /^\d+\.\d+\.\d+$/m);
	});

	it("exits 2 and suggests help for an unknown command", async () => {
		const { code, stderr } = await cli("summon");
		assert.equal(code, 2);
		assert.match(stderr, /Unknown command "summon"/);
		assert.match(stderr, /portent help/);
	});

	it("never writes to stdout and stderr at once", async () => {
		// A caller piping stdout must not have half the message land elsewhere.
		for (const argv of [["roll"], ["summon"], ["table", "nope"], ["roll", "1d6"], ["help"]]) {
			const { stdout, stderr } = await run(argv);
			assert.ok(!(stdout && stderr), `both streams written for: ${argv.join(" ")}`);
		}
	});

	it("ends every output with exactly one newline", async () => {
		for (const argv of [["roll", "1d6"], ["help"], ["summon"], ["deck"]]) {
			const { stdout, stderr } = await run(argv);
			const text = stdout || stderr;
			assert.ok(text.endsWith("\n"), `no trailing newline: ${argv.join(" ")}`);
			assert.ok(!text.endsWith("\n\n"), `blank line at end: ${argv.join(" ")}`);
		}
	});

	it("emits no escape codes when NO_COLOR is set", async () => {
		for (const argv of [["roll", "1d6"], ["help"], ["odds", "2d6"], ["deck"]]) {
			const { stdout, stderr } = await run(argv);
			// biome-ignore lint/suspicious/noControlCharactersInRegex: checking for their absence is the point
			assert.doesNotMatch(stdout + stderr, /\u001B\[/, `escape codes leaked: ${argv.join(" ")}`);
		}
	});
});
