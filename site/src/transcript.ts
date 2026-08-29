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
 *
 * Blocks are grouped into per-turn rows, each a two-column grid: the GM's private
 * working on the left, what the player saw on the right. Alignment is therefore
 * structural rather than computed -- no measuring offsets, no synchronised scrolling,
 * one scrollbar -- and it answers the question a flat list could not, which is which
 * exchange a given oracle roll belonged to.
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

	/** The current turn's row, and its two cells. */
	#row: { row: HTMLElement; aside: HTMLElement; content: HTMLElement } | undefined;

	constructor(options: TranscriptOptions) {
		this.#root = options.root;
		this.#render = options.render;
		this.#onChange = options.onChange ?? (() => {});
	}

	/**
	 * Content blocks currently in the transcript, in order, as `class` values.
	 *
	 * Walked rather than selected. `:scope >` is the obvious query and is not reliable
	 * in jsdom, which made every ordering test fail against working code.
	 */
	get order(): string[] {
		const blocks: string[] = [];
		for (const row of this.#rows()) {
			const content = [...row.children].find((cell) => cell.className === "turn-content");
			for (const child of content?.children ?? []) blocks.push(child.className);
		}
		return blocks;
	}

	/** Rows currently in the transcript. One per exchange. */
	get rowCount(): number {
		return this.#rows().length;
	}

	/** The player-visible blocks, flattened out of their rows. */
	get contentBlocks(): HTMLElement[] {
		const blocks: HTMLElement[] = [];
		for (const row of this.#rows()) {
			const content = [...row.children].find((cell) => cell.className === "turn-content");
			for (const child of content?.children ?? []) blocks.push(child as HTMLElement);
		}
		return blocks;
	}

	#rows(): HTMLElement[] {
		return [...this.#root.children].filter((child): child is HTMLElement => child.className === "turn-row");
	}

	get isEmpty(): boolean {
		return this.order.length === 0;
	}

	/**
	 * Begin an exchange.
	 *
	 * Called once per send, so everything the turn produces -- the player's message, the
	 * GM's prose, its rolls, and its private working -- shares one row and therefore one
	 * vertical position.
	 */
	startTurn(playerMarkdown?: string): void {
		const row = document.createElement("div");
		row.className = "turn-row";
		const aside = document.createElement("div");
		aside.className = "turn-aside";
		const content = document.createElement("div");
		content.className = "turn-content";
		row.append(aside, content);
		this.#root.append(row);
		this.#row = { row, aside, content };
		this.#open = undefined;
		this.#prose = "";

		// Keep the message inseparable from creation of the exchange it begins. The DOM
		// caller once added it first and called startTurn afterwards, silently attaching
		// every player message to the preceding exchange.
		if (playerMarkdown) this.add("turn player", playerMarkdown);
	}

	/**
	 * Add something to the current turn's private column.
	 *
	 * Does not close the open prose block: the aside is a different column, so it
	 * cannot interrupt the reading order of what the player saw.
	 */
	aside(block: HTMLElement): HTMLElement {
		this.#cells().aside.append(block);
		this.#onChange();
		return block;
	}

	/**
	 * Add a transient element to the player's column, without closing the prose block.
	 *
	 * For the waiting indicator. It was previously appended to the transcript root,
	 * which in a two-column grid means the first column -- so the "GM is thinking" dots
	 * appeared in the private gutter rather than where the player was reading.
	 *
	 * Unlike {@link add} this leaves the open prose block open, because the indicator is
	 * removed the moment the first token arrives and should not split the narration.
	 */
	pending(block: HTMLElement): HTMLElement {
		this.#cells().content.append(block);
		this.#onChange();
		return block;
	}

	/** The current row, creating one if a caller skipped startTurn. */
	#cells(): { row: HTMLElement; aside: HTMLElement; content: HTMLElement } {
		if (!this.#row) this.startTurn();
		return this.#row!;
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
			// The row is resolved first. startTurn clears the open block, so creating the
			// block before the row it belongs to nulls the reference immediately.
			const cell = this.#cells().content;
			const block = document.createElement("div");
			block.className = "turn gm";
			cell.append(block);
			this.#open = block;
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
		this.#cells().content.append(block);
		this.#onChange();
	}
}
