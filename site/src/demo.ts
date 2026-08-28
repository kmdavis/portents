/**
 * The demo's DOM layer, and nothing else.
 *
 * Every decision worth testing lives elsewhere -- provider routing in `setup.ts`, tool
 * behaviour in `tools.ts`, prompt assembly in `agent.ts`. This file wires those to
 * elements and is deliberately dull, which is the point: a bug here is visible on
 * screen, whereas a bug in the routing is not.
 */

import { BrowserStorage } from "@portents/core/browser";
import { WebSession } from "@portents/web";
import type { ModelMessage } from "ai";

import { buildModel, runTurn, stateDigest, systemPrompt } from "./agent.ts";
import {
	clearSettings,
	defaultModelFor,
	detectProvider,
	loadSettings,
	modelsFor,
	saveSettings,
	type Settings,
	settingsProblems,
} from "./setup.ts";
import { portentsTools, type ToolTrace } from "./tools.ts";

const $ = <T extends HTMLElement>(id: string): T => {
	const found = document.getElementById(id);
	if (!found) throw new Error(`missing element #${id}`);
	return found as T;
};

const setupSection = $("setup");
const gameSection = $("game");
const form = $<HTMLFormElement>("setup-form");
const keyInput = $<HTMLInputElement>("api-key");
const baseInput = $<HTMLInputElement>("base-url");
const modelSelect = $<HTMLSelectElement>("model");
const providerHint = $("provider-hint");
const problemList = $("setup-problems");
const transcript = $("transcript");
const sayForm = $<HTMLFormElement>("say-form");
const sayBox = $<HTMLTextAreaElement>("say");
const sendButton = $<HTMLButtonElement>("send");
const campaignLabel = $("campaign-label");
const mapPane = $("map-pane");
const mapHolder = $("map-holder");
const showMapButton = $<HTMLButtonElement>("show-map");
const rollDialog = $<HTMLDialogElement>("roll-dialog");

const session = new WebSession({ storage: new BrowserStorage({ database: "portents-demo" }) });
let history: ModelMessage[] = [];
let settings: Settings | undefined;
let busy = false;

// ── Setup ────────────────────────────────────────────────────────────────────

/** Repopulate the model list for whatever the key looks like now. */
function refreshModels(): void {
	const provider = detectProvider(keyInput.value, baseInput.value);
	providerHint.textContent = keyInput.value.trim()
		? `Detected: ${provider.label}`
		: "Recognised from the prefix.";

	const wanted = modelSelect.value;
	const offered = modelsFor(provider);
	modelSelect.replaceChildren(
		...offered.map((model) => {
			const option = document.createElement("option");
			option.value = model.id;
			option.textContent = model.recommended ? `${model.label} (recommended)` : model.label;
			return option;
		}),
	);
	// Keep an explicit choice if it is still on offer, otherwise take the default.
	modelSelect.value = offered.some((model) => model.id === wanted) ? wanted : defaultModelFor(provider);
}

keyInput.addEventListener("input", refreshModels);
baseInput.addEventListener("input", refreshModels);

form.addEventListener("submit", (event) => {
	event.preventDefault();
	const candidate: Settings = {
		apiKey: keyInput.value.trim(),
		model: modelSelect.value,
		...(baseInput.value.trim() ? { baseUrl: baseInput.value.trim() } : {}),
	};

	const problems = settingsProblems(candidate);
	problemList.replaceChildren(
		...problems.map((problem) => {
			const item = document.createElement("li");
			item.textContent = problem;
			return item;
		}),
	);
	problemList.hidden = problems.length === 0;
	if (problems.length > 0) return;

	saveSettings(candidate);
	settings = candidate;
	showGame();
});

$<HTMLButtonElement>("reset").addEventListener("click", () => {
	clearSettings();
	settings = undefined;
	gameSection.hidden = true;
	setupSection.hidden = false;
});

// ── Transcript ───────────────────────────────────────────────────────────────

function addTurn(role: "player" | "gm"): HTMLElement {
	const turn = document.createElement("div");
	turn.className = `turn ${role}`;
	transcript.append(turn);
	return turn;
}

function scrollDown(): void {
	transcript.scrollTop = transcript.scrollHeight;
}

/**
 * Render the GM's prose.
 *
 * Markdown is handled with a deliberately tiny transform rather than a library: bold,
 * inline code, fenced blocks and paragraphs. That covers what the guidance actually
 * asks the GM to produce, and keeps a parser out of the bundle.
 *
 * Text is assigned through `textContent` on created elements, never `innerHTML`, so a
 * model that emits a script tag emits a visible script tag.
 */
function renderProse(target: HTMLElement, text: string): void {
	target.replaceChildren();
	for (const block of text.split(/\n{2,}/)) {
		if (!block.trim()) continue;

		const fenced = block.match(/^```[a-z]*\n([\s\S]*?)\n?```$/);
		if (fenced) {
			const pre = document.createElement("pre");
			const code = document.createElement("code");
			code.textContent = fenced[1];
			pre.append(code);
			target.append(pre);
			continue;
		}

		// A map grid arrives as plain lines of wall characters; showing it as prose
		// destroys it, so anything that looks like a grid gets monospaced.
		if (/^[#.+<>ST~\s]{12,}$/.test(block) && block.includes("\n")) {
			const pre = document.createElement("pre");
			const code = document.createElement("code");
			code.textContent = block;
			pre.append(code);
			target.append(pre);
			continue;
		}

		const paragraph = document.createElement("p");
		let rest = block;
		const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/;
		for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
			paragraph.append(rest.slice(0, match.index));
			const element = document.createElement(match[1] ? "strong" : "code");
			element.textContent = match[1] ?? match[2];
			paragraph.append(element);
			rest = rest.slice(match.index + match[0].length);
		}
		paragraph.append(rest);
		target.append(paragraph);
	}
}

/**
 * Show what the tools did, without spoiling the game.
 *
 * Public calls are named; GM-facing ones are counted but not described. Listing
 * "oracle: is the gate guarded?" in the transcript would defeat the secrecy rule
 * through the very interface meant to uphold it, while hiding them completely would
 * hide the dice the demo exists to prove are real.
 */
function renderTraces(target: HTMLElement, traces: readonly ToolTrace[]): void {
	if (traces.length === 0) return;
	const line = document.createElement("p");
	line.className = "tools";

	const open = traces.filter((trace) => !trace.secret);
	for (const trace of open) {
		const chip = document.createElement("code");
		chip.textContent = trace.summary;
		line.append(chip, " ");
	}
	const hidden = traces.length - open.length;
	if (hidden > 0) line.append(`+${hidden} behind the screen`);
	target.append(line);
}

function showError(message: string): void {
	const box = document.createElement("div");
	box.className = "error";
	// Verbatim. A wrong model id or a CORS refusal is only diagnosable if the
	// provider's own words survive.
	box.textContent = message;
	transcript.append(box);
	scrollDown();
}

// ── The player's own rolls ───────────────────────────────────────────────────

/**
 * Ask the human to roll, and return what happened.
 *
 * A cancel is a real answer, not an error: they have chosen to do something else, and
 * the GM is told so rather than being left to assume a failed attempt.
 */
async function askRoll(expression: string, reason: string, dc?: number): Promise<string> {
	$("roll-reason").textContent = dc === undefined ? reason : `${reason} (DC ${dc})`;
	$("roll-expression").textContent = expression;

	const choice = await new Promise<string>((resolve) => {
		rollDialog.addEventListener("close", () => resolve(rollDialog.returnValue), { once: true });
		rollDialog.showModal();
	});

	if (choice !== "roll") {
		return "The player declined this roll — they are doing something else instead. Ask them what, and do not narrate the original action as attempted.";
	}

	const outcome = await session.roll(expression, { reason, ...(dc === undefined ? {} : { dc }) });
	const turn = addTurn("player");
	renderProse(turn, `Rolled ${expression} — ${outcome.lines.join("; ")}`);
	scrollDown();
	return outcome.lines.join("\n");
}

// ── A turn ───────────────────────────────────────────────────────────────────

function updateChrome(): void {
	const campaign = session.campaign;
	campaignLabel.textContent = campaign ? `${campaign.name} · ${campaign.systemLine}` : "No campaign";
}

async function send(text: string): Promise<void> {
	if (busy || !settings) return;
	busy = true;
	sendButton.disabled = true;

	if (text) {
		renderProse(addTurn("player"), text);
		history.push({ role: "user", content: text });
	}

	const digest = await stateDigest(session);
	if (digest) history.push({ role: "user", content: digest });

	const traces: ToolTrace[] = [];
	const tools = portentsTools(session, (trace) => traces.push(trace));

	// ask_roll has no server-side execute: it has to wait for a human.
	tools.portents_ask_roll = {
		...tools.portents_ask_roll,
		execute: async ({ expression, reason, dc }: { expression: string; reason: string; dc?: number }) =>
			askRoll(expression, reason, dc),
	} as typeof tools.portents_ask_roll;

	// Draw the map beside the chat whenever one is generated.
	const originalMap = tools.portents_map.execute;
	tools.portents_map = {
		...tools.portents_map,
		execute: async (args: { rooms?: number; seed?: string }, opts: unknown) => {
			const result = session.map({ rooms: args.rooms ?? 9, ...(args.seed ? { seed: args.seed } : {}) });
			// DOMParser rather than innerHTML: the SVG comes from our own renderer, but
			// parsing it as a document keeps it out of the HTML injection path entirely.
			const parsed = new DOMParser().parseFromString(result.svg, "image/svg+xml");
			const svg = parsed.documentElement;
			if (svg.nodeName === "svg") {
				mapHolder.replaceChildren(svg);
				mapPane.hidden = false;
				showMapButton.hidden = false;
			}
			void originalMap;
			void opts;
			return result.ascii;
		},
	} as typeof tools.portents_map;

	const turn = addTurn("gm");
	let prose = "";

	try {
		const produced = await runTurn({
			model: buildModel(settings),
			system: systemPrompt(session.registry, session),
			messages: history,
			tools,
			handlers: {
				onText: (delta) => {
					prose += delta;
					renderProse(turn, prose);
					scrollDown();
				},
				onStep: () => {
					renderTraces(turn, traces.splice(0));
					updateChrome();
					scrollDown();
				},
			},
		});
		history = [...history, ...produced];
		renderTraces(turn, traces.splice(0));
	} catch (error) {
		showError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	} finally {
		busy = false;
		sendButton.disabled = false;
		updateChrome();
		sayBox.focus();
	}
}

sayForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const text = sayBox.value.trim();
	if (!text) return;
	sayBox.value = "";
	void send(text);
});

// Enter sends, shift+enter makes a newline. A chat box that needs a mouse is a chore.
sayBox.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		sayForm.requestSubmit();
	}
});

showMapButton.addEventListener("click", () => {
	mapPane.hidden = !mapPane.hidden;
});

// ── Start ────────────────────────────────────────────────────────────────────

function showGame(): void {
	setupSection.hidden = true;
	gameSection.hidden = false;
	updateChrome();
	sayBox.focus();

	if (transcript.childElementCount === 0) {
		// The opening turn is the model's, not ours: it should check for saved games
		// before asking anything, which is what the guidance tells it to do.
		void send("");
	}
}

settings = loadSettings();
if (settings) {
	keyInput.value = settings.apiKey;
	baseInput.value = settings.baseUrl ?? "";
	refreshModels();
	modelSelect.value = settings.model;
	showGame();
} else {
	refreshModels();
	setupSection.hidden = false;
}
