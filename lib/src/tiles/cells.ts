/**
 * The cell registry — the single source of truth for what can occupy a square
 * of a map tile.
 *
 * Everything about tiles derives from the table below: the characters accepted
 * when parsing authored art, the characters emitted when rendering ASCII, the
 * legend, which cells connect a tile to its neighbours, and which SVG symbol
 * draws each cell. There is deliberately no second table anywhere, and in
 * particular no hand-written glyph-to-kind reverse map — that map is computed
 * here, once, from this one.
 *
 * Two structural guarantees rather than conventions:
 *
 * 1. **`CellKind` is derived from the registry**, so a kind that has no spec
 *    cannot be named, and a spec that no kind uses cannot exist. Adding a row
 *    below adds the kind; there is no union to keep in step.
 * 2. **The glyph mapping is validated as a bijection at module load.** Two
 *    kinds sharing a glyph, or a glyph that is not a single printable ASCII
 *    character, throws on import rather than silently making authored art
 *    ambiguous.
 *
 * Adding a cell kind is one row here plus one shape in `svg.ts`, and the type
 * checker will not let you forget the shape.
 */

/**
 * Registry row shape. `kind` is a plain string here so that {@link CellKind} can
 * be derived from the registry without a circular reference; the exported
 * {@link CellSpec} narrows it.
 */
interface CellSpecShape {
	/** Stable identifier. Appears in SVG output and in serialised tiles. */
	readonly kind: string;
	/** The one character used in authored art and in ASCII output. */
	readonly glyph: string;
	/** Human-readable name, for legends. */
	readonly label: string;
	/** Can a creature cross it without climbing, swimming or flying? */
	readonly passable: boolean;
	/**
	 * Does this cell join the tile to a neighbouring tile when it sits on the
	 * grid boundary? Drives {@link exitsOf}; never declared per tile.
	 */
	readonly connects: boolean;
	/**
	 * Does this cell block line of sight? Independent of {@link passable}: a
	 * chasm stops movement but not vision, and a closed door stops vision but
	 * can be opened. `void` is opaque so nothing is visible through a gap in the
	 * map.
	 */
	readonly opaque: boolean;
	/** Fill/stroke family. Resolved to actual colours by the SVG theme. */
	readonly tone: "outside" | "solid" | "open" | "opening" | "hazard" | "feature";
	/** One-line description, used in generated legends and documentation. */
	readonly note: string;
}

/**
 * The registry. Order is the legend order.
 *
 * Glyphs follow roguelike habit where one exists — `#` wall, `.` floor, `<` and
 * `>` stairs — because those are already in every player's fingers.
 */
const SPECS = [
	{
		kind: "void",
		glyph: " ",
		label: "outside",
		passable: false,
		connects: false,
		opaque: true,
		tone: "outside",
		note: "Not part of the tile. Draws nothing, so tiles need not be rectangular.",
	},
	{
		kind: "wall",
		glyph: "#",
		label: "wall",
		passable: false,
		connects: false,
		opaque: true,
		tone: "solid",
		note: "Solid rock or masonry.",
	},
	{
		kind: "floor",
		glyph: ".",
		label: "floor",
		passable: true,
		connects: true,
		opaque: false,
		tone: "open",
		note: "Walkable floor. On a tile boundary it is an open edge.",
	},
	{
		kind: "door",
		glyph: "+",
		label: "door",
		passable: true,
		connects: true,
		opaque: true,
		tone: "opening",
		note: "A door, closed but not locked unless the tile says so.",
	},
	{
		kind: "secret-door",
		glyph: "S",
		label: "secret door",
		passable: true,
		connects: true,
		opaque: true,
		tone: "opening",
		note: "Looks like wall until found. Draw it only on the GM's copy.",
	},
	{
		kind: "archway",
		glyph: "A",
		label: "archway",
		passable: true,
		connects: true,
		opaque: false,
		tone: "opening",
		note: "An opening with no door in it.",
	},
	{
		kind: "rubble",
		glyph: "^",
		label: "rubble",
		passable: true,
		connects: false,
		opaque: false,
		tone: "hazard",
		note: "Difficult terrain. Passable, slowly, and noisily.",
	},
	{
		kind: "water",
		glyph: "~",
		label: "water",
		passable: true,
		connects: false,
		opaque: false,
		tone: "hazard",
		note: "Shallow water unless the tile says otherwise.",
	},
	{
		kind: "chasm",
		glyph: "v",
		label: "chasm",
		passable: false,
		connects: false,
		opaque: false,
		tone: "hazard",
		note: "Open drop. Needs a bridge, a jump or a rope.",
	},
	{
		kind: "bridge",
		glyph: "=",
		label: "bridge",
		passable: true,
		connects: true,
		opaque: false,
		tone: "feature",
		note: "A span across a chasm or water. Usually single file.",
	},
	{
		kind: "pit",
		glyph: "o",
		label: "pit",
		// Steppable, unlike a chasm: walking onto a pit square is exactly how a
		// pit trap gets triggered. A chasm is an open gap you cannot cross at all.
		passable: true,
		connects: false,
		opaque: false,
		tone: "hazard",
		note: "A hole in the floor, trapped or not. You can step onto it; that may be unwise.",
	},
	{
		kind: "stairs-up",
		glyph: "<",
		label: "stairs up",
		passable: true,
		connects: true,
		opaque: false,
		tone: "feature",
		note: "Leads to the level above. Connects tiles vertically, not laterally.",
	},
	{
		kind: "stairs-down",
		glyph: ">",
		label: "stairs down",
		passable: true,
		connects: true,
		opaque: false,
		tone: "feature",
		note: "Leads to the level below.",
	},
	{
		kind: "pillar",
		glyph: "O",
		label: "pillar",
		passable: false,
		connects: false,
		opaque: true,
		tone: "solid",
		note: "Breaks line of sight and gives cover.",
	},
	{
		kind: "altar",
		glyph: "T",
		label: "altar",
		passable: false,
		connects: false,
		opaque: false,
		tone: "feature",
		note: "A raised block: altar, table, tomb lid or workbench.",
	},
	{
		kind: "statue",
		glyph: "i",
		label: "statue",
		passable: false,
		connects: false,
		opaque: true,
		tone: "feature",
		note: "A figure. Watch it.",
	},
	{
		kind: "brazier",
		glyph: "*",
		label: "brazier",
		passable: false,
		connects: false,
		opaque: false,
		tone: "feature",
		note: "A light source, lit or long cold.",
	},
] as const satisfies readonly CellSpecShape[];

/**
 * Every kind of cell, derived from the registry. Adding a row above adds a
 * member here, and nothing can name a kind that has no spec.
 */
export type CellKind = (typeof SPECS)[number]["kind"];

export interface CellSpec extends CellSpecShape {
	readonly kind: CellKind;
}

/** The registry, in legend order. */
export const CELL_SPECS: readonly CellSpec[] = SPECS;

/**
 * Build the lookup tables, rejecting any registry that would make authored art
 * ambiguous.
 *
 * The validation lives *inside* the index construction rather than in a bare
 * statement at module scope, because the package declares `sideEffects: false`
 * and a bundler is entitled to drop a call whose result nothing uses. Folding
 * it in here makes the check inseparable from the tables every projection
 * depends on, so it cannot be optimised away.
 *
 * A duplicate glyph is not a runtime condition to recover from. It is a mistake
 * in this file, and it must fail loudly before it can reach anyone's tiles.
 */
function buildIndexes(specs: readonly CellSpec[]): {
	byKind: ReadonlyMap<CellKind, CellSpec>;
	byGlyph: ReadonlyMap<string, CellSpec>;
} {
	const byKind = new Map<CellKind, CellSpec>();
	const byGlyph = new Map<string, CellSpec>();

	for (const spec of specs) {
		if (byKind.has(spec.kind)) throw new Error(`Cell registry: duplicate kind ${JSON.stringify(spec.kind)}`);

		if ([...spec.glyph].length !== 1) {
			throw new Error(
				`Cell registry: ${spec.kind} has glyph ${JSON.stringify(spec.glyph)}; glyphs must be exactly one character`,
			);
		}
		const code = spec.glyph.codePointAt(0)!;
		if (code < 0x20 || code > 0x7e) {
			throw new Error(
				`Cell registry: ${spec.kind} has glyph U+${code.toString(16).toUpperCase()}; glyphs must be printable ASCII ` +
					"so authored art survives every editor and terminal",
			);
		}
		const clash = byGlyph.get(spec.glyph);
		if (clash) {
			throw new Error(
				`Cell registry: ${spec.kind} and ${clash.kind} both use glyph ${JSON.stringify(spec.glyph)}; ` +
					"parsing would be ambiguous",
			);
		}

		byKind.set(spec.kind, spec);
		byGlyph.set(spec.glyph, spec);
	}

	if (!byKind.has("void")) {
		throw new Error('Cell registry: a "void" kind is required for non-rectangular tiles');
	}
	return { byKind, byGlyph };
}

const { byKind: BY_KIND, byGlyph: BY_GLYPH } = buildIndexes(CELL_SPECS);

/** The spec for a kind. Total by construction. */
export function specOf(kind: CellKind): CellSpec {
	// BY_KIND is built from the same registry CellKind is derived from, so this
	// cannot miss; the assertion documents that rather than defending against it.
	const spec = BY_KIND.get(kind);
	if (!spec) throw new Error(`Cell registry: no spec for kind ${JSON.stringify(kind)}`);
	return spec;
}

/** The spec for an authored character, or `undefined` if it is not in the registry. */
export function specOfGlyph(glyph: string): CellSpec | undefined {
	return BY_GLYPH.get(glyph);
}

/** The character for a kind. The inverse of {@link specOfGlyph}. */
export function glyphOf(kind: CellKind): string {
	return specOf(kind).glyph;
}

/** Every accepted character, in legend order. For error messages and docs. */
export function knownGlyphs(): string[] {
	return CELL_SPECS.map((spec) => spec.glyph);
}

/** Whether a creature can walk the cell unaided. */
export function isPassable(kind: CellKind): boolean {
	return specOf(kind).passable;
}

/** Whether the cell joins this tile to the next one when it sits on the boundary. */
export function connects(kind: CellKind): boolean {
	return specOf(kind).connects;
}

/** Whether the cell blocks line of sight. Drives field-of-view calculation. */
export function isOpaque(kind: CellKind): boolean {
	return specOf(kind).opaque;
}

/**
 * A legend for the kinds actually present, in registry order. Generated, so it
 * can never describe a glyph the parser does not accept.
 */
export function legendFor(kinds: Iterable<CellKind>): Array<{ glyph: string; label: string; note: string }> {
	const present = new Set(kinds);
	return CELL_SPECS.filter((spec) => present.has(spec.kind) && spec.kind !== "void").map((spec) => ({
		glyph: spec.glyph,
		label: spec.label,
		note: spec.note,
	}));
}
