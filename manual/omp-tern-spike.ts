// Manual host capability probe, not a gameplay extension.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { jsx } from "@oh-my-pi/pi-tui/jsx-runtime";

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setWidget("portents-spike", ["SPIKE PANEL: north room"]);
	});
	pi.registerCommand("spike-confirm", {
		description: "Exercise confirmation and a persistent widget",
		handler: async (_args, ctx) => {
			const confirmed = await ctx.ui.confirm("Spike confirmation", "Resolve the roll?");
			ctx.ui.setWidget("portents-spike", [`SPIKE PANEL: ${confirmed ? "confirmed" : "declined"}`]);
			ctx.ui.notify(`SPIKE CALLBACK: ${confirmed}`, "info");
		},
	});
	pi.registerCommand("spike-card", {
		description: "Exercise a semantic view and callback",
		handler: async (_args, ctx) => {
			await ctx.ui.custom((_ui, _theme, _keys, done) =>
				jsx("col", { children: [jsx("text", { text: "SPIKE CARD" }), jsx("button", { label: "Done", onAction: () => done("done") })] }),
			);
			ctx.ui.notify("SPIKE CARD CALLBACK", "info");
		},
	});
	pi.registerCommand("spike-map", {
		description: "Exercise a simple inline SVG map",
		handler: async (_args, ctx) => {
			await ctx.ui.custom((_ui, _theme, _keys, done) =>
				jsx("col", { onKey: () => { done(); return true; }, children: jsx("md", { text: '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 70"><rect x="5" y="5" width="130" height="60" fill="none" stroke="currentColor"/><text x="15" y="40" fill="currentColor">MAP PROBE</text></svg>\n```' }) }),
			);
		},
	});
}
