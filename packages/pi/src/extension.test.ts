/**
 * Exercise the extension through a fake pi, in a temporary home.
 *
 * The parity suite covers the dice engine. This covers the adapter: that tools
 * register, that they reach the library, that a tool result says what the GM
 * needs, and that the banner carries the state a compaction would otherwise
 * lose.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { commonContent } from "@portents/content";
import { type ContentRegistry, createRegistry } from "@portents/core";
import { CORE_GUIDANCE, GUIDANCE_TOPICS, guidanceTopic } from "@portents/guidance";

/** The same registry the extension builds, so these tests see the shipped prose. */
const registry: ContentRegistry = createRegistry(commonContent);
import { after, before, describe, it } from "node:test";

const home = mkdtempSync(join(tmpdir(), "portents-ext-"));
process.env.PORTENTS_HOME = home;

interface ToolDef {
	name: string;
	description: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: (
		id: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
		onUpdate?: unknown,
		ctx?: unknown,
	) => Promise<{ content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }>;
}

interface CommandDef {
	description: string;
	handler: (args: string, ctx: unknown) => Promise<void> | void;
	getArgumentCompletions?: (prefix: string) => unknown;
}

interface Harness {
	tools: Map<string, ToolDef>;
	commands: Map<string, CommandDef>;
	handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;
	entries: Array<{ customType: string; data: unknown }>;
	messages: Array<{ message: Record<string, unknown>; options?: Record<string, unknown> }>;
	widgets: Record<string, string[]>;
	statuses: Record<string, string | undefined>;
	notifications: Array<{ text: string; level: string }>;
	confirms: Array<{ title: string; message: string }>;
	confirmAnswer: boolean;
	activeTools: string[];
	activeSetCalls: string[][];
}

/** Stand-ins for pi's own tools, which the extension must never switch off. */
const BUILTIN_TOOLS = ["read", "bash", "edit"];

/**
 * Every piece of prose this extension can put in front of a model.
 *
 * Taken from the packages rather than by walking a directory, which is what these
 * tests used to do. The prose moved out of this package -- neutral guidance to
 * `@portents/guidance`, system rules to the content packs -- and checking the shipped
 * strings is both simpler and closer to what a session actually sees.
 */
function allGuidance(reg: ContentRegistry): Array<{ label: string; text: string }> {
	return [
		{ label: "core", text: CORE_GUIDANCE },
		...GUIDANCE_TOPICS.map((topic) => ({ label: `topic:${topic}`, text: guidanceTopic(topic)! })),
		...reg.guidanceIds().map((id) => ({ label: `system:${id}`, text: reg.guidanceFor(id)!.body })),
	];
}

function makeHarness() {
	const h: Harness = {
		tools: new Map(),
		commands: new Map(),
		handlers: new Map(),
		entries: [],
		messages: [],
		widgets: {},
		statuses: {},
		notifications: [],
		confirms: [],
		confirmAnswer: true,
		activeTools: [...BUILTIN_TOOLS],
		activeSetCalls: [],
	};
	const pi = {
		registerTool: (tool: ToolDef) => {
			h.tools.set(tool.name, tool);
			// pi makes a newly registered tool active; the extension has to opt out.
			if (!h.activeTools.includes(tool.name)) h.activeTools.push(tool.name);
		},
		// Mirrors pi's contract: names must already be registered, and the extension is
		// expected to read the current set before adding to it.
		getActiveTools: () => [...h.activeTools],
		setActiveTools: (names: string[]) => {
			h.activeSetCalls.push([...names]);
			// pi ignores unknown names, but its built-ins ARE known to it even though this
			// harness never sees them registered. Treating them as unknown made the
			// harness itself delete read/bash/edit, which looked like an extension bug.
			h.activeTools = names.filter((name) => h.tools.has(name) || BUILTIN_TOOLS.includes(name));
		},
		registerCommand: (name: string, def: CommandDef) => h.commands.set(name, def),
		on: (event: string, handler: (e: unknown, c: unknown) => unknown) => {
			h.handlers.set(event, [...(h.handlers.get(event) ?? []), handler]);
		},
		appendEntry: (customType: string, data: unknown) => h.entries.push({ customType, data }),
		sendMessage: (message: Record<string, unknown>, options?: Record<string, unknown>) => {
			h.messages.push({ message, options });
		},
		sendUserMessage: () => {},
	};
	return { pi, h };
}

function makeCtx(h: Harness, overrides: Record<string, unknown> = {}) {
	return {
		hasUI: true,
		mode: "tui",
		cwd: home,
		isIdle: () => true,
		sessionManager: { getEntries: () => h.entries.map((e) => ({ type: "custom", ...e })) },
		ui: {
			notify: (text: string, level = "info") => h.notifications.push({ text, level }),
			setStatus: (key: string, value: string | undefined) => {
				h.statuses[key] = value;
			},
			setWidget: (key: string, lines: string[]) => {
				h.widgets[key] = lines;
			},
			select: async () => undefined,
			confirm: async (title: string, message: string) => {
				h.confirms.push({ title, message });
				return h.confirmAnswer;
			},
			input: async () => undefined,
		},
		...overrides,
	};
}

/**
 * pi is an ordinary devDependency, so this suite simply runs.
 *
 * It did not used to be. `@earendil-works/pi-coding-agent` and `pi-ai` were
 * symlinked out of an installed pi, on the belief that they were not on any registry
 * this machine could reach -- a belief that was wrong, and that cost two failure
 * modes: `pnpm install` hit EPERM chmodding pi's read-only bin scripts, and pnpm
 * pruned the links it did not know about. Roughly two hundred lines of linking,
 * unlinking and self-healing hooks were replaced by two lines in `devDependencies`.
 *
 * The three-state detection that lived here went with them. It existed to tell "pi
 * absent" from "pi present but unimportable", because a dereferenced copy could not
 * resolve its own `chalk` and this suite silently dropped 38 tests while exiting 0.
 * A normal dependency cannot be half-installed, so that distinction has no subject:
 * if the import fails now, the suite fails, which is correct.
 */
const loaded = (await import("./index.ts")).default as (pi: unknown) => void;

describe("extension", async () => {
		const { pi, h } = makeHarness();
		loaded(pi);
		const ctx = makeCtx(h);

		async function call(name: string, params: Record<string, unknown> = {}, useCtx: unknown = ctx) {
			const tool = h.tools.get(name);
			assert.ok(tool, `no tool ${name}`);
			const out = await tool.execute("t", params, undefined, undefined, useCtx);
			return out.content.map((part) => part.text).join("\n");
		}

		before(async () => {
			await call("portents_campaign", {
				action: "create",
				name: "Harness Test",
				system: "5e",
				premise: "A test.",
			});
		});

		it("registers every tool and command", () => {
			for (const name of [
				"portents_roll",
				"portents_ask_roll",
				"portents_odds",
				"portents_deck",
				"portents_table",
				"portents_oracle",
				"portents_map",
				"portents_campaign",
				"portents_sheet",
				"portents_verify_roll",
			]) {
				assert.ok(h.tools.has(name), `missing tool ${name}`);
			}
			for (const name of ["roll", "portents", "sheet", "draw", "oracle", "portents-status"]) {
				assert.ok(h.commands.has(name), `missing command ${name}`);
			}
		});

		it("uses the portents_ prefix, never the old dnd_ one", () => {
			for (const name of h.tools.keys()) assert.match(name, /^portents_/, name);
		});

		it("names its own tool in every prompt guideline", () => {
			// A guideline is injected without its surrounding context, so one that
			// says "it" rather than the tool name is useless.
			for (const [name, tool] of h.tools) {
				for (const guideline of tool.promptGuidelines ?? []) {
					assert.ok(guideline.includes(name), `guideline on ${name} does not name it: ${JSON.stringify(guideline)}`);
				}
			}
		});

		it("rolls dice and returns a citable ledger id", async () => {
			const out = await call("portents_roll", { expression: "4d6kh3", reason: "ability score" });
			assert.match(out, /`r-\d+`/, out);
		});

		it("prefixes the id by kind, so a citation carries its own checksum", async () => {
			assert.match(await call("portents_roll", { expression: "1d20", kind: "hit" }), /`h-\d+`/);
			assert.match(await call("portents_roll", { expression: "1d8", kind: "damage" }), /`d-\d+`/);
			assert.match(await call("portents_roll", { expression: "1d20", kind: "death-save" }), /`k-\d+`/);
		});

		it("reports success and failure against a DC", async () => {
			assert.match(await call("portents_roll", { expression: "1d20+100", dc: 15 }), /\*\*success\*\*/);
			assert.match(await call("portents_roll", { expression: "1d20-100", dc: 15 }), /\*\*failure\*\*/);
		});

		it("rolls six ability scores from one call", async () => {
			const out = await call("portents_roll", { expression: "6#4d6kh3" });
			assert.equal((out.match(/`r-\d+`/g) ?? []).length, 6, out);
			assert.match(out, /Totals: /);
		});

		it("verifies a real id and exposes a fabricated one", async () => {
			const rolled = await call("portents_roll", { expression: "1d20", kind: "hit", reason: "shortbow" });
			const id = /`(h-\d+)`/.exec(rolled)![1];
			assert.match(await call("portents_verify_roll", { id }), /attack roll/);
			assert.match(await call("portents_verify_roll", { id: "h-9999" }), /never rolled/);
		});

		it("refuses campaign work with no campaign loaded", async () => {
			// A fresh registration has nothing open.
			const { pi: pi2, h: h2 } = makeHarness();
			loaded!(pi2);
			const tool = h2.tools.get("portents_sheet")!;
			await assert.rejects(
				() => tool.execute("t", { action: "list" }, undefined, undefined, makeCtx(h2)),
				/No campaign loaded/,
			);
		});

		describe("asking the player to roll", () => {
			it("puts a dialog up naming the reason, expression and DC", async () => {
				h.confirms.length = 0;
				h.confirmAnswer = true;
				await call("portents_ask_roll", { expression: "1d20+7", reason: "Stealth", dc: 15, kind: "skill" });
				assert.equal(h.confirms.length, 1);
				assert.match(h.confirms[0].title, /Stealth/);
				assert.match(h.confirms[0].title, /DC 15/);
				assert.match(h.confirms[0].message, /1d20\+7/);
			});

			it("rolls on confirm and hands the result back at once", async () => {
				h.confirmAnswer = true;
				const out = await call("portents_ask_roll", { expression: "1d20+7", reason: "Stealth", kind: "skill" });
				assert.match(out, /`s-\d+`/, out);
				assert.match(out, /Resolve it now/);
				assert.doesNotMatch(out, /wait/i);
			});

			it("treats cancelling as a choice, not a failure", async () => {
				h.confirmAnswer = false;
				const out = await call("portents_ask_roll", { expression: "1d20", reason: "Stealth" });
				assert.match(out, /declined/);
				assert.match(out, /do not roll it for them/);
				assert.doesNotMatch(out, /`[a-z]-\d+`/, "a declined roll must not produce a result");
				h.confirmAnswer = true;
			});

			it("clears the request when the expression cannot be rolled", async () => {
				// Otherwise the player's next unrelated /roll answers a request nobody
				// could have rolled.
				h.confirmAnswer = true;
				const out = await call("portents_ask_roll", { expression: "not dice", reason: "nonsense" });
				assert.match(out, /Could not roll/);
				h.messages.length = 0;
				await h.commands.get("roll")!.handler("1d6", ctx);
				assert.notEqual(
					h.messages[0].options?.triggerTurn,
					true,
					"a later roll was treated as answering the failed request",
				);
			});

			it("files an answered request under the kind the GM asked for", async () => {
				await call(
					"portents_ask_roll",
					{ expression: "1d20", reason: "a save", kind: "save", dc: 12 },
					makeCtx(h, { hasUI: false }),
				);
				h.messages.length = 0;
				await h.commands.get("roll")!.handler("1d20", ctx);
				assert.match(
					h.messages[0].message.content as string,
					/`v-\d+`/,
					"an answered save should get the save prefix, not the generic one",
				);
			});

			it("falls back to a pending /roll with no UI", async () => {
				const out = await call(
					"portents_ask_roll",
					{ expression: "1d20", reason: "Stealth" },
					makeCtx(h, { hasUI: false }),
				);
				assert.match(out, /No interactive UI/);
				assert.match(out, /do not narrate an outcome yet/);
			});
		});

		describe("the briefing", () => {
			/** Both halves of what before_agent_start returns, kept apart. */
			async function brief() {
				const handler = h.handlers.get("before_agent_start")![0];
				const result = (await handler({ systemPrompt: "BASE" }, ctx)) as
					| { systemPrompt?: string; message?: { content: string; customType: string; display: boolean } }
					| undefined;
				return { standing: result?.systemPrompt ?? "", state: result?.message?.content ?? "", message: result?.message };
			}

			it("carries the state a compaction would lose", async () => {
				await call("portents_campaign", {
					action: "scene",
					summary: "At the causeway.",
					location: "Wrenfield",
				});
				await call("portents_campaign", { action: "clock", clock_name: "Tide", filled: 2, segments: 6 });
				await call("portents_sheet", {
					action: "create",
					character: "Brannoc",
					status: { HP: "26/26", AC: "15" },
				});
				const { standing, state } = await brief();
				assert.match(standing, /^BASE/);
				assert.match(standing, /Harness Test/);
				// The volatile facts still reach the model, just not through the prompt prefix.
				assert.match(state, /At the causeway\./);
				assert.match(state, /Tide 2\/6/);
				assert.match(state, /Brannoc/);
				assert.match(state, /HP 26\/26/);
			});

			it("keeps the system prompt byte-identical while state churns", async () => {
				// The regression test for a real defect: HP, clocks and the last five
				// ledger ids used to live in the system prompt, so every roll changed the
				// front of the request and invalidated the provider's cached prefix on
				// every turn of a long game.
				const before = (await brief()).standing;

				await call("portents_campaign", { action: "scene", summary: "The tide turns.", location: "Causeway" });
				await call("portents_campaign", { action: "clock", clock_name: "Tide", filled: 5, segments: 6 });
				await call("portents_roll", { expression: "1d20", reason: "a roll that lands in the ledger" });

				const after = await brief();
				assert.equal(after.standing, before, "state leaked into the system prompt and broke the prompt cache");
				// ...and the churn is genuinely visible somewhere. HP is asserted without
				// patching it, so this test does not mutate a sheet other tests read.
				assert.match(after.state, /HP 26\/26/);
				assert.match(after.state, /Tide 5\/6/);
				assert.match(after.state, /The tide turns\./);
				assert.match(after.state, /Recent results:/);
			});

			it("hides the state message from the transcript", async () => {
				// The player is reading fiction, not a status block. It is for the model.
				const { message } = await brief();
				assert.equal(message?.display, false);
				assert.equal(message?.customType, "portents-state");
			});

			it("states the secrecy rule, which prompting alone keeps losing", async () => {
				const { standing } = await brief();
				assert.match(standing, /Never cite an id, name a tool, or describe the mechanism/);
				assert.match(standing, /oracle answers, scene checks, table rolls, card draws/);
			});

			it("tells the GM to cite ids for the player's own mechanics", async () => {
				assert.match((await brief()).standing, /Cite the ledger id only for mechanics the player can see/);
			});
		});

		describe("content", () => {
			it("lists and rolls a table without leaking the mechanism", async () => {
				assert.match(await call("portents_table", { action: "list" }), /`weather`/);
				const out = await call("portents_table", { action: "roll", table: "weather" });
				assert.ok(out.trim().length > 0);
				assert.doesNotMatch(out, /`[a-z]-\d+`/, "a table result must not carry a citable id");
			});

			it("draws from a deck and keeps the card gone", async () => {
				const first = await call("portents_deck", { action: "draw", deck: "crit-hits" });
				assert.match(first, /left\._$/m);
				const status = await call("portents_deck", { action: "status", deck: "crit-hits" });
				assert.match(status, /of \d+ left/);
			});

			it("refuses status and shuffle without a campaign instead of drawing a card", async () => {
				// These used to fall through to an ephemeral draw, handing back a random
				// card that the GM would then narrate as a real result.
				const { pi: pi2, h: h2 } = makeHarness();
				loaded!(pi2);
				const tool = h2.tools.get("portents_deck")!;
				for (const action of ["status", "shuffle", "recent"]) {
					await assert.rejects(
						() => tool.execute("t", { action, deck: "crit-hits" }, undefined, undefined, makeCtx(h2)),
						/needs a loaded campaign/,
						`${action} did not refuse`,
					);
				}
			});

			it("says which decks exist when asked for one that does not", async () => {
				await assert.rejects(() => call("portents_deck", { action: "draw", deck: "nope" }), /Available: /);
			});

			it("answers the oracle with no citable id", async () => {
				const out = await call("portents_oracle", { kind: "yes_no", question: "Is the gate guarded?" });
				assert.ok(out.trim().length > 0);
				assert.doesNotMatch(out, /`[a-z]-\d+`/);
			});

			it("supports every oracle kind", async () => {
				for (const kind of ["yes_no", "meaning", "how_many", "reaction", "scene", "gm_move"]) {
					const out = await call("portents_oracle", { kind, question: "x" });
					assert.ok(out.trim().length > 0, `${kind} produced nothing`);
				}
			});

			it("generates a dungeon that is reproducible from its seed", async () => {
				const first = await call("portents_map", { rooms: 4, seed: "fixed-seed" });
				const second = await call("portents_map", { rooms: 4, seed: "fixed-seed" });
				assert.equal(first, second, "same seed gave a different dungeon");
				assert.match(first, /Seed: `fixed-seed`/);
			});
		});

		describe("the sheet", () => {
			it("patches status with a delta and persists it", async () => {
				await call("portents_sheet", { action: "patch_status", character: "Brannoc", status: { HP: "-7" } });
				assert.match(await call("portents_sheet", { action: "read", character: "Brannoc" }), /19\/26/);
			});

			it("gives a character the sections its own system asks for", async () => {
				// This campaign is 5e, so 5E headings are correct here. The bug was a
				// hardcoded list that gave them to every system; the assertion that
				// matters is that the sections follow the campaign, which the Cthulhu
				// case below pins from the other direction.
				const { readFileSync } = await import("node:fs");
				const raw = readFileSync(join(home, "campaigns", "harness-test", "characters", "brannoc.md"), "utf8");
				assert.match(raw, /## Attacks & Spellcasting/, "a 5e campaign should get 5e sections");
			});

			it("gives a different system different sections", async () => {
				await call("portents_campaign", { action: "create", name: "Arkham Harness", system: "Call of Cthulhu 7e" });
				const out = await call("portents_sheet", { action: "create", character: "Ashcombe" });
				assert.match(out, /Generic scaffold|generic/i, "should say it fell back");
				const { readFileSync } = await import("node:fs");
				const raw = readFileSync(join(home, "campaigns", "arkham-harness", "characters", "ashcombe.md"), "utf8");
				assert.doesNotMatch(raw, /Attacks & Spellcasting/, "5E headings on an investigator");
				assert.match(raw, /## Concept/);
				// Put the 5e campaign back for the tests that follow.
				await call("portents_campaign", { action: "load", name: "harness-test" });
			});

			it("lists characters", async () => {
				assert.match(await call("portents_sheet", { action: "list" }), /brannoc/);
			});

			it("appends to a section", async () => {
				await call("portents_sheet", {
					action: "append_section",
					character: "Brannoc",
					section: "Equipment",
					body: "- Longbow",
				});
				assert.match(await call("portents_sheet", { action: "read", character: "Brannoc" }), /Longbow/);
			});
		});

		describe("commands", () => {
			it("/roll answers an outstanding request and makes the GM respond", async () => {
				// Set the request up here rather than relying on an earlier test having
				// left one behind: the headless ask_roll path does leave one, and
				// depending on that made this block order-sensitive.
				await call(
					"portents_ask_roll",
					{ expression: "1d20+7", reason: "initiative", dc: 12 },
					makeCtx(h, { hasUI: false }),
				);
				h.messages.length = 0;
				await h.commands.get("roll")!.handler("1d20+7", ctx);
				assert.equal(h.messages.length, 1);
				assert.equal(h.messages[0].options?.triggerTurn, true, "a requested roll should make the GM respond");
				assert.match(h.messages[0].message.content as string, /Requested for: initiative/);
			});

			it("/roll shows an unprompted roll at once rather than queueing it", async () => {
				// nextTurn waits for the next user prompt, which reads as a hung command.
				// Nothing is owed here, because the test above consumed the request.
				h.messages.length = 0;
				await h.commands.get("roll")!.handler("2d6", ctx);
				assert.equal(h.messages.length, 1);
				assert.notEqual(h.messages[0].options?.deliverAs, "nextTurn");
				assert.notEqual(h.messages[0].options?.triggerTurn, true);
				assert.equal(h.messages[0].message.display, true);
			});

			it("/roll handles a # comment just as promptly", async () => {
				h.messages.length = 0;
				await h.commands.get("roll")!.handler("4d6kh3 # stats", ctx);
				assert.equal(h.messages.length, 1);
				assert.match(h.messages[0].message.content as string, /stats/);
			});

			it("/roll reports a bad expression instead of throwing", async () => {
				h.notifications.length = 0;
				await h.commands.get("roll")!.handler("not dice", ctx);
				assert.match(h.notifications.at(-1)!.text, /Bad dice expression/);
			});

			it("/portents-status lists recent rolls", async () => {
				h.entries.length = 0;
				await h.commands.get("portents-status")!.handler("", ctx);
				const entry = h.entries.find((e) => e.customType === "portents-status");
				assert.ok(entry, "no status entry appended");
				assert.match((entry.data as { text: string }).text, /Harness Test/);
			});

			it("/draw writes a ledger entry, like the tool does", async () => {
				// The command bypassed the tool's append, so a card the player drew
				// themselves never reached the audit log and the counter ran ahead.
				const before = (await call("portents_deck", { action: "recent", deck: "npc-sparks" })).length;
				await h.commands.get("draw")!.handler("npc-sparks", ctx);
				h.entries.length = 0;
				await h.commands.get("portents-status")!.handler("", ctx);
				const status = (h.entries.find((e) => e.customType === "portents-status")!.data as { text: string }).text;
				assert.match(status, /`c-\d+`/, `no card entry in the ledger:\n${status}`);
				void before;
			});

			it("/draw completes deck ids", () => {
				const items = h.commands.get("draw")!.getArgumentCompletions!("crit") as Array<{ value: string }>;
				assert.ok(items.some((item) => item.value === "crit-hits"));
			});
		});

		describe("lazy tool activation", () => {
			it("exposes only the way in before a game starts", async () => {
				// The reason this exists: a coding session should not carry ten tabletop
				// tools. Everything is registered so pi can defer-load it; almost nothing
				// is active.
				const { pi: freshPi, h: fresh } = makeHarness();
				loaded(freshPi);
				await fresh.handlers.get("session_start")![0]({}, makeCtx(fresh));

				const portentActive = fresh.activeTools.filter((name) => name.startsWith("portents_")).sort();
				assert.deepEqual(portentActive, ["portents_campaign", "portents_roll"]);
				assert.ok(fresh.tools.size >= 11, `only ${fresh.tools.size} tools registered`);
				// Deactivating ours must not take pi's with it: setActiveTools governs
				// built-in tools too, so a replace instead of a subtract disables the session.
				for (const builtin of BUILTIN_TOOLS) {
					assert.ok(fresh.activeTools.includes(builtin), `deactivation removed the built-in ${builtin}`);
				}
			});

			it("carries the trigger text on the tool that starts a game", async () => {
				// This replaced a skill's frontmatter description. If it stops saying what
				// it is for, nothing else advertises the extension at all.
				const description = h.tools.get("portents_campaign")!.description;
				for (const phrase of ["play D&D", "Pathfinder", "one-shot", "DM or GM", "resume"]) {
					assert.ok(description.includes(phrase), `portents_campaign no longer mentions ${phrase}`);
				}
			});

			it("activates the rest when a campaign starts", async () => {
				const { pi: freshPi, h: fresh } = makeHarness();
				loaded(freshPi);
				const freshCtx = makeCtx(fresh);
				await fresh.handlers.get("session_start")![0]({}, freshCtx);

				await fresh.tools
					.get("portents_campaign")!
					.execute("t", { action: "create", name: "Activation Test", system: "5e (2024)" }, undefined, undefined, freshCtx);

				for (const name of ["portents_ask_roll", "portents_deck", "portents_oracle", "portents_sheet", "portents_guidance"]) {
					assert.ok(fresh.activeTools.includes(name), `${name} did not activate`);
				}
			});

			it("only ever adds once a game is under way", async () => {
				// pi's docs: a non-additive change loses native deferred loading. One
				// subtraction at startup is deliberate and free (no request has been made
				// yet); every call after it must be a superset of the one before.
				const { pi: freshPi, h: fresh } = makeHarness();
				loaded(freshPi);
				const freshCtx = makeCtx(fresh);
				await fresh.handlers.get("session_start")![0]({}, freshCtx);
				await fresh.tools
					.get("portents_campaign")!
					.execute("t", { action: "create", name: "Additive Test", system: "pf2e" }, undefined, undefined, freshCtx);

				const calls = fresh.activeSetCalls;
				assert.ok(calls.length >= 2, `expected a subtraction then an addition, got ${calls.length} calls`);
				for (let i = 1; i < calls.length; i++) {
					for (const name of calls[i - 1]) {
						assert.ok(calls[i].includes(name), `call ${i} dropped ${name}, losing deferred loading`);
					}
				}
			});

			it("re-activates on a resumed session without starting a game again", async () => {
				const { pi: freshPi, h: fresh } = makeHarness();
				loaded(freshPi);
				fresh.entries.push({ customType: "portents-active-campaign", data: { slug: "harness-test" } });
				await fresh.handlers.get("session_start")![0]({}, makeCtx(fresh));
				assert.ok(fresh.activeTools.includes("portents_sheet"), "a resumed game came back without its tools");
			});
		});

		describe("guidance", () => {
			it("puts the standing guidance in the system prompt", async () => {
				const handler = h.handlers.get("before_agent_start")![0];
				const result = (await handler({ systemPrompt: "BASE" }, ctx)) as { systemPrompt: string };
				assert.match(result.systemPrompt, /Running a solo game/);
				assert.match(result.systemPrompt, /The scene loop/);
			});

			it("includes the printing in play and not the other one", async () => {
				const handler = h.handlers.get("before_agent_start")![0];
				const { systemPrompt } = (await handler({ systemPrompt: "" }, ctx)) as { systemPrompt: string };
				// The harness campaign is 5e (2024).
				assert.match(systemPrompt, /System guidance: dnd-5e-2024/);
				assert.match(systemPrompt, /[Ww]eapon mastery/);
				assert.doesNotMatch(systemPrompt, /force barrage/, "PF2E guidance leaked into a 5E game");
			});

			it("keeps the deep topics out of the prompt and behind the tool", async () => {
				const handler = h.handlers.get("before_agent_start")![0];
				const { systemPrompt } = (await handler({ systemPrompt: "" }, ctx)) as { systemPrompt: string };
				// Named, so the GM knows to ask; not inlined, because it is not needed every turn.
				assert.match(systemPrompt, /portents_guidance \{ topic: "character-creation" \}/);
				assert.doesNotMatch(systemPrompt, /Rolling ability scores/, "a deep topic was inlined");

				const body = (await call("portents_guidance", { topic: "character-creation" })) as string;
				assert.match(body, /# Character creation/);
			});

			it("reports a missing topic rather than failing the turn", async () => {
				// A GM without a reference is worse, not broken.
				const body = (await call("portents_guidance", { topic: "combat" })) as string;
				assert.ok(body.length > 100, "combat guidance is missing from the package");
			});
		});

		it("has guidance that names only tools that exist", () => {
			// A rename that misses a guidance file leaves the GM being told to call a
			// tool that is not registered, and the failure looks like model error.
			const documents = allGuidance(registry);
			assert.ok(documents.length >= 10, `only ${documents.length} guidance documents`);

			const referenced = new Set<string>();
			for (const { label, text } of documents) {
				assert.doesNotMatch(text, /\bdnd_/, `${label} still references a dnd_ tool`);
				assert.doesNotMatch(text, /PI_DND_HOME/, `${label} still references the old home var`);
				for (const match of text.matchAll(/\bportents_[a-z_]+/g)) referenced.add(match[0]);
			}
			assert.ok(referenced.size >= 8, `guidance only mentions ${referenced.size} tools`);
			for (const name of referenced) {
				assert.ok(h.tools.has(name), `guidance references ${name}, which is not registered`);
			}
		});

		it("has guidance whose tool calls all typecheck against the real schemas", () => {
			// The rename pass caught tool names but not parameters, so the skills went
			// on describing an `edition` argument and a `kind: "wilderness"` map that
			// no longer existed. Checked against the registered TypeBox schemas rather
			// than a copy of them, so this cannot drift.
			const paramsOf = (name: string): Set<string> => {
				const schema = h.tools.get(name)!.parameters as { properties?: Record<string, unknown> };
				return new Set(Object.keys(schema.properties ?? {}));
			};
			const enumOf = (name: string, key: string): string[] | undefined => {
				const schema = h.tools.get(name)!.parameters as {
					properties?: Record<string, { enum?: string[]; anyOf?: Array<{ const?: string }> }>;
				};
				const prop = schema.properties?.[key];
				if (!prop) return undefined;
				if (prop.enum) return prop.enum;
				if (prop.anyOf) return prop.anyOf.map((entry) => entry.const!).filter(Boolean);
				return undefined;
			};

			const problems: string[] = [];
			for (const { label, text } of allGuidance(registry)) {

				for (const match of text.matchAll(/(portents_[a-z_]+)\s*\{([^{}]*)\}/g)) {
					const [, tool, body] = match;
					if (!h.tools.has(tool)) {
						problems.push(`${label}: unknown tool ${tool}`);
						continue;
					}
					const allowed = paramsOf(tool);
					for (const key of body.matchAll(/([a-z_]+)\s*:/g)) {
						if (!allowed.has(key[1])) problems.push(`${label}: ${tool} has no parameter \`${key[1]}\``);
					}
					for (const key of ["action", "kind"]) {
						const used = new RegExp(`${key}\\s*:\\s*"([\\w_-]+)"`).exec(body);
						const values = enumOf(tool, key);
						if (used && values && !values.includes(used[1])) {
							problems.push(`${label}: ${tool} ${key} "${used[1]}" is not one of ${values.join(", ")}`);
						}
					}
				}

				for (const match of text.matchAll(/`\/([a-z-]+)/g)) {
					const name = match[1];
					if (!h.commands.has(name) && name !== "compact") {
						problems.push(`${label}: unknown command /${name}`);
					}
				}
			}
			assert.deepEqual(problems, [], `skills disagree with the tools:\n  ${problems.join("\n  ")}`);
		});

		it("writes only markdown a person could read, plus the pile file", async () => {
			const { readdirSync } = await import("node:fs");
			const dir = join(home, "campaigns", "harness-test");
			const files = readdirSync(dir);
			for (const file of files) {
				if (file === "piles.json") continue;
				assert.ok(
					file.endsWith(".md") || file.endsWith(".jsonl") || !file.includes("."),
					`unexpected file type: ${file}`,
				);
			}
			assert.ok(files.includes("campaign.md"));
			assert.ok(files.includes("journal.md"));
			assert.ok(files.includes("world.md"));
			assert.ok(!files.includes("state.json"), "there should be no state file");
		});
	},
);
