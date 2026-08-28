/**
 * The model side of the demo: build a client from settings, then run a GM turn.
 *
 * DOM-free, so the interesting parts are testable and the UI stays a thin layer over
 * it -- the same split `WebSession` uses, and for the same reason.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ContentRegistry } from "@portents/core";
import { CORE_GUIDANCE } from "@portents/guidance";
import type { WebSession } from "@portents/web";
import { type LanguageModel, type ModelMessage, stepCountIs, streamText, type Tool } from "ai";

import { detectProvider, MODELS, type Settings } from "./setup.ts";

/**
 * Build a language model from the visitor's settings.
 *
 * Both SDKs are told the key belongs in the browser. That is the point of the demo --
 * there is no server to hold it -- but it does mean the key travels from this page
 * straight to the provider, which is why the form says so.
 */
/**
 * Provider options, keyed by provider name.
 *
 * The SDK's own `ProviderOptions` is not exported, so this mirrors the shape it
 * accepts: a JSON-ish value per provider.
 */
export type ReasoningOptions = Record<string, Record<string, unknown>>;

/**
 * Provider options that make a model return its reasoning.
 *
 * Both vendors compute reasoning by default on these models and neither *returns* it
 * unless asked, which is why the demo showed no thinking at all:
 *
 * - OpenAI needs `reasoningSummary`. `reasoningEffort` alone changes how hard the model
 *   thinks, not whether you are told about it.
 * - Anthropic needs `thinking: { type: "enabled" }` with a token budget.
 *
 * Only sent for models in our own catalogue. A custom gateway pointed at some other
 * model would otherwise be handed options it may reject, turning a working setup into
 * a request that fails.
 */
export function reasoningOptions(settings: Settings): ReasoningOptions | undefined {
	const known = MODELS.find((model) => model.id === settings.model);
	if (!known) return undefined;

	if (known.wire === "anthropic") {
		// A budget, not a cap on usefulness: below about a thousand tokens the summaries
		// are too terse to tell you anything about how a ruling was reached.
		return { anthropic: { thinking: { type: "enabled", budgetTokens: 4096 } } };
	}
	return { openai: { reasoningEffort: "medium", reasoningSummary: "auto" } };
}

export function buildModel(settings: Settings): LanguageModel {
	const provider = detectProvider(settings.apiKey, settings.baseUrl);

	if (provider.wire === "anthropic") {
		const anthropic = createAnthropic({
			apiKey: settings.apiKey,
			...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
			headers: {
				// Anthropic refuses direct browser calls without this opt-in. The spelling is
				// from pi's own model layer, which sends the same header.
				"anthropic-dangerous-direct-browser-access": "true",
			},
		});
		return anthropic(settings.model);
	}

	const openai = createOpenAI({
		apiKey: settings.apiKey,
		...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
	});
	return openai(settings.model);
}

/**
 * The system prompt for a turn.
 *
 * Assembled the same way the pi extension assembles its standing briefing, from the
 * same two sources: harness-neutral guidance from `@portents/guidance`, and the system
 * in play from the content registry. Stable for a given campaign, so a provider that
 * caches prompt prefixes can.
 *
 * Volatile state is deliberately **not** here. It goes in a message, for the reason
 * documented at length on the pi extension's `standingBriefing`: anything changing in
 * the system prompt invalidates the cached prefix on every single turn.
 */
export function systemPrompt(registry: ContentRegistry, session: WebSession): string {
	const campaign = session.campaign;
	const parts: string[] = [
		"You are the game master of a solo tabletop RPG, played through a chat window.",
		"",
		"This harness is a web page. There are no slash commands and no files the player can open:",
		"campaign state lives in their browser and you are the only one who can read or write it.",
		"Keep replies short -- two or three paragraphs at most -- and end by handing control back.",
		"",
		CORE_GUIDANCE,
	];

	if (campaign) {
		const found = registry.guidanceFor(campaign.systemLine) ?? registry.guidanceFor(campaign.system);
		parts.push(
			"---",
			found
				? `# System guidance: ${found.id}\n\n${found.body}`
				: [
						`# System guidance: none loaded for ${JSON.stringify(campaign.systemLine)}`,
						"",
						"No content pack claims this system. Make rulings that favour the fiction, say plainly",
						"that they are rulings rather than rules, and stay consistent with earlier ones.",
					].join("\n"),
		);
	} else {
		parts.push(
			"---",
			"# No campaign is open",
			"",
			'Call portents_campaign { action: "list" } before anything else. It reports saved games and',
			"which systems this build can run. Then run session zero, or open the game they name.",
		);
	}

	return parts.join("\n\n");
}

/**
 * The state a turn needs to know about that changes between turns.
 *
 * Sent as a message rather than in the system prompt, so the prefix stays cacheable.
 */
export async function stateDigest(session: WebSession): Promise<string | undefined> {
	const campaign = session.campaign;
	if (!campaign) return undefined;

	const lines = [`## Session state — ${campaign.name} (${campaign.systemLine})`];

	const character = campaign.activeCharacter;
	lines.push(character ? `Character: ${character}` : "Character: **none yet — build one before play starts**");

	const scene = campaign.scene;
	if (scene) lines.push(`Scene: ${[scene.summary, scene.location].filter(Boolean).join(" · ")}`);

	const clocks = campaign.clocks;
	if (clocks.length > 0) {
		lines.push(`Clocks: ${clocks.map((clock) => `${clock.name} ${clock.filled}/${clock.segments}`).join(" · ")}`);
	}

	const recent = campaign.ledger.recent(5);
	if (recent.length > 0) {
		lines.push(`Recent results: ${recent.map((entry) => `${entry.id} ${entry.result}`).join(" · ")}`);
	}

	return lines.join("\n");
}

export interface TurnHandlers {
	/** Called with each chunk of the GM's prose. */
	onText: (delta: string) => void;
	/**
	 * Called with each chunk of the model's reasoning, where a model emits it.
	 *
	 * Kept separate from prose because it is not narration and must not be rendered as
	 * such: reasoning routinely says what the oracle returned and what the GM decided
	 * not to do, which is exactly the material the secrecy rule keeps off the table.
	 */
	onReasoning?: (delta: string) => void;
	/** Called when a step finishes, so the UI can show what the tools did. */
	onStep?: () => void;
}

/**
 * Run one GM turn: stream prose, let the model call tools, stop when it stops.
 *
 * `stopWhen: stepCountIs(12)` bounds a runaway loop. Twelve is generous for a normal
 * turn -- a fight round might use five or six -- and a bound that never fires is worth
 * more than one tuned to the average, because the failure it prevents is an endless
 * billed loop rather than a truncated reply.
 */
export async function runTurn(options: {
	model: LanguageModel;
	system: string;
	messages: ModelMessage[];
	tools: Record<string, Tool>;
	handlers: TurnHandlers;
	providerOptions?: ReasoningOptions;
}): Promise<ModelMessage[]> {
	const result = streamText({
		model: options.model,
		system: options.system,
		messages: options.messages,
		tools: options.tools,
		...(options.providerOptions ? { providerOptions: options.providerOptions as never } : {}),
		stopWhen: stepCountIs(12),
		onStepFinish: () => options.handlers.onStep?.(),
	});

	// fullStream rather than textStream, so reasoning parts are visible. Providers that
	// emit none simply never produce those parts.
	for await (const part of result.fullStream) {
		if (part.type === "text-delta") options.handlers.onText(part.text);
		else if (part.type === "reasoning-delta") options.handlers.onReasoning?.(part.text);
	}

	// The full message list, tool calls and results included, so the next turn has the
	// same history the model just saw.
	return (await result.response).messages;
}
