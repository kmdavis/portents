import assert from "node:assert/strict";
import { createRegistry } from "@portent/core";
import { describe, it } from "node:test";
import { bundledSystems, commonContent, genericContent } from "./index.ts";

describe("the bundle", () => {
	it("puts generic first, so a system pack can override it", () => {
		// The order is the override order. Getting it wrong shadows a system's own
		// table with the generic one, silently.
		assert.equal(commonContent[0].id, "generic");
	});

	it("lists a system for every pack it bundles", () => {
		assert.equal(bundledSystems.length, commonContent.length);
	});

	it("builds a registry with no id collisions", () => {
		// With one pack this is trivially true; it becomes the real check the moment
		// a second pack lands, which is exactly when a collision would appear.
		const registry = createRegistry(commonContent);
		assert.ok(registry.deckIds().length > 0);
		assert.ok(registry.tableIds().length > 0);
	});

	it("re-exports the generic pack's own entries", () => {
		assert.equal(genericContent.id, "generic");
		assert.ok((genericContent.decks ?? []).length > 0);
	});
});
