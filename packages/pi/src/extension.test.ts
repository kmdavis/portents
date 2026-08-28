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
import { after, before, describe, it } from "node:test";

const home = mkdtempSync(join(tmpdir(), "portent-ext-"));
process.env.PORTENT_HOME = home;

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
	};
	const pi = {
		registerTool: (tool: ToolDef) => h.tools.set(tool.name, tool),
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
 * Is pi itself available?
 *
 * Probed by resolving the package rather than by catching an import error,
 * because the old catch swallowed *any* "Cannot find module" -- including
 * `@portent/core` being broken. On a machine without pi the whole suite then
 * contributed `tests 0, pass 0, fail 0, skipped 0` and reported success, so a
 * real breakage inside the extension looked exactly like a missing dependency.
 */
const piState = await (async () => {
	const { existsSync } = await import("node:fs");
	const vendored = new URL("../node_modules/@earendil-works/pi-coding-agent", import.meta.url).pathname;
	const present = existsSync(vendored);
	try {
		await import("@earendil-works/pi-coding-agent");
		return { usable: true as const };
	} catch (error) {
		// Three states, not two. "Absent" is an environment fact and skips. "Present
		// but unimportable" is a broken vendoring and must fail: copying pi instead
		// of symlinking it orphaned its own dependency on chalk, and the suite
		// quietly dropped 38 tests while still exiting 0.
		return { usable: false as const, present, reason: (error as Error).message.split("\n")[0] };
	}
})();

const piAvailable = piState.usable;

/**
 * Loaded only when pi is present, and any failure now throws.
 *
 * A missing pi is an environment fact and skips visibly below. Anything else is
 * a bug and must fail loudly.
 */
const loaded = piAvailable
	? ((await import("./index.ts")).default as (pi: unknown) => void)
	: undefined;

describe("test environment", () => {
	// Always runs, so "the adapter was not tested" is visible in the output
	// instead of being indistinguishable from "the adapter passed".
	it(piAvailable ? "has pi linked, so the adapter suite runs" : "reports that the adapter suite was skipped", () => {
		if (piAvailable) return;
		if (piState.present) {
			assert.fail(
				`pi is vendored at packages/pi/node_modules but cannot be imported: ${piState.reason}\n` +
					"  That is a broken vendoring, not a missing dependency, so the adapter\n" +
					"  suite is being skipped for the wrong reason. Re-run `pnpm link-pi`.",
			);
		}
		console.error(
			"\n  NOTE: pi is not linked, so the adapter suite did not run.\n" +
				"  Run `pnpm link-pi` to exercise it.\n" +
				"  The parity suite below does not need pi.\n",
		);
	});
});

after(() => rmSync(home, { recursive: true, force: true }));

describe(
	"extension",
	{ skip: loaded ? false : "pi is not linked; run `pnpm --filter @portent/pi link-pi`" },
	async () => {
		const { pi, h } = makeHarness();
		loaded!(pi);
		const ctx = makeCtx(h);

		async function call(name: string, params: Record<string, unknown> = {}, useCtx: unknown = ctx) {
			const tool = h.tools.get(name);
			assert.ok(tool, `no tool ${name}`);
			const out = await tool.execute("t", params, undefined, undefined, useCtx);
			return out.content.map((part) => part.text).join("\n");
		}

		before(async () => {
			await call("portent_campaign", {
				action: "create",
				name: "Harness Test",
				system: "5e",
				premise: "A test.",
			});
		});

		it("registers every tool and command", () => {
			for (const name of [
				"portent_roll",
				"portent_ask_roll",
				"portent_odds",
				"portent_deck",
				"portent_table",
				"portent_oracle",
				"portent_map",
				"portent_campaign",
				"portent_sheet",
				"portent_verify_roll",
			]) {
				assert.ok(h.tools.has(name), `missing tool ${name}`);
			}
			for (const name of ["roll", "portent", "sheet", "draw", "oracle", "portent-status"]) {
				assert.ok(h.commands.has(name), `missing command ${name}`);
			}
		});

		it("uses the portent_ prefix, never the old dnd_ one", () => {
			for (const name of h.tools.keys()) assert.match(name, /^portent_/, name);
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
			const out = await call("portent_roll", { expression: "4d6kh3", reason: "ability score" });
			assert.match(out, /`r-\d+`/, out);
		});

		it("prefixes the id by kind, so a citation carries its own checksum", async () => {
			assert.match(await call("portent_roll", { expression: "1d20", kind: "hit" }), /`h-\d+`/);
			assert.match(await call("portent_roll", { expression: "1d8", kind: "damage" }), /`d-\d+`/);
			assert.match(await call("portent_roll", { expression: "1d20", kind: "death-save" }), /`k-\d+`/);
		});

		it("reports success and failure against a DC", async () => {
			assert.match(await call("portent_roll", { expression: "1d20+100", dc: 15 }), /\*\*success\*\*/);
			assert.match(await call("portent_roll", { expression: "1d20-100", dc: 15 }), /\*\*failure\*\*/);
		});

		it("rolls six ability scores from one call", async () => {
			const out = await call("portent_roll", { expression: "6#4d6kh3" });
			assert.equal((out.match(/`r-\d+`/g) ?? []).length, 6, out);
			assert.match(out, /Totals: /);
		});

		it("verifies a real id and exposes a fabricated one", async () => {
			const rolled = await call("portent_roll", { expression: "1d20", kind: "hit", reason: "shortbow" });
			const id = /`(h-\d+)`/.exec(rolled)![1];
			assert.match(await call("portent_verify_roll", { id }), /attack roll/);
			assert.match(await call("portent_verify_roll", { id: "h-9999" }), /never rolled/);
		});

		it("refuses campaign work with no campaign loaded", async () => {
			// A fresh registration has nothing open.
			const { pi: pi2, h: h2 } = makeHarness();
			loaded!(pi2);
			const tool = h2.tools.get("portent_sheet")!;
			await assert.rejects(
				() => tool.execute("t", { action: "list" }, undefined, undefined, makeCtx(h2)),
				/No campaign loaded/,
			);
		});

		describe("asking the player to roll", () => {
			it("puts a dialog up naming the reason, expression and DC", async () => {
				h.confirms.length = 0;
				h.confirmAnswer = true;
				await call("portent_ask_roll", { expression: "1d20+7", reason: "Stealth", dc: 15, kind: "skill" });
				assert.equal(h.confirms.length, 1);
				assert.match(h.confirms[0].title, /Stealth/);
				assert.match(h.confirms[0].title, /DC 15/);
				assert.match(h.confirms[0].message, /1d20\+7/);
			});

			it("rolls on confirm and hands the result back at once", async () => {
				h.confirmAnswer = true;
				const out = await call("portent_ask_roll", { expression: "1d20+7", reason: "Stealth", kind: "skill" });
				assert.match(out, /`s-\d+`/, out);
				assert.match(out, /Resolve it now/);
				assert.doesNotMatch(out, /wait/i);
			});

			it("treats cancelling as a choice, not a failure", async () => {
				h.confirmAnswer = false;
				const out = await call("portent_ask_roll", { expression: "1d20", reason: "Stealth" });
				assert.match(out, /declined/);
				assert.match(out, /do not roll it for them/);
				assert.doesNotMatch(out, /`[a-z]-\d+`/, "a declined roll must not produce a result");
				h.confirmAnswer = true;
			});

			it("clears the request when the expression cannot be rolled", async () => {
				// Otherwise the player's next unrelated /roll answers a request nobody
				// could have rolled.
				h.confirmAnswer = true;
				const out = await call("portent_ask_roll", { expression: "not dice", reason: "nonsense" });
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
					"portent_ask_roll",
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
					"portent_ask_roll",
					{ expression: "1d20", reason: "Stealth" },
					makeCtx(h, { hasUI: false }),
				);
				assert.match(out, /No interactive UI/);
				assert.match(out, /do not narrate an outcome yet/);
			});
		});

		describe("the banner", () => {
			async function renderBanner() {
				const handler = h.handlers.get("before_agent_start")![0];
				const result = (await handler({ systemPrompt: "BASE" }, ctx)) as { systemPrompt: string } | undefined;
				return result?.systemPrompt ?? "";
			}

			it("carries the state a compaction would lose", async () => {
				await call("portent_campaign", {
					action: "scene",
					summary: "At the causeway.",
					location: "Wrenfield",
				});
				await call("portent_campaign", { action: "clock", clock_name: "Tide", filled: 2, segments: 6 });
				await call("portent_sheet", {
					action: "create",
					character: "Brannoc",
					status: { HP: "26/26", AC: "15" },
				});
				const banner = await renderBanner();
				assert.match(banner, /^BASE/);
				assert.match(banner, /Harness Test/);
				assert.match(banner, /At the causeway\./);
				assert.match(banner, /Tide 2\/6/);
				assert.match(banner, /Brannoc/);
				assert.match(banner, /HP 26\/26/);
			});

			it("states the secrecy rule, which prompting alone keeps losing", async () => {
				const banner = await renderBanner();
				assert.match(banner, /Never cite an id, name a tool, or describe the mechanism/);
				assert.match(banner, /oracle answers, scene checks, table rolls, card draws/);
			});

			it("tells the GM to cite ids for the player's own mechanics", async () => {
				assert.match(await renderBanner(), /Cite the ledger id only for mechanics the player can see/);
			});
		});

		describe("content", () => {
			it("lists and rolls a table without leaking the mechanism", async () => {
				assert.match(await call("portent_table", { action: "list" }), /`weather`/);
				const out = await call("portent_table", { action: "roll", table: "weather" });
				assert.ok(out.trim().length > 0);
				assert.doesNotMatch(out, /`[a-z]-\d+`/, "a table result must not carry a citable id");
			});

			it("draws from a deck and keeps the card gone", async () => {
				const first = await call("portent_deck", { action: "draw", deck: "crit-hits" });
				assert.match(first, /left\._$/m);
				const status = await call("portent_deck", { action: "status", deck: "crit-hits" });
				assert.match(status, /of \d+ left/);
			});

			it("refuses status and shuffle without a campaign instead of drawing a card", async () => {
				// These used to fall through to an ephemeral draw, handing back a random
				// card that the GM would then narrate as a real result.
				const { pi: pi2, h: h2 } = makeHarness();
				loaded!(pi2);
				const tool = h2.tools.get("portent_deck")!;
				for (const action of ["status", "shuffle", "recent"]) {
					await assert.rejects(
						() => tool.execute("t", { action, deck: "crit-hits" }, undefined, undefined, makeCtx(h2)),
						/needs a loaded campaign/,
						`${action} did not refuse`,
					);
				}
			});

			it("says which decks exist when asked for one that does not", async () => {
				await assert.rejects(() => call("portent_deck", { action: "draw", deck: "nope" }), /Available: /);
			});

			it("answers the oracle with no citable id", async () => {
				const out = await call("portent_oracle", { kind: "yes_no", question: "Is the gate guarded?" });
				assert.ok(out.trim().length > 0);
				assert.doesNotMatch(out, /`[a-z]-\d+`/);
			});

			it("supports every oracle kind", async () => {
				for (const kind of ["yes_no", "meaning", "how_many", "reaction", "scene", "gm_move"]) {
					const out = await call("portent_oracle", { kind, question: "x" });
					assert.ok(out.trim().length > 0, `${kind} produced nothing`);
				}
			});

			it("generates a dungeon that is reproducible from its seed", async () => {
				const first = await call("portent_map", { rooms: 4, seed: "fixed-seed" });
				const second = await call("portent_map", { rooms: 4, seed: "fixed-seed" });
				assert.equal(first, second, "same seed gave a different dungeon");
				assert.match(first, /Seed: `fixed-seed`/);
			});
		});

		describe("the sheet", () => {
			it("patches status with a delta and persists it", async () => {
				await call("portent_sheet", { action: "patch_status", character: "Brannoc", status: { HP: "-7" } });
				assert.match(await call("portent_sheet", { action: "read", character: "Brannoc" }), /19\/26/);
			});

			it("does not stamp one system's headings onto every character", async () => {
				// The campaign resolves sections from content for its own system. A
				// hardcoded list here put "Attacks & Spellcasting" on an investigator.
				const { readFileSync } = await import("node:fs");
				const raw = readFileSync(join(home, "campaigns", "harness-test", "characters", "brannoc.md"), "utf8");
				assert.doesNotMatch(raw, /Attacks & Spellcasting/, "a hardcoded 5E heading came back");
				assert.match(raw, /## Concept/, "the generic scaffold was not applied");
			});

			it("lists characters", async () => {
				assert.match(await call("portent_sheet", { action: "list" }), /brannoc/);
			});

			it("appends to a section", async () => {
				await call("portent_sheet", {
					action: "append_section",
					character: "Brannoc",
					section: "Equipment",
					body: "- Longbow",
				});
				assert.match(await call("portent_sheet", { action: "read", character: "Brannoc" }), /Longbow/);
			});
		});

		describe("commands", () => {
			it("/roll answers an outstanding request and makes the GM respond", async () => {
				// Set the request up here rather than relying on an earlier test having
				// left one behind: the headless ask_roll path does leave one, and
				// depending on that made this block order-sensitive.
				await call(
					"portent_ask_roll",
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

			it("/portent-status lists recent rolls", async () => {
				h.entries.length = 0;
				await h.commands.get("portent-status")!.handler("", ctx);
				const entry = h.entries.find((e) => e.customType === "portent-status");
				assert.ok(entry, "no status entry appended");
				assert.match((entry.data as { text: string }).text, /Harness Test/);
			});

			it("/draw writes a ledger entry, like the tool does", async () => {
				// The command bypassed the tool's append, so a card the player drew
				// themselves never reached the audit log and the counter ran ahead.
				const before = (await call("portent_deck", { action: "recent", deck: "npc-sparks" })).length;
				await h.commands.get("draw")!.handler("npc-sparks", ctx);
				h.entries.length = 0;
				await h.commands.get("portent-status")!.handler("", ctx);
				const status = (h.entries.find((e) => e.customType === "portent-status")!.data as { text: string }).text;
				assert.match(status, /`c-\d+`/, `no card entry in the ledger:\n${status}`);
				void before;
			});

			it("/draw completes deck ids", () => {
				const items = h.commands.get("draw")!.getArgumentCompletions!("crit") as Array<{ value: string }>;
				assert.ok(items.some((item) => item.value === "crit-hits"));
			});
		});

		it("has skills that name only tools that exist", async () => {
			// A rename that misses a skill file leaves the GM being told to call a
			// tool that is not registered, and the failure looks like model error.
			const { readdirSync, readFileSync, existsSync } = await import("node:fs");
			const skillRoot = new URL("../skills", import.meta.url).pathname;
			assert.ok(existsSync(skillRoot), "no skills directory");
			const files: string[] = [];
			const walk = (dir: string) => {
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					const full = join(dir, entry.name);
					if (entry.isDirectory()) walk(full);
					else if (entry.name.endsWith(".md")) files.push(full);
				}
			};
			walk(skillRoot);
			assert.ok(files.length >= 5, `only ${files.length} skill files found`);

			const referenced = new Set<string>();
			for (const file of files) {
				const text = readFileSync(file, "utf8");
				assert.doesNotMatch(text, /\bdnd_/, `${file} still references a dnd_ tool`);
				assert.doesNotMatch(text, /PI_DND_HOME/, `${file} still references the old home var`);
				for (const match of text.matchAll(/\bportent_[a-z_]+/g)) referenced.add(match[0]);
			}
			assert.ok(referenced.size >= 8, `skills only mention ${referenced.size} tools`);
			for (const name of referenced) {
				assert.ok(h.tools.has(name), `skills reference ${name}, which is not registered`);
			}
		});

		it("has skills whose tool calls all typecheck against the real schemas", async () => {
			// The rename pass caught tool names but not parameters, so the skills went
			// on describing an `edition` argument and a `kind: "wilderness"` map that
			// no longer existed. Checked against the registered TypeBox schemas rather
			// than a copy of them, so this cannot drift.
			const { readdirSync, readFileSync } = await import("node:fs");
			const skillRoot = new URL("../skills", import.meta.url).pathname;
			const files: string[] = [];
			const walk = (dir: string) => {
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					const full = join(dir, entry.name);
					if (entry.isDirectory()) walk(full);
					else if (entry.name.endsWith(".md")) files.push(full);
				}
			};
			walk(skillRoot);

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
			for (const file of files) {
				const text = readFileSync(file, "utf8");
				const label = file.split("/").at(-1);

				for (const match of text.matchAll(/(portent_[a-z_]+)\s*\{([^{}]*)\}/g)) {
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
