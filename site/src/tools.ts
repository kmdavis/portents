/**
 * The engine, exposed to a model as AI SDK tools.
 *
 * The same names the pi extension uses -- `portents_roll`, `portents_oracle` and so
 * on -- because `@portents/guidance` names them in prose, and that prose is shared
 * between the two harnesses. A demo that called them something else would need its own
 * copy of the guidance, which is the duplication this project keeps designing away.
 *
 * Schemas are declared with the SDK's `jsonSchema` helper rather than Zod, to avoid
 * pulling a validation library into a bundle that ships to a browser.
 */

import type { WebSession } from "@portents/web";
import { jsonSchema, type Tool, tool } from "ai";

import { campaignAction, type CampaignParams, sheetAction, type SheetParams } from "./actions.ts";

/** What a tool call did, for the transcript. */
export interface ToolTrace {
	readonly name: string;
	readonly summary: string;
	/**
	 * May the player see this?
	 *
	 * The secrecy rule the whole project is built around: dice the player's character
	 * rolls are public and cited, world-generation randomness is not. The transcript UI
	 * hides the private ones, so an oracle answer does not leak through the very
	 * interface meant to conceal it.
	 */
	readonly secret: boolean;
}

const str = (description: string) => ({ type: "string" as const, description });

/**
 * Prefix a GM-facing result with the rule it is about to tempt the model to break.
 *
 * These results carry the mechanism -- an oracle answer arrives as
 * "**NO, AND** ... _unlikely, d100 91 vs 30_" -- and a model that pastes that into its
 * reply has told the player which parts of the world were dice and which were
 * authored. The transcript already hides the tool call; this stops the *text* leaking
 * through the reply instead. The pi extension does the same thing for the same reason.
 */
const gmOnly = (body: string) =>
	[
		"[GM-FACING — the player must not see this]",
		"Translate it into fiction. Do not quote it, name a tool, cite an id, or mention dice.",
		"",
		body,
	].join("\n");
const num = (description: string) => ({ type: "number" as const, description });

/**
 * Build the tool set for one session.
 *
 * `onTrace` is how the UI learns what happened; the model's own view is the returned
 * string. Both matter: the model needs the result, the player needs to see that a real
 * die was rolled.
 */
export function portentsTools(session: WebSession, onTrace: (trace: ToolTrace) => void): Record<string, Tool> {
	const trace = (name: string, summary: string, secret = false) => onTrace({ name, summary, secret });

	return {
		portents_roll: tool({
			description:
				"Roll dice for anything the GM rolls: monster attacks, damage, NPC saves, hidden checks. " +
				"Foundry notation: 2d20kh1 (advantage), 4d6kh3, 1d8+3, 8d6, 6#4d6kh3 to repeat. " +
				"Never write a die result you did not get from this tool.",
			inputSchema: jsonSchema<{ expression: string; reason?: string; dc?: number }>({
				type: "object",
				properties: {
					expression: str('Dice expression, e.g. "2d20kh1+5"'),
					reason: str("What the roll is for"),
					dc: num("Target number, if there is one"),
				},
				required: ["expression"],
			}),
			execute: async ({ expression, reason, dc }) => {
				const result = await session.roll(expression, { ...(reason ? { reason } : {}), ...(dc === undefined ? {} : { dc }) });
				trace("roll", `${expression} → ${result.totals.join(", ")}`);
				return result.lines.join("\n");
			},
		}),

		portents_ask_roll: tool({
			description:
				"Ask the PLAYER to roll their own dice: their attacks, damage, checks, saves, initiative, " +
				"death saves, hit dice. Use this rather than rolling for them. Returns their result.",
			inputSchema: jsonSchema<{ expression: string; reason: string; dc?: number }>({
				type: "object",
				properties: {
					expression: str('What they should roll, e.g. "1d20+5"'),
					reason: str('What it is for, e.g. "Stealth past the sentry"'),
					dc: num("The DC, if they may know it"),
				},
				required: ["expression", "reason"],
			}),
			// Resolved by the UI, not here: it has to wait for a human. See askRoll in main.ts.
			execute: undefined as never,
		}),

		portents_odds: tool({
			description: "Probability of a dice expression: mean, spread, and the chance of meeting a DC.",
			inputSchema: jsonSchema<{ expression: string; dc?: number }>({
				type: "object",
				properties: { expression: str("Dice expression"), dc: num("Report the chance of at least this") },
				required: ["expression"],
			}),
			execute: async ({ expression, dc }) => session.odds(expression, dc),
		}),

		portents_oracle: tool({
			description:
				"Answer a question about the world you have NOT already decided, using dice instead of your " +
				'own judgement. Kinds: yes_no (with a likelihood), meaning, how_many, reaction, scene, gm_move. ' +
				"GM-FACING: translate the answer into fiction. Never tell the player you consulted it.",
			inputSchema: jsonSchema<{ kind: string; question?: string; likelihood?: string }>({
				type: "object",
				properties: {
					kind: {
						type: "string",
						enum: ["yes_no", "meaning", "how_many", "reaction", "scene", "gm_move"],
						description: "What sort of answer you need",
					},
					question: str("The question, for yes_no"),
					likelihood: {
						type: "string",
						enum: ["certain", "very likely", "likely", "even", "unlikely", "very unlikely", "impossible"],
						description: "How likely a yes is. Defaults to even.",
					},
				},
				required: ["kind"],
			}),
			execute: async ({ kind, question, likelihood }) => {
				const answer = await session.oracle(kind as never, question, likelihood as never);
				trace("oracle", `${kind}${question ? `: ${question}` : ""}`, true);
				return gmOnly(answer);
			},
		}),

		portents_table: tool({
			description:
				"Roll on a random content table: encounters, weather, rumours, names, hooks, dressing, traps, " +
				"treasure, NPC mannerisms. GM-FACING: use the result, do not quote the table or say you rolled.",
			inputSchema: jsonSchema<{ table: string }>({
				type: "object",
				properties: { table: str('Table id, e.g. "encounters-dungeon". Omit to list.') },
				required: [],
			}),
			execute: async ({ table }) => {
				if (!table) return `Tables: ${session.tableIds().join(", ")}`;
				const result = await session.rollTable(table);
				trace("table", table, true);
				return gmOnly(result);
			},
		}),

		portents_deck: tool({
			description:
				"Draw from a content deck. With a campaign open the pile persists, so a drawn card stays gone. " +
				"GM-FACING except crit/fumble cards resolving the player's own attack, which they watched happen.",
			inputSchema: jsonSchema<{ deck: string; count?: number }>({
				type: "object",
				properties: { deck: str('Deck id, e.g. "crit-hits". Omit to list.'), count: num("How many (default 1)") },
				required: [],
			}),
			execute: async ({ deck, count }) => {
				if (!deck) return `Decks: ${session.deckIds().join(", ")}`;
				const result = (await session.draw(deck, count ?? 1)).join("\n");
				trace("deck", `${deck} ×${count ?? 1}`, true);
				// Crit and fumble cards resolving the player's own attack are the exception:
				// they watched that land, so naming the card is fair. The GM decides, and the
				// standing guidance tells it how.
				return deck.startsWith("crit-") ? result : gmOnly(result);
			},
		}),

		portents_map: tool({
			description:
				"Generate a dungeon. Returns a text grid to show the player, and draws the vector map beside " +
				"the chat. Seeded, so the same seed regenerates the same map.",
			inputSchema: jsonSchema<{ rooms?: number; seed?: string }>({
				type: "object",
				properties: { rooms: num("Target room count (default 9)"), seed: str("Reuse to regenerate exactly") },
				required: [],
			}),
			execute: async ({ rooms, seed }) => {
				const map = session.map({ rooms: rooms ?? 9, seed });
				trace("map", `${rooms ?? 9} rooms, seed ${map.seed}`);
				return map.ascii;
			},
		}),

		portents_campaign: tool({
			description:
				"Create, open and update the campaign. Actions: list, create, open, brief, journal, scene, clock. " +
				"State persists in this browser. Write to the journal at the end of every scene.",
			inputSchema: jsonSchema<{
				action: string;
				name?: string;
				system?: string;
				heading?: string;
				body?: string;
				summary?: string;
				location?: string;
				clock_name?: string;
				filled?: number;
				segments?: number;
			}>({
				type: "object",
				properties: {
					action: {
						type: "string",
						enum: ["list", "create", "open", "brief", "journal", "scene", "clock"],
						description: "What to do",
					},
					name: str("Campaign name (create) or slug (open)"),
					system: str('System line, e.g. "5e (2024)"'),
					heading: str("Journal entry heading"),
					body: str("Journal or world text"),
					summary: str("Scene summary"),
					location: str("Where the party is"),
					clock_name: str("Clock name"),
					filled: num("Segments filled"),
					segments: num("Segments total"),
				},
				required: ["action"],
			}),
			execute: async (params: CampaignParams) => campaignAction(session, params),
		}),

		portents_sheet: tool({
			description:
				"Read and write the character sheet. Actions: create, read, patch_status, set_section, " +
				"append_section. Patch it the moment anything changes: damage, healing, a spent slot, an item.",
			inputSchema: jsonSchema<{
				action: string;
				character?: string;
				concept?: string;
				section?: string;
				body?: string;
				status?: Record<string, string>;
				abilities?: Record<string, string>;
			}>({
				type: "object",
				properties: {
					action: {
						type: "string",
						enum: ["create", "read", "patch_status", "set_section", "append_section", "list"],
						description: "What to do",
					},
					character: str("Character name"),
					concept: str('e.g. "Level 3 Wood Elf Ranger"'),
					section: str("Section heading"),
					body: str("Markdown for the section"),
					status: {
						type: "object",
						additionalProperties: { type: "string" },
						description: 'Status keys, e.g. {"HP": "-7"}. Deltas allowed.',
					},
					abilities: {
						type: "object",
						additionalProperties: { type: "string" },
						description: 'e.g. {"STR": "12 (+1)"}',
					},
				},
				required: ["action"],
			}),
			execute: async (params: SheetParams) => sheetAction(session, params),
		}),

		portents_guidance: tool({
			description:
				"Read deeper GM guidance on one topic: character-creation, combat, solo-techniques. " +
				"The standing guidance is already in your context; read a topic when it is about to matter.",
			inputSchema: jsonSchema<{ topic: string }>({
				type: "object",
				properties: {
					topic: {
						type: "string",
						enum: ["character-creation", "combat", "solo-techniques"],
						description: "Which topic",
					},
				},
				required: ["topic"],
			}),
			execute: async ({ topic }) => session.guidance(topic),
		}),

		portents_verify_roll: tool({
			description: "Look up a ledger id to confirm a roll really happened and what it produced.",
			inputSchema: jsonSchema<{ id: string }>({
				type: "object",
				properties: { id: str('Ledger id, e.g. "r-12"') },
				required: ["id"],
			}),
			execute: async ({ id }) => session.verify(id),
		}),
	};
}

/** Tool names whose results the player may see. Everything else is GM-facing. */
export const PUBLIC_TOOLS: readonly string[] = [
	"portents_roll",
	"portents_ask_roll",
	"portents_odds",
	"portents_map",
	"portents_verify_roll",
];
