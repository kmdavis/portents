/**
 * One streamed reasoning block in the private GM pane.
 *
 * Reasoning arrives as Markdown, just like public prose. The first implementation put
 * it in a `<pre>` with `textContent`, so headings and emphasis appeared literally as
 * `**Preparing to assist**`. Keeping the renderer injected uses the same sanitised
 * Markdown path as public prose without coupling this small state holder to the DOM
 * libraries.
 */

export type RenderThinking = (target: HTMLElement, markdown: string) => void;

export interface ThinkingBlock {
	readonly details: HTMLDetailsElement;
	append(delta: string): void;
}

export function createThinkingBlock(render: RenderThinking): ThinkingBlock {
	const details = document.createElement("details");
	details.className = "gm-event gm-think";

	const summary = document.createElement("summary");
	summary.textContent = "Thinking";

	const body = document.createElement("div");
	body.className = "thinking-body";
	details.append(summary, body);

	let text = "";
	return {
		details,
		append(delta: string): void {
			text += delta;
			render(body, text);
		},
	};
}
