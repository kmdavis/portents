/**
 * Provider routing and settings persistence.
 *
 * Small surface, but it has the one branch in this demo that is genuinely easy to get
 * wrong: `sk-ant-` also starts with `sk-`, so prefix order decides whether Anthropic
 * keys work at all.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	clearSettings,
	detectProvider,
	loadSettings,
	MODELS,
	modelsFor,
	saveSettings,
	settingsProblems,
	SHOPIFY_BASE_URL,
} from "./setup.ts";

/** A localStorage stand-in. Node has no DOM. */
function fakeStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		get size() {
			return map.size;
		},
	};
}

describe("provider routing", () => {
	it("routes an Anthropic key to Anthropic, not OpenAI", () => {
		// The trap: "sk-ant-..." also starts with "sk-". Checking OpenAI's prefix first
		// sends every Anthropic key to the wrong API, and the failure looks like a bad
		// key rather than bad routing.
		const provider = detectProvider("sk-ant-api03-abc123");
		assert.equal(provider.id, "anthropic");
		assert.equal(provider.wire, "anthropic");
	});

	it("routes an OpenAI key to OpenAI", () => {
		const provider = detectProvider("sk-proj-abc123");
		assert.equal(provider.id, "openai");
		assert.equal(provider.baseUrl, undefined, "OpenAI should use the SDK default");
	});

	it("routes a Shopify key to the proxy", () => {
		const provider = detectProvider("shopify-abc123");
		assert.equal(provider.id, "shopify");
		assert.equal(provider.baseUrl, SHOPIFY_BASE_URL);
		assert.equal(provider.wire, "openai", "the proxy speaks the OpenAI wire format");
	});

	it("sends Anthropic's browser header only where it is needed", () => {
		// Anthropic refuses direct browser calls without it; sending it elsewhere is
		// noise at best and a CORS preflight failure at worst.
		assert.equal(detectProvider("sk-ant-x").browserHeader, true);
		assert.equal(detectProvider("sk-x").browserHeader, false);
		assert.equal(detectProvider("shopify-x").browserHeader, false);
	});

	it("lets an explicit base URL win over the key prefix", () => {
		// Someone who typed a URL has said where to go. Guessing would override them.
		const provider = detectProvider("sk-proj-abc", "https://my-gateway.example/v1");
		assert.equal(provider.id, "custom");
		assert.equal(provider.baseUrl, "https://my-gateway.example/v1");
	});

	it("keeps the Anthropic wire format when a base URL is given with an Anthropic key", () => {
		// A self-hosted Anthropic-compatible gateway still speaks Anthropic.
		const provider = detectProvider("sk-ant-abc", "https://my-gateway.example");
		assert.equal(provider.wire, "anthropic");
		assert.equal(provider.browserHeader, true);
	});

	it("does not guess for an unrecognised key", () => {
		const provider = detectProvider("hunter2");
		assert.equal(provider.id, "custom");
		assert.equal(provider.baseUrl, undefined, "guessing a base URL for an unknown key would be worse than asking");
	});

	it("ignores surrounding whitespace, which pasting adds", () => {
		assert.equal(detectProvider("  sk-ant-abc  ").id, "anthropic");
		assert.equal(detectProvider("sk-abc", "  https://x.example  ").baseUrl, "https://x.example");
	});
});

describe("model catalogue", () => {
	it("offers each vendor only its own models", () => {
		const openai = modelsFor(detectProvider("sk-abc"));
		const anthropic = modelsFor(detectProvider("sk-ant-abc"));
		assert.ok(openai.every((model) => model.wire === "openai"), "an Anthropic model was offered to OpenAI");
		assert.ok(anthropic.every((model) => model.wire === "anthropic"), "an OpenAI model was offered to Anthropic");
		assert.ok(openai.length >= 3);
		assert.ok(anthropic.length >= 2);
	});

	it("offers everything through the proxy, which fronts both", () => {
		assert.equal(modelsFor(detectProvider("shopify-abc")).length, MODELS.length);
	});

	it("has a distinct id and label for every model", () => {
		assert.equal(new Set(MODELS.map((m) => m.id)).size, MODELS.length, "duplicate model id");
		assert.equal(new Set(MODELS.map((m) => m.label)).size, MODELS.length, "duplicate model label");
	});
});

describe("settings persistence", () => {
	it("round-trips through storage", () => {
		const storage = fakeStorage();
		saveSettings({ apiKey: "sk-abc", model: "gpt-5.6-luna" }, storage);
		assert.deepEqual(loadSettings(storage), { apiKey: "sk-abc", model: "gpt-5.6-luna" });
	});

	it("keeps an optional base URL and omits it when absent", () => {
		const storage = fakeStorage();
		saveSettings({ apiKey: "sk-abc", model: "m", baseUrl: "https://x.example" }, storage);
		assert.equal(loadSettings(storage)?.baseUrl, "https://x.example");

		saveSettings({ apiKey: "sk-abc", model: "m" }, storage);
		assert.ok(!("baseUrl" in (loadSettings(storage) as object)), "an absent base URL should not be stored as a key");
	});

	it("returns undefined rather than throwing on corrupt storage", () => {
		// A half-written entry must show the form again, not a blank page.
		assert.equal(loadSettings(fakeStorage({ "portents.demo.settings": "{not json" })), undefined);
		assert.equal(loadSettings(fakeStorage({ "portents.demo.settings": '{"model":"m"}' })), undefined);
		assert.equal(loadSettings(fakeStorage({ "portents.demo.settings": '{"apiKey":""}' })), undefined);
		assert.equal(loadSettings(fakeStorage()), undefined);
	});

	it("clears", () => {
		const storage = fakeStorage();
		saveSettings({ apiKey: "sk-abc", model: "m" }, storage);
		clearSettings(storage);
		assert.equal(loadSettings(storage), undefined);
		assert.equal(storage.size, 0);
	});
});

describe("validation", () => {
	it("accepts a complete, recognised set", () => {
		assert.deepEqual(settingsProblems({ apiKey: "sk-ant-abc", model: "claude-opus-5" }), []);
	});

	it("reports every problem at once", () => {
		// Two mistakes should not need two attempts.
		const problems = settingsProblems({ apiKey: "", model: "", baseUrl: "not a url" });
		assert.equal(problems.length, 3, `expected three problems, got: ${problems.join(" | ")}`);
	});

	it("requires https, except on localhost", () => {
		assert.ok(settingsProblems({ apiKey: "sk-a", model: "m", baseUrl: "http://evil.example" }).some((p) => p.includes("https")));
		assert.deepEqual(settingsProblems({ apiKey: "sk-a", model: "m", baseUrl: "http://localhost:8080/v1" }), []);
	});

	it("asks for a base URL when the key shape is unfamiliar", () => {
		const problems = settingsProblems({ apiKey: "hunter2", model: "m" });
		assert.ok(problems.some((p) => p.includes("base URL")), problems.join(" | "));
		// ...and stops asking once one is supplied.
		assert.deepEqual(settingsProblems({ apiKey: "hunter2", model: "m", baseUrl: "https://x.example" }), []);
	});
});
