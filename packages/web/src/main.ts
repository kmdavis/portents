/**
 * The DOM layer, and nothing else.
 *
 * All behaviour lives in `session.ts`, which is why that file is testable and
 * this one is short. Anything here that starts to look like a rule of play
 * belongs there.
 */

import { BrowserStorage } from "@portent/core/browser";
import { ORACLE_KINDS, type OracleKind } from "@portent/core";
import { WebSession } from "./session.ts";

const session = new WebSession({ storage: new BrowserStorage({ database: "portent" }) });

const $ = <T extends HTMLElement>(id: string): T => {
	const found = document.getElementById(id);
	if (!found) throw new Error(`missing element #${id}`);
	return found as T;
};

function show(target: HTMLElement, text: string): void {
	target.textContent = text;
}

function fail(target: HTMLElement, error: unknown): void {
	show(target, (error as Error).message);
}

// ── Populate the pickers from the registry, not a hardcoded list ─────────────

for (const kind of ORACLE_KINDS) {
	const option = document.createElement("option");
	option.value = kind;
	option.textContent = kind.replace(/_/g, " ");
	$("oracle-kind").append(option);
}
for (const deck of session.decks) {
	const option = document.createElement("option");
	option.value = deck.id;
	option.textContent = deck.name;
	$("deck-id").append(option);
}
for (const table of session.tables) {
	const option = document.createElement("option");
	option.value = table.id;
	option.textContent = table.name;
	$("table-id").append(option);
}

// ── Campaign ────────────────────────────────────────────────────────────────

async function refreshCampaigns(): Promise<void> {
	const list = await session.listCampaigns();
	const select = $<HTMLSelectElement>("campaign-list");
	const current = select.value;
	select.replaceChildren(new Option("— no campaign —", ""));
	for (const entry of list) select.append(new Option(`${entry.name} (${entry.systemLine ?? entry.system})`, entry.slug));
	select.value = current;
	renderBar();
}

function renderBar(): void {
	const bar = $("campaign-bar");
	const campaign = session.campaign;
	if (!campaign) {
		bar.textContent = "No campaign open. Rolls are not recorded.";
		return;
	}
	const scene = campaign.scene;
	bar.replaceChildren();
	const parts: string[][] = [
		["Campaign", campaign.name],
		["System", campaign.systemLine],
		["Rolls", String(campaign.counters.rolls)],
		["Draws", String(campaign.counters.draws)],
	];
	if (scene) parts.push(["Scene", scene.summary]);
	for (const [label, value] of parts) {
		const span = document.createElement("span");
		span.append(`${label} `);
		const strong = document.createElement("strong");
		strong.textContent = value;
		span.append(strong);
		bar.append(span);
	}
}

$("campaign-create").addEventListener("click", async () => {
	const name = $<HTMLInputElement>("campaign-name").value.trim();
	const system = $<HTMLInputElement>("campaign-system").value.trim() || "generic";
	if (!name) return;
	try {
		await session.createCampaign(name, system);
		$<HTMLInputElement>("campaign-name").value = "";
		await refreshCampaigns();
		$<HTMLSelectElement>("campaign-list").value = session.campaign!.slug;
		renderBar();
	} catch (error) {
		show($("campaign-bar"), (error as Error).message);
	}
});

$("campaign-open").addEventListener("click", async () => {
	const slug = $<HTMLSelectElement>("campaign-list").value;
	if (!slug) {
		session.closeCampaign();
		renderBar();
		return;
	}
	try {
		await session.openCampaign(slug);
	} catch (error) {
		show($("campaign-bar"), (error as Error).message);
		return;
	}
	renderBar();
});

// ── Dice ────────────────────────────────────────────────────────────────────

function dcValue(): number | undefined {
	const raw = $<HTMLInputElement>("dice-dc").value.trim();
	return raw === "" ? undefined : Number.parseInt(raw, 10);
}

$("dice-roll").addEventListener("click", async () => {
	try {
		const outcome = await session.roll($<HTMLInputElement>("dice-expr").value, { dc: dcValue() });
		const summary =
			outcome.totals.length > 1
				? `\n\nTotals: ${outcome.totals.join(", ")} · sum ${outcome.totals.reduce((a, b) => a + b, 0)}`
				: "";
		show($("dice-out"), outcome.lines.join("\n") + summary);
		renderBar();
	} catch (error) {
		fail($("dice-out"), error);
	}
});

$("dice-odds").addEventListener("click", () => {
	try {
		show($("dice-out"), session.odds($<HTMLInputElement>("dice-expr").value, dcValue()));
	} catch (error) {
		fail($("dice-out"), error);
	}
});

// ── Oracle, decks, tables ───────────────────────────────────────────────────

$("oracle-ask").addEventListener("click", async () => {
	try {
		const kind = $<HTMLSelectElement>("oracle-kind").value as OracleKind;
		show($("oracle-out"), await session.oracle(kind, $<HTMLInputElement>("oracle-q").value.trim() || undefined));
	} catch (error) {
		fail($("oracle-out"), error);
	}
});

$("deck-draw").addEventListener("click", async () => {
	try {
		show($("content-out"), (await session.draw($<HTMLSelectElement>("deck-id").value, 1)).join("\n\n"));
		renderBar();
	} catch (error) {
		fail($("content-out"), error);
	}
});

$("table-roll").addEventListener("click", async () => {
	try {
		show($("content-out"), await session.rollTable($<HTMLSelectElement>("table-id").value));
	} catch (error) {
		fail($("content-out"), error);
	}
});

// ── Map ─────────────────────────────────────────────────────────────────────

let lastMap: { ascii: string; svg: string; seed: string } | undefined;
let mapView: "svg" | "ascii" = "svg";

function renderMap(): void {
	const out = $("map-out");
	if (!lastMap) {
		out.replaceChildren();
		return;
	}
	out.replaceChildren();
	if (mapView === "svg") {
		// Parsed rather than assigned as HTML: the SVG is ours, but building the
		// habit of not writing markup from a string costs nothing.
		const parsed = new DOMParser().parseFromString(lastMap.svg, "image/svg+xml").documentElement;
		out.append(parsed);
	} else {
		const pre = document.createElement("pre");
		pre.className = "grid";
		pre.textContent = lastMap.ascii;
		out.append(pre);
	}
	const hint = document.createElement("p");
	hint.className = "hint";
	hint.textContent = `Seed: ${lastMap.seed} — the same seed regenerates this dungeon exactly.`;
	out.append(hint);
}

$("map-go").addEventListener("click", () => {
	const rooms = Number.parseInt($<HTMLInputElement>("map-rooms").value, 10);
	const seed = $<HTMLInputElement>("map-seed").value.trim();
	lastMap = session.map({ rooms: Number.isFinite(rooms) ? rooms : 9, ...(seed ? { seed } : {}) });
	$<HTMLInputElement>("map-seed").value = lastMap.seed;
	renderMap();
});

for (const [id, view] of [["map-tab-svg", "svg"], ["map-tab-ascii", "ascii"]] as const) {
	$(id).addEventListener("click", () => {
		mapView = view;
		$("map-tab-svg").setAttribute("aria-selected", String(view === "svg"));
		$("map-tab-ascii").setAttribute("aria-selected", String(view === "ascii"));
		renderMap();
	});
}

await refreshCampaigns();
