/**
 * The demo's DOM layer, and nothing else.
 *
 * Every decision worth testing lives elsewhere -- provider routing in `setup.ts`, tool
 * behaviour in `tools.ts`, prompt assembly in `agent.ts`. This file wires those to
 * elements and is deliberately dull, which is the point: a bug here is visible on
 * screen, whereas a bug in the routing is not.
 */

import { BrowserStorage } from "@portents/core/browser";
import { guidanceTitle } from "@portents/core";
import { WebSession } from "@portents/web";
import DOMPurify from "dompurify";
import { marked } from "marked";

import type { ModelMessage } from "ai";

import { buildModel, reasoningOptions, runTurn, stateDigest, systemPrompt } from "./agent.ts";
import { renderMarkdown } from "./markdown.ts";
import { ALWAYS_SHOWN, isHurt, PARTY_STAT_KEYS, statusOf } from "./party.ts";
import { Transcript } from "./transcript.ts";
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
const toggleMapButton = $<HTMLButtonElement>("toggle-map");
const rollDialog = $<HTMLDialogElement>("roll-dialog");
const ledgerDialog = $<HTMLDialogElement>("ledger-dialog");
const gmHeader = $("gm-header");
const toggleGmButton = $<HTMLButtonElement>("toggle-gm");

const GM_PANE_KEY = "portents.demo.gmPane";

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

const view = new Transcript({
	root: transcript,
	render: renderProse,
	onChange: () => scrollDown(),
});

function scrollDown(): void {
	transcript.scrollTop = transcript.scrollHeight;
}

/**
 * Render the GM's prose as markdown.
 *
 * `marked` and `DOMPurify` rather than the small transform this used to have. That
 * transform handled bold, code and paragraphs, and silently dropped lists -- which the
 * guidance asks the GM to produce constantly ("ask five questions, in one message"), so
 * the first real session came back as a wall of run-together numbers.
 *
 * The policy and the render step live in `markdown.ts`, where they are tested.
 */
function renderProse(target: HTMLElement, text: string): void {
	target.innerHTML = renderMarkdown(text, marked as never, DOMPurify as never);
}

/**
 * Show what the tools did, without spoiling the game.
 *
 * Public calls are named; GM-facing ones are counted but not described. Listing
 * "oracle: is the gate guarded?" in the transcript would defeat the secrecy rule
 * through the very interface meant to uphold it, while hiding them completely would
 * hide the dice the demo exists to prove are real.
 */
/**
 * Record a tool call in the GM pane.
 *
 * Separate from the transcript summary on purpose. The transcript counts secret calls
 * without describing them; this shows everything, and is off by default. Both are
 * needed: the game requires the mechanism hidden, and accountability requires it
 * reachable. Defaulting it off and putting it behind a labelled toggle lets the player
 * decide which they want, one session at a time.
 */
function logGmEvent(trace: ToolTrace): void {
	const event = document.createElement("div");
	event.className = trace.secret ? "gm-event secret" : "gm-event";

	const head = document.createElement("div");
	head.className = "what";
	const tool = document.createElement("span");
	tool.className = "tool";
	tool.textContent = trace.name;
	head.append(tool);
	event.append(head);

	const summary = document.createElement("p");
	summary.textContent = trace.summary;
	event.append(summary);

	if (trace.detail) {
		// Rendered, not printed. A table result arrives as markdown, so a raw cell read
		// "**Names: Human / Common**: Alric Oakenshield".
		const detail = document.createElement("div");
		renderProse(detail, trace.detail);
		event.append(detail);
	}

	// Into this turn's gutter, so it sits level with the exchange it belonged to. The
	// turn number it used to carry was unusable once the transcript grew past a screen.
	view.aside(event);
}

/**
 * The model's reasoning, collapsed.
 *
 * Collapsed rather than shown, even inside the GM pane, and for a stronger reason than
 * tidiness: reasoning says out loud what the oracle returned and which branch the GM
 * discarded. A player who opens it has chosen to; one who is glancing at a roll should
 * not have the next scene spoiled in passing.
 *
 * One block per turn, appended to, because reasoning arrives in many small deltas.
 */
let openThinking: { details: HTMLElement; body: HTMLElement; text: string } | undefined;

function logThinking(delta: string): void {
	if (!openThinking) {
		const details = document.createElement("details");
		details.className = "gm-event gm-think";
		const summary = document.createElement("summary");
		summary.textContent = "Thinking";
		const body = document.createElement("pre");
		details.append(summary, body);
		view.aside(details);
		openThinking = { details, body, text: "" };
	}
	openThinking.text += delta;
	openThinking.body.textContent = openThinking.text;
}

function renderTraces(traces: readonly ToolTrace[]): void {
	if (traces.length === 0) return;
	const line = document.createElement("p");
	line.className = "tools";

	for (const trace of traces) logGmEvent(trace);

	const open = traces.filter((trace) => !trace.secret);
	for (const trace of open) {
		const chip = document.createElement("code");
		chip.textContent = trace.summary;
		line.append(chip, " ");
	}
	const hidden = traces.length - open.length;
	if (hidden > 0) line.append(`+${hidden} behind the screen`);
	// Its own block, so the next prose sits below it rather than absorbing it.
	view.addElement(line);
}

function showError(message: string): void {
	const box = document.createElement("div");
	box.className = "error";
	// Verbatim. A wrong model id or a CORS refusal is only diagnosable if the
	// provider's own words survive.
	box.textContent = message;
	view.addElement(box);
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
	view.add(
		"turn roll",
		`**Rolled ${expression}** — ${reason}\n\n${outcome.lines.map((line) => `- ${line}`).join("\n")}`,
	);
	void refreshCard();
	return outcome.lines.join("\n");
}

// ── A turn ───────────────────────────────────────────────────────────────────

/**
 * The system as a person would say it.
 *
 * `campaign.systemLine` is the stored line -- "5e (2014)" -- which is what a tool takes
 * as a parameter, not what a header should say. The guidance document for that system
 * carries a proper title, and the GM's own prose already used it, so the chrome saying
 * "5e (2014)" while the GM said "D&D 5E (2014 printing)" was the UI disagreeing with
 * the game.
 */
function systemTitle(): string {
	const campaign = session.campaign;
	if (!campaign) return "";
	const found = session.registry.guidanceFor(campaign.systemLine) ?? session.registry.guidanceFor(campaign.system);
	return found ? guidanceTitle(found) : campaign.systemLine;
}

function updateChrome(): void {
	const campaign = session.campaign;
	campaignLabel.textContent = campaign ? `${campaign.name} · ${systemTitle()}` : "No campaign";
}

/**
 * The side card: what this session is, and the state the player would otherwise have
 * to scroll for.
 *
 * Read straight from the campaign each time rather than tracked separately. The
 * campaign is already the single source of truth -- it writes through on every change
 * -- and a second copy here would be one more thing to get out of step with the sheet
 * on disk.
 */
async function refreshCard(): Promise<void> {
	const campaign = session.campaign;
	$("card-campaign").textContent = campaign?.name ?? "No campaign";
	$("card-system").textContent = campaign ? systemTitle() : "Nothing open yet";

	const rows: Array<[string, string]> = [];
	if (campaign) {
		const scene = campaign.scene;
		if (scene?.location) rows.push(["Location", scene.location]);
		if (scene?.summary) rows.push(["Scene", scene.summary]);
		rows.push(["Rolls", String(campaign.ledger.recent(9999).length)]);
	}

	const list = $("card-state");
	list.replaceChildren();
	for (const [label, value] of rows) {
		const dt = document.createElement("dt");
		dt.textContent = label;
		const dd = document.createElement("dd");
		dd.textContent = value;
		list.append(dt, dd);
	}

	const clocks = campaign?.clocks ?? [];
	const clockLine = $("card-clocks");
	clockLine.hidden = clocks.length === 0;
	clockLine.textContent = clocks.map((clock) => `${clock.name} ${clock.filled}/${clock.segments}`).join(" · ");

	await refreshParty();
}

/**
 * One block per character, main and sidekicks alike.
 *
 * The guidance now recommends a main character plus one or two sidekicks, because a
 * lone character is outnumbered every round whatever its hit points. That advice is
 * only honest if the player can see what they are responsible for: a sidekick whose
 * hit points exist solely in the GM's context is one the player forgets, and then
 * loses.
 *
 * Read from the sheets on disk rather than tracked here. The sheet is canonical, and a
 * second copy in the UI would be one more thing to disagree with it.
 */
async function refreshParty(): Promise<void> {
	const party = $("party");
	const campaign = session.campaign;
	if (!campaign) {
		party.replaceChildren();
		return;
	}

	const slugs = await campaign.listCharacters();
	const active = campaign.activeCharacter;

	// Read every sheet first, so the party can be ordered before it is rendered.
	const members = await Promise.all(
		slugs.map(async (slug) => {
			const sheet = await campaign.readCharacter(slug);
			const name = String(sheet?.data["name"] ?? slug);
			return { slug, sheet, name, isActive: active !== undefined && (active === name || active === slug) };
		}),
	);

	// The main character first. Storage lists files alphabetically, so "Alric" sorted
	// above "Ossiran" and the sidekick led the party -- which reads as the wrong
	// character being the protagonist.
	members.sort((left, right) => {
		if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
		return left.name.localeCompare(right.name);
	});

	const blocks: HTMLElement[] = [];

	for (const { slug, sheet, name, isActive } of members) {
		const block = document.createElement("section");
		block.className = isActive ? "pc active" : "pc";

		const heading = document.createElement("h3");
		heading.textContent = name;
		block.append(heading);

		// Only claim a role when the campaign actually records one. A campaign whose
		// active character was never set gets no label rather than a wrong one, and a
		// lone character is the main one whatever the field says.
		const role = document.createElement("span");
		role.className = "role";
		role.textContent = isActive || members.length === 1 ? "main" : active === undefined ? "" : "sidekick";
		if (role.textContent) block.append(role);

		const concept = sheet?.data["concept"] ?? sheet?.data["Concept"];
		if (concept) {
			const line = document.createElement("p");
			line.className = "concept";
			line.textContent = String(concept);
			block.append(line);
		}

		const status = statusOf(sheet?.data);
		const stats = document.createElement("dl");
		for (const key of PARTY_STAT_KEYS) {
			const value = status[key];
			const missing = value === undefined || value === null || !String(value).trim();
			// HP and AC are always shown, even when absent. A blank row is a visible
			// prompt that the GM never recorded them; omitting the row hides the problem,
			// which is how a character ends up "lightly wounded" with no hit points on
			// the sheet at all.
			if (missing && !ALWAYS_SHOWN.includes(key)) continue;
			const dt = document.createElement("dt");
			dt.textContent = key;
			const dd = document.createElement("dd");
			dd.textContent = missing ? "not recorded" : String(value);
			if (missing) dd.classList.add("unset");
			// Colour a character at or below half, so a sidekick about to drop is visible
			// without the player doing arithmetic.
			if (!missing && key === "HP" && isHurt(String(value))) dd.classList.add("hurt");
			stats.append(dt, dd);
		}
		if (stats.childElementCount > 0) block.append(stats);

		if (!sheet) {
			const missing = document.createElement("p");
			missing.className = "concept";
			missing.textContent = "sheet missing on disk";
			block.append(missing);
		}

		blocks.push(block);
	}

	party.replaceChildren(...blocks);
}

/**
 * Show the ledger.
 *
 * Secret entries are listed but not described: the id, the kind and the fact that
 * something was rolled, without the answer. The player can see that the machinery ran
 * without being told what the oracle said, which is the same line the transcript
 * draws. Once the campaign is over, the file is theirs to read.
 */
function openLedger(): void {
	const campaign = session.campaign;
	const body = $("ledger-body");
	body.replaceChildren();

	const entries = campaign?.ledger.recent(9999) ?? [];
	if (entries.length === 0) {
		const empty = document.createElement("p");
		empty.id = "ledger-empty";
		empty.textContent = campaign
			? "Nothing rolled yet."
			: "No campaign is open, so nothing has been recorded.";
		body.append(empty);
	} else {
		const table = document.createElement("table");
		const head = document.createElement("thead");
		const headRow = document.createElement("tr");
		for (const label of ["Id", "What", "Result"]) {
			const th = document.createElement("th");
			th.textContent = label;
			headRow.append(th);
		}
		head.append(headRow);
		table.append(head);

		const tbody = document.createElement("tbody");
		for (const entry of [...entries].reverse()) {
			const row = document.createElement("tr");
			const secret = SECRET_LEDGER_KINDS.has(entry.kind);
			if (secret) row.className = "secret";

			const id = document.createElement("td");
			id.textContent = entry.id;
			const what = document.createElement("td");
			what.textContent = entry.request ?? entry.kind;

			const result = document.createElement("td");
			if (secret) {
				// Hidden by default, revealed on click. A permanently unreadable audit
				// trail cannot be audited, which would make the accountability claim
				// unfalsifiable -- and this is a demo whose whole argument is that the
				// dice are checkable.
				result.textContent = "behind the screen";
				result.title = "Click to reveal";
				result.addEventListener("click", () => revealRow(row, result, entry.result), { once: true });
			} else {
				renderProse(result, entry.result);
			}

			row.append(id, what, result);
			tbody.append(row);
		}
		table.append(tbody);
		body.append(table);
	}

	ledgerDialog.showModal();
}

/** Show one hidden result, and stop pretending the row is still secret. */
function revealRow(row: HTMLElement, cell: HTMLElement, result: string): void {
	row.classList.add("shown");
	cell.removeAttribute("title");
	renderProse(cell, result);
}

/** Reveal every hidden row at once, for someone auditing rather than playing. */
function revealAll(): void {
	for (const cell of ledgerDialog.querySelectorAll<HTMLElement>("tr.secret:not(.shown) td:last-child")) {
		cell.click();
	}
}

/** Ledger kinds whose results are the GM's, not the player's. */
const SECRET_LEDGER_KINDS = new Set(["oracle", "table", "card", "move"]);

async function send(text: string, options: { show?: boolean } = {}): Promise<void> {
	if (busy || !settings) return;
	busy = true;
	sendButton.disabled = true;
	sayBox.disabled = true;

	if (text) {
		if (options.show !== false) view.add("turn player", text);
		history.push({ role: "user", content: text });
	}

	// The digest is passed for this call only, never pushed into history. Persisting it
	// would leave a growing pile of stale snapshots -- last turn's HP, the turn before
	// that's -- and the model has no way to know which is current.
	const digest = await stateDigest(session);
	const messages = digest ? [...history, { role: "user" as const, content: digest }] : history;

	const waiting = document.createElement("div");
	waiting.className = "waiting";
	waiting.setAttribute("aria-label", "The GM is thinking");
	waiting.append(...[0, 1, 2].map(() => document.createElement("span")));
	view.pending(waiting);

	view.startTurn();
	openThinking = undefined;
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
				toggleMapButton.hidden = false;
			}
			void originalMap;
			void opts;
			return result.ascii;
		},
	} as typeof tools.portents_map;


	try {
		const produced = await runTurn({
			model: buildModel(settings),
			...(reasoningOptions(settings) ? { providerOptions: reasoningOptions(settings) } : {}),
			system: systemPrompt(session.registry, session),
			messages,
			tools,
			handlers: {
				onText: (delta) => {
					waiting.remove();
					// Prose ends a thinking block: anything after this belongs to the next one.
					openThinking = undefined;
					view.stream(delta);
				},
				onReasoning: (delta) => logThinking(delta),
				onStep: () => {
					renderTraces(traces.splice(0));
					updateChrome();
					refreshCard();
					scrollDown();
				},
			},
		});
		history = [...history, ...produced];
		renderTraces(traces.splice(0));
	} catch (error) {
		showError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	} finally {
		waiting.remove();
		view.end();
		busy = false;
		sendButton.disabled = false;
		sayBox.disabled = false;
		updateChrome();
		void refreshCard();
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

toggleMapButton.addEventListener("click", () => {
	mapPane.hidden = !mapPane.hidden;
});

$<HTMLButtonElement>("open-ledger").addEventListener("click", openLedger);
$<HTMLButtonElement>("reveal-all").addEventListener("click", revealAll);

/** Show or hide the GM pane, remembering the choice. */
function setGmPane(open: boolean): void {
	transcript.classList.toggle("with-gm", open);
	gmHeader.hidden = !open;
	toggleGmButton.setAttribute("aria-pressed", String(open));
	localStorage.setItem(GM_PANE_KEY, open ? "1" : "0");
}

toggleGmButton.addEventListener("click", () => setGmPane(!transcript.classList.contains("with-gm")));
$<HTMLButtonElement>("ledger-close").addEventListener("click", () => ledgerDialog.close());

// ── Start ────────────────────────────────────────────────────────────────────

function showGame(): void {
	setupSection.hidden = true;
	gameSection.hidden = false;
	updateChrome();
	void refreshCard();
	sayBox.focus();

	if (view.isEmpty) {
		// The GM opens, but it needs something to open in reply to: a turn with no
		// messages at all is rejected by the API before it reaches a model, which is
		// exactly what "messages must not be empty" was. Sent but not shown, so the
		// transcript starts with the GM rather than with an instruction nobody typed.
		void send(
			"Begin. Check for saved campaigns first, then greet me and either resume one or run session zero.",
			{ show: false },
		);
	}
}

// Default off. Seeing the oracle's answer before the fiction spoils the fiction, so
// this has to be something the player switches on deliberately.
setGmPane(localStorage.getItem(GM_PANE_KEY) === "1");

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
