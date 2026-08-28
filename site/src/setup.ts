/**
 * Where the demo's connection settings come from, and how a key picks a provider.
 *
 * Pure and DOM-free so the branching is testable. The routing rule is small but has
 * one genuine trap in it, called out on {@link detectProvider}.
 *
 * **The key never leaves the browser except to the provider.** There is no server in
 * this demo: the page talks to the API directly with the key the visitor pasted. That
 * is why the demo is safe to host on GitHub Pages, and also why the key lives in
 * `localStorage` rather than anywhere we control.
 */

/** A provider the demo can talk to. */
export interface Provider {
	readonly id: "openai" | "anthropic" | "shopify" | "custom";
	readonly label: string;
	/** Where to send requests. Undefined means the SDK's own default. */
	readonly baseUrl?: string;
	/**
	 * Does this provider need Anthropic's opt-in header for browser calls?
	 *
	 * Anthropic refuses direct browser requests unless
	 * `anthropic-dangerous-direct-browser-access: true` is sent. pi's own model layer
	 * carries the same header, which is where the spelling was confirmed.
	 */
	readonly browserHeader: boolean;
	/** Which SDK client shape to construct. */
	readonly wire: "openai" | "anthropic";
}

export const SHOPIFY_BASE_URL = "https://proxy.shopify.ai/v1";

/**
 * One model the demo offers.
 *
 * `providers` lists who serves it. The Shopify proxy fronts both vendors, so most
 * models appear under it as well as under their own vendor.
 */
export interface Model {
	readonly id: string;
	readonly label: string;
	readonly wire: "openai" | "anthropic";
	/** Pre-selected for its vendor. One per wire format. */
	readonly recommended?: boolean;
}

/**
 * The model catalogue.
 *
 * Ids verified against OpenAI's and Anthropic's own model documentation and the
 * Shopify proxy's model dashboard, rather than inferred from pi's registry -- which
 * ships an older generation (`gpt-5.5`, `claude-opus-4-8`) and would have produced
 * plausible, wrong ids and missed `claude-fable-5` entirely.
 *
 * A wrong id still fails on the first request with the provider's own error, which the
 * UI shows verbatim rather than swallowing, and the field stays editable.
 */
export const MODELS: readonly Model[] = [
	{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna", wire: "openai", recommended: true },
	{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", wire: "openai" },
	{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra", wire: "openai" },
	{ id: "claude-sonnet-5", label: "Claude Sonnet 5", wire: "anthropic", recommended: true },
	{ id: "claude-opus-5", label: "Claude Opus 5", wire: "anthropic" },
	{ id: "claude-fable-5", label: "Claude Fable 5", wire: "anthropic" },
];

/**
 * The model to pre-select for a provider.
 *
 * Falls back to the first offered rather than throwing: a provider with an unexpected
 * shape should still produce a usable form.
 */
export function defaultModelFor(provider: Provider): string {
	const offered = modelsFor(provider);
	const wire = offered.find((model) => model.wire === provider.wire && model.recommended);
	return (wire ?? offered.find((model) => model.recommended) ?? offered[0])?.id ?? "";
}

/**
 * Work out which provider a key belongs to.
 *
 * An explicit base URL always wins: someone pointing at their own gateway has said
 * where to go, and guessing from the key prefix would override them.
 *
 * **`sk-ant-` must be tested before `sk-`.** Anthropic keys start with `sk-ant-`,
 * which also starts with `sk-`, so checking OpenAI's prefix first would route every
 * Anthropic key to OpenAI and fail with a confusing authentication error. The order of
 * these branches is the whole rule, and a test pins it.
 */
export function detectProvider(apiKey: string, baseUrl?: string): Provider {
	const key = apiKey.trim();
	const explicit = baseUrl?.trim();

	if (explicit) {
		// The wire format cannot be sniffed from a URL, so it comes from the key, with
		// OpenAI-compatible as the assumption most gateways satisfy.
		const wire = key.startsWith("sk-ant-") ? "anthropic" : "openai";
		return {
			id: "custom",
			label: `Custom (${explicit})`,
			baseUrl: explicit,
			browserHeader: wire === "anthropic",
			wire,
		};
	}

	if (key.startsWith("sk-ant-")) {
		return { id: "anthropic", label: "Anthropic", browserHeader: true, wire: "anthropic" };
	}
	if (key.startsWith("shopify-")) {
		return {
			id: "shopify",
			label: "Shopify proxy",
			baseUrl: SHOPIFY_BASE_URL,
			browserHeader: false,
			wire: "openai",
		};
	}
	if (key.startsWith("sk-")) {
		return { id: "openai", label: "OpenAI", browserHeader: false, wire: "openai" };
	}

	return {
		id: "custom",
		label: "Unrecognised key",
		browserHeader: false,
		wire: "openai",
	};
}

/** Models worth offering for a provider. The proxy fronts both vendors. */
export function modelsFor(provider: Provider): readonly Model[] {
	if (provider.id === "openai") return MODELS.filter((model) => model.wire === "openai");
	if (provider.id === "anthropic") return MODELS.filter((model) => model.wire === "anthropic");
	// Shopify proxies both, and a custom gateway might too.
	return MODELS;
}

/** What the setup form collects. */
export interface Settings {
	readonly apiKey: string;
	readonly baseUrl?: string;
	readonly model: string;
}

const STORAGE_KEY = "portents.demo.settings";

/**
 * Read saved settings, or `undefined` if there are none or they are unusable.
 *
 * Never throws. A corrupt or half-written entry means the visitor sees the form
 * again, which is recoverable; an exception here would leave a blank page.
 */
export function loadSettings(storage: Pick<Storage, "getItem"> = localStorage): Settings | undefined {
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as Partial<Settings>;
		if (typeof parsed?.apiKey !== "string" || !parsed.apiKey) return undefined;
		if (typeof parsed.model !== "string" || !parsed.model) return undefined;
		return {
			apiKey: parsed.apiKey,
			model: parsed.model,
			...(typeof parsed.baseUrl === "string" && parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
		};
	} catch {
		return undefined;
	}
}

export function saveSettings(settings: Settings, storage: Pick<Storage, "setItem"> = localStorage): void {
	storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings(storage: Pick<Storage, "removeItem"> = localStorage): void {
	storage.removeItem(STORAGE_KEY);
}

/**
 * What is wrong with these settings, as messages to show the visitor.
 *
 * Returns every problem rather than the first, so a form with two mistakes does not
 * need two attempts to fix.
 */
export function settingsProblems(settings: Partial<Settings>): string[] {
	const problems: string[] = [];
	const key = settings.apiKey?.trim() ?? "";
	if (!key) problems.push("An API key is required. It stays in this browser.");

	const base = settings.baseUrl?.trim();
	if (base) {
		try {
			const url = new URL(base);
			if (url.protocol !== "https:" && url.hostname !== "localhost") {
				problems.push("A base URL must use https, except for localhost.");
			}
		} catch {
			problems.push(`Base URL is not a valid URL: ${base}`);
		}
	}

	if (!settings.model?.trim()) problems.push("Choose a model.");

	// Advisory rather than fatal: an unrecognised prefix is fine with a base URL, and a
	// visitor may have a key shape we have not seen.
	if (key && !base && detectProvider(key).id === "custom") {
		problems.push(
			"That key does not look like sk-, sk-ant- or shopify-. Add a base URL so the demo knows where to send it.",
		);
	}

	return problems;
}
