import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStorage } from "@portents/core/memory";
import { WebSession } from "@portents/web";

import { portentsTools } from "./tools.ts";

function actionValues(toolName: "portents_campaign" | "portents_sheet"): string[] {
	const tools = portentsTools(new WebSession({ storage: new MemoryStorage() }), () => {});
	const schema = tools[toolName].inputSchema as unknown as {
		jsonSchema: { properties: { action: { enum: string[] } } };
	};
	return schema.jsonSchema.properties.action.enum;
}

describe("tool action parity", () => {
	it("exposes every campaign action the shared guidance names", () => {
		const actions = actionValues("portents_campaign");
		for (const action of ["load", "world", "system"]) assert.ok(actions.includes(action), action);
		assert.ok(actions.includes("open"), "the site's existing name disappeared during the alias transition");
	});

	it("exposes both ordinary sheet section writes", () => {
		const actions = actionValues("portents_sheet");
		assert.ok(actions.includes("set_section"));
		assert.ok(actions.includes("append_section"));
		assert.ok(actions.includes("set_main"));
	});
});
