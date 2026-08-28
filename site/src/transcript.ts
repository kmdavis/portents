/**
 * The transcript, as an ordering problem.
 *
 * Extracted from the DOM layer because it shipped wrong and the wrongness was
 * invisible in code review: the first version created one GM block before the stream
 * started, so every block a tool appended mid-turn landed *below* the prose. The GM
 * announced "your scores are 17, 16, 11, 11, 10, 8" and the dice that produced them
 * appeared underneath it.
 *
 * For a project whose entire claim is that the dice are real and checkable, showing
 * them after the conclusion they support is close to the worst available ordering: it
 * looks exactly like a model inventing numbers and a tool being called afterwards to
 * launder them.
 *
 * The rule is one line: **anything appended closes the open prose block.** Prose
 * arriving afterwards starts a new one, so blocks appear in the order events happened.
 */

/** How prose becomes DOM. Injected so this module needs no markdown library. */
export type RenderProse = (target: HTMLElement, markdown: string) => void;

export interface TranscriptOptions {
	readonly root: HTMLElement;
	readonly render: RenderProse;
	/** Called after every mutation, so the caller can scroll. */
	readonly onChange?: () => void;
}

export class Transcript {
	readonly #root: HTMLElement;
	readonly #render: RenderProse;
	readonly #onChange: () => void;

	/** The block being streamed into, or undefined if none is open. */
	#open: HTMLElement | undefined;
	#prose = "";

	constructor(options: TranscriptOptions) {
		this.#root = options.root;
		this.#render = options.render;
		this.#onChange = options.onChange ?? (() => {});
	}

	/** Blocks currently in the transcript, in order, as `class` values. */
	get order(): string[] {
		return [...this.#root.children].map((child) => child.className);
	}

	get isEmpty(): boolean {
		return this.#root.childElementCount === 0;
	}

	/** Add a finished block of any kind, closing any open prose. */
	add(kind: string, markdown: string): HTMLElement {
		const block = document.createElement("div");
		block.className = kind;
		this.#render(block, markdown);
		this.#place(block);
		return block;
	}

	/** Add a pre-built element, closing any open prose. For traces and errors. */
	addElement(block: HTMLElement): HTMLElement {
		this.#place(block);
		return block;
	}

	/**
	 * Stream a chunk of GM prose.
	 *
	 * Creates a block on the first chunk after anything else was added, which is the
	 * whole fix: a tool call mid-turn splits the narration in two, and the tool's block
	 * sits between the halves where it belongs.
	 */
	stream(delta: string): void {
		if (!this.#open) {
			this.#open = document.createElement("div");
			this.#open.className = "turn gm";
			this.#root.append(this.#open);
			this.#prose = "";
		}
		this.#prose += delta;
		this.#render(this.#open, this.#prose);
		this.#onChange();
	}

	/**
	 * Finish the turn.
	 *
	 * Drops an empty block, which is what a turn that called tools and then said
	 * nothing would otherwise leave behind -- a blank bubble reads as a failed reply.
	 */
	end(): void {
		// Emptiness means "nothing rendered", not "no child elements". Checking only
		// elements deleted blocks whose renderer produced bare text nodes -- which the
		// tests caught, and which any renderer simpler than marked would hit.
		if (this.#open && this.#open.childElementCount === 0 && !this.#open.textContent?.trim()) {
			this.#open.remove();
		}
		this.#open = undefined;
		this.#prose = "";
		this.#onChange();
	}

	#place(block: HTMLElement): void {
		this.#open = undefined;
		this.#prose = "";
		this.#root.append(block);
		this.#onChange();
	}
}
