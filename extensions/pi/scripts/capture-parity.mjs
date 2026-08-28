#!/usr/bin/env node
/**
 * Capture golden fixtures from the live prototype extension, so the port's
 * agreement with it is measured rather than asserted.
 *
 * Parity is claimed for the parts a player reads and an LLM is prompted with:
 * dice parsing, roll formatting, and the tool contract. It is deliberately NOT
 * claimed for sheets, campaign files or ledger ids, all of which changed on
 * purpose -- see PARITY.md for the list and the reasons.
 *
 * Usage:
 *   node scripts/capture-parity.mjs            # write fixtures
 *   node scripts/capture-parity.mjs --check    # fail if they would change
 *
 * Reads the prototype from $PROTOTYPE, default ~/.pi/agent/extensions/dnd.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const prototypeRoot = process.env.PROTOTYPE ?? join(homedir(), ".pi/agent/extensions/dnd");
const outFile = resolve(here, "../fixtures/dice-parity.json");
const check = process.argv.includes("--check");

if (!existsSync(join(prototypeRoot, "src/dice.ts"))) {
	console.error(`No prototype at ${prototypeRoot}. Set PROTOTYPE to its directory.`);
	process.exit(2);
}

const { roll, formatRoll, parse, splitRepeat } = await import(join(prototypeRoot, "src/dice.ts"));

/**
 * A dice source that returns a fixed cycle of faces.
 *
 * Both implementations must consume randomness in the same order for the
 * comparison to mean anything, which is itself part of what this pins: a port
 * that rolls the same dice in a different order produces different results from
 * the same seed, and that would be invisible without a fixture.
 */
function scriptedRng(faces) {
	let i = 0;
	const next = () => faces[i++ % faces.length];
	return {
		int: (min, max) => {
			const value = next();
			const span = max - min + 1;
			return min + (((value - min) % span) + span) % span;
		},
		float: () => (next() % 100) / 100,
	};
}

/** Expressions chosen to cover every operator the notation supports. */
const EXPRESSIONS = [
	"1d20",
	"1d20+5",
	"2d6+3",
	"1d20-2",
	"2d20kh1",
	"2d20kl1",
	"4d6kh3",
	"4d6kl3",
	"1d8x",
	"4d6r1",
	"1d20min10",
	"1d20max10",
	"5d10cs>=7",
	"d%",
	"4dF",
	"1d4+1d6+2",
	"(1d6+1)*2",
	"floor((2d6+3)/2)",
	"ceil(1d8/2)",
	"max(1d20,1d20)",
	"min(1d20,1d20)",
	"abs(1d6-4)",
	"8d6 # fireball",
	"1d20+5 # to hit",
	"3d8",
	"10d10",
	"1d1",
	"100d1",
];

const REPEATS = ["6#4d6kh3", "6x4d6kh3", "2#1d20+5", "1#1d6", "8#1d6"];

/**
 * Face cycles to drive both implementations with.
 *
 * Written into the fixture rather than duplicated in the test, so adding one
 * cannot leave the two lists silently out of step.
 *
 * The all-same cycles are degenerate on purpose -- they catch off-by-one and
 * formatting differences -- but they cannot tell keep-highest from keep-lowest,
 * so the strictly descending and ascending cycles exist to discriminate those.
 */
const FACE_CYCLES = [
	[1],
	[20],
	[3, 17, 8, 12, 5, 19, 2, 14, 9, 11],
	[6, 6, 6, 1, 1, 1],
	[10, 7, 4, 13, 20, 1],
	[20, 17, 14, 11, 8, 5, 2],
	[2, 5, 8, 11, 14, 17, 20],
	[19, 1, 18, 2, 17, 3, 16, 4],
];

const captured = {
	note: "Golden dice fixtures captured from the prototype extension. See PARITY.md.",
	capturedFrom: prototypeRoot.replace(homedir(), "~"),
	faceCycles: FACE_CYCLES,
	rolls: [],
	repeats: [],
	parseErrors: [],
};

for (const expression of EXPRESSIONS) {
	for (const [cycleIndex, faces] of FACE_CYCLES.entries()) {
		let entry;
		try {
			const result = roll(expression, { rng: scriptedRng(faces) });
			entry = {
				expression,
				cycle: cycleIndex,
				total: result.total,
				formatted: formatRoll(result),
				groups: result.groups.map((group) => ({
					die: `${group.die.count}d${group.die.sides}`,
					rolls: group.rolls,
					kept: group.kept,
				})),
				hasMax: result.hasMax ?? false,
				hasMin: result.hasMin ?? false,
			};
		} catch (error) {
			entry = { expression, cycle: cycleIndex, threw: error.message };
		}
		captured.rolls.push(entry);
	}
}

for (const input of REPEATS) {
	try {
		const { times, expression } = splitRepeat(input);
		captured.repeats.push({ input, times, expression });
	} catch (error) {
		captured.repeats.push({ input, threw: error.message });
	}
}

/** Bad input matters as much as good: the message is what the player sees. */
for (const bad of ["", "d", "1d", "1d0", "abcd", "1d20+", "2#", "0#1d6", "51#1d6", "1d20kh", "(1d6", "1d6)"]) {
	try {
		parse(bad);
		captured.parseErrors.push({ input: bad, accepted: true });
	} catch (error) {
		captured.parseErrors.push({ input: bad, message: error.message });
	}
}

const serialised = `${JSON.stringify(captured, null, "\t")}\n`;

if (check) {
	if (!existsSync(outFile)) {
		console.error(`No fixture at ${outFile}. Run without --check to create it.`);
		process.exit(1);
	}
	const existing = readFileSync(outFile, "utf8");
	if (existing !== serialised) {
		console.error("Prototype behaviour has changed since the fixture was captured.");
		console.error("If that was deliberate, re-run without --check and review the diff.");
		process.exit(1);
	}
	console.log(`Fixture still matches the prototype (${captured.rolls.length} rolls).`);
} else {
	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, serialised);
	console.log(
		`Captured ${captured.rolls.length} rolls, ${captured.repeats.length} repeats, ` +
			`${captured.parseErrors.length} parse cases to ${outFile.replace(homedir(), "~")}`,
	);
}
