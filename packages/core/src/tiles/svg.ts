/**
 * The graphical projection of a tile.
 *
 * Reads the same `tile.cells` grid the ASCII projection reads, so the picture
 * and the text cannot describe different tiles. Three things make that
 * structural rather than aspirational:
 *
 * 1. `SHAPES` is a `Record<CellKind, CellShape>`. `CellKind` is derived from the
 *    cell registry, so **adding a cell kind without drawing it is a compile
 *    error**, not a runtime surprise.
 * 2. Every non-void cell emits exactly one `<use>` carrying `data-x`, `data-y`
 *    and `data-kind`, referencing `#portents-cell-<kind>`. The symbol actually
 *    referenced is computed from the grid, so a test can verify the *visual*
 *    choice, not just an attribute that claims one.
 * 3. Output is a plain string built with no DOM, so it works identically in Node
 *    and the browser, and a future raster renderer is a third projection of the
 *    same grid rather than a conversion of this one.
 */

import { type CellKind, CELL_SPECS, specOf } from "./cells.ts";
import { kindsIn, legendOf, type Tile } from "./tile.ts";

/** Colours per tone. Every tone in the registry needs an entry. */
export interface Theme {
	readonly name: string;
	readonly background: string;
	readonly ink: string;
	readonly tones: Record<CellSpecTone, { fill: string; stroke: string }>;
}

type CellSpecTone = (typeof CELL_SPECS)[number]["tone"];

export const parchmentTheme: Theme = {
	name: "parchment",
	background: "#f4ecd8",
	ink: "#2b2118",
	tones: {
		outside: { fill: "none", stroke: "none" },
		solid: { fill: "#3d3227", stroke: "#2b2118" },
		open: { fill: "#fbf6e9", stroke: "#c9b99a" },
		opening: { fill: "#fbf6e9", stroke: "#8a5a2b" },
		hazard: { fill: "#dfe6ea", stroke: "#5d7684" },
		feature: { fill: "#f0e3c8", stroke: "#7a5c34" },
	},
};

export const slateTheme: Theme = {
	name: "slate",
	background: "#1b1f24",
	ink: "#e6edf3",
	tones: {
		outside: { fill: "none", stroke: "none" },
		solid: { fill: "#2d333b", stroke: "#171b20" },
		open: { fill: "#3f4650", stroke: "#586069" },
		opening: { fill: "#4a5058", stroke: "#d9a05b" },
		hazard: { fill: "#24343d", stroke: "#4c7d95" },
		feature: { fill: "#464d57", stroke: "#c2a06a" },
	},
};

/**
 * The geometry for one cell kind, drawn in a 0-100 unit square. Returns the
 * inner markup of a `<symbol>`; the caller supplies the element and the fills.
 */
type CellShape = (paint: { fill: string; stroke: string; ink: string }) => string;

const rect = (fill: string, stroke: string, inset = 0): string =>
	`<rect x="${inset}" y="${inset}" width="${100 - inset * 2}" height="${100 - inset * 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;

const floorBase = (p: { fill: string; stroke: string }): string => rect(p.fill, p.stroke);

/**
 * One shape per cell kind. Exhaustive by type: the registry drives `CellKind`,
 * so a new kind fails to compile until it is drawn here.
 */
const SHAPES: Record<CellKind, CellShape> = {
	void: () => "",

	wall: (p) => rect(p.fill, p.stroke),

	floor: (p) => floorBase(p),

	door: (p) =>
		`${floorBase(p)}<rect x="0" y="38" width="100" height="24" fill="${p.fill}" stroke="none"/>` +
		`<rect x="42" y="10" width="16" height="80" fill="${p.stroke}" stroke="none"/>` +
		`<path d="M58 20 A 34 34 0 0 1 88 50" fill="none" stroke="${p.stroke}" stroke-width="3" stroke-dasharray="6 5"/>`,

	"secret-door": (p) =>
		`${rect(p.fill, p.stroke)}<path d="M20 50 H80" stroke="${p.stroke}" stroke-width="6" stroke-dasharray="10 8"/>` +
		`<text x="50" y="34" font-size="26" text-anchor="middle" fill="${p.stroke}">S</text>`,

	archway: (p) =>
		`${floorBase(p)}<rect x="0" y="0" width="18" height="100" fill="${p.stroke}" opacity="0.8"/>` +
		`<rect x="82" y="0" width="18" height="100" fill="${p.stroke}" opacity="0.8"/>` +
		`<path d="M18 30 A 32 32 0 0 1 82 30" fill="none" stroke="${p.stroke}" stroke-width="4"/>`,

	rubble: (p) =>
		`${floorBase(p)}<polygon points="20,72 34,52 48,72" fill="${p.stroke}"/>` +
		`<polygon points="46,80 60,58 76,80" fill="${p.stroke}" opacity="0.8"/>` +
		`<polygon points="62,44 72,28 84,44" fill="${p.stroke}" opacity="0.6"/>`,

	water: (p) =>
		`${rect(p.fill, p.stroke)}<path d="M6 40 q 12 -10 24 0 t 24 0 t 24 0 t 24 0" fill="none" stroke="${p.stroke}" stroke-width="4"/>` +
		`<path d="M6 66 q 12 -10 24 0 t 24 0 t 24 0 t 24 0" fill="none" stroke="${p.stroke}" stroke-width="4" opacity="0.7"/>`,

	chasm: (p) =>
		`${rect(p.stroke, p.stroke)}<path d="M0 0 L100 100 M100 0 L0 100 M50 0 L50 100 M0 50 L100 50" stroke="${p.fill}" stroke-width="3" opacity="0.55"/>`,

	bridge: (p) =>
		`<rect x="0" y="0" width="100" height="100" fill="${p.stroke}" opacity="0.35"/>` +
		`<rect x="0" y="26" width="100" height="48" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2"/>` +
		`<path d="M20 26 V74 M50 26 V74 M80 26 V74" stroke="${p.stroke}" stroke-width="3"/>`,

	pit: (p) =>
		`${floorBase(p)}<circle cx="50" cy="50" r="32" fill="${p.stroke}"/>` +
		`<circle cx="50" cy="50" r="20" fill="none" stroke="${p.fill}" stroke-width="3" stroke-dasharray="5 5"/>`,

	"stairs-up": (p) =>
		`${floorBase(p)}<path d="M14 76 H86 M22 60 H78 M30 44 H70 M38 28 H62" stroke="${p.stroke}" stroke-width="6" stroke-linecap="round"/>` +
		`<path d="M42 18 L50 8 L58 18" fill="none" stroke="${p.stroke}" stroke-width="5" stroke-linecap="round"/>`,

	"stairs-down": (p) =>
		`${floorBase(p)}<path d="M14 24 H86 M22 40 H78 M30 56 H70 M38 72 H62" stroke="${p.stroke}" stroke-width="6" stroke-linecap="round"/>` +
		`<path d="M42 82 L50 92 L58 82" fill="none" stroke="${p.stroke}" stroke-width="5" stroke-linecap="round"/>`,

	pillar: (p) =>
		`${rect(p.fill, p.stroke, 0)}<circle cx="50" cy="50" r="28" fill="${p.stroke}"/>` +
		`<circle cx="50" cy="50" r="18" fill="none" stroke="${p.fill}" stroke-width="3"/>`,

	altar: (p) =>
		`${floorBase(p)}<rect x="16" y="30" width="68" height="44" rx="4" fill="${p.stroke}"/>` +
		`<path d="M50 36 V60 M38 46 H62" stroke="${p.fill}" stroke-width="5" stroke-linecap="round"/>`,

	statue: (p) =>
		`${floorBase(p)}<rect x="30" y="74" width="40" height="12" fill="${p.stroke}"/>` +
		`<circle cx="50" cy="30" r="12" fill="${p.stroke}"/>` +
		`<polygon points="34,74 50,44 66,74" fill="${p.stroke}"/>`,

	brazier: (p) =>
		`${floorBase(p)}<rect x="40" y="70" width="20" height="14" fill="${p.stroke}"/>` +
		`<path d="M26 56 H74 L64 70 H36 Z" fill="${p.stroke}"/>` +
		`<path d="M50 20 q 14 18 0 32 q -14 -14 0 -32 Z" fill="${p.stroke}" opacity="0.75"/>`,
};

/** A rectangle of cells. Used to crop a large map to what is being looked at. */
export interface Viewport {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * What the viewer knows, as cell-key sets. Supply this to draw fog of war.
 *
 * Omit it and everything is drawn, which is the GM's view and the default.
 */
export interface VisibilityMask {
	/** Cells in sight now: drawn fully, with tokens. */
	readonly visible: ReadonlySet<number>;
	/** Cells seen before: drawn dimmed, without tokens. */
	readonly explored: ReadonlySet<number>;
}

/**
 * A token to draw on the map. Structurally the library's `Actor`, so an actor
 * can be passed straight in.
 *
 * The label defaults to the initial of `name`, because that is the convention on
 * a battle map: `B` for Brannoc, `G` for the goblin. The ASCII view instead
 * defaults to a glyph per kind (`@` for a party member, `!` for a foe), because
 * text needs one column and a stable symbol. Two media, two conventions. Pass
 * `glyph` explicitly to override either — `actorGlyph(actor)` gives the ASCII
 * symbol if you want it on the picture too.
 */
export interface TokenLike {
	readonly id: string;
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly kind: string;
	readonly colour?: string;
	/** Label drawn in the token. Defaults to the initial of `name`. */
	readonly glyph?: string;
}

export interface SvgOptions {
	/** Pixel size of one cell. Default 24. */
	readonly cellSize?: number;
	readonly theme?: Theme;
	/** Draw a faint grid over the tile. Default false. */
	readonly grid?: boolean;
	/** Accessible title. Defaults to the tile name. */
	readonly title?: string;
	/** Emit a legend below the grid. Default false. */
	readonly legend?: boolean;
	/**
	 * Crop to a rectangle of cells. Coordinates stay in map space, so a cell's
	 * `data-x` is its position on the map, not within the crop.
	 */
	readonly viewport?: Viewport;
	/** Draw fog of war. Omit to draw everything. */
	readonly visibility?: VisibilityMask;
	/** Tokens to draw. Only those on visible cells are drawn when fog is on. */
	readonly tokens?: readonly TokenLike[];
	/** Opacity of explored-but-unseen cells. Default 0.42. */
	readonly exploredOpacity?: number;
}

/** Token colours by kind, overridable per token. */
const TOKEN_COLOURS: Record<string, string> = {
	pc: "#2f6b3a",
	ally: "#3a5f8a",
	neutral: "#7a6a3a",
	foe: "#a3341f",
	object: "#6b655e",
};

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** The SVG symbol id for a cell kind. The one place this string is built. */
export function symbolId(kind: CellKind): string {
	return `portents-cell-${kind}`;
}

/**
 * Render the tile as a standalone SVG document.
 *
 * Only the kinds present in the tile get symbol definitions, so the output of a
 * small tile is small.
 */
export function renderSvg(tile: Tile, opts: SvgOptions = {}): string {
	const cell = Math.max(4, Math.round(opts.cellSize ?? 24));
	const theme = opts.theme ?? parchmentTheme;
	const legend = opts.legend ? legendOf(tile) : [];
	const legendHeight = legend.length > 0 ? 18 + legend.length * 16 : 0;
	const exploredOpacity = opts.exploredOpacity ?? 0.42;

	// Clamp the viewport to the map, so an over-wide crop is harmless.
	const crop = opts.viewport
		? {
				x: Math.max(0, Math.min(opts.viewport.x, tile.width - 1)),
				y: Math.max(0, Math.min(opts.viewport.y, tile.height - 1)),
				width: Math.max(1, opts.viewport.width),
				height: Math.max(1, opts.viewport.height),
			}
		: { x: 0, y: 0, width: tile.width, height: tile.height };
	const endX = Math.min(tile.width, crop.x + crop.width);
	const endY = Math.min(tile.height, crop.y + crop.height);
	const cols = endX - crop.x;
	const rows = endY - crop.y;

	const gridWidth = cols * cell;
	const gridHeight = rows * cell;
	const totalHeight = gridHeight + legendHeight;

	const state = (x: number, y: number): "unknown" | "explored" | "visible" => {
		if (!opts.visibility) return "visible";
		const key = y * tile.width + x;
		if (opts.visibility.visible.has(key)) return "visible";
		if (opts.visibility.explored.has(key)) return "explored";
		return "unknown";
	};

	const uses: string[] = [];
	const drawn = new Set<CellKind>();
	for (let y = crop.y; y < endY; y++) {
		for (let x = crop.x; x < endX; x++) {
			const kind = tile.cells[y][x];
			// Void draws nothing, which is what lets tiles be non-rectangular.
			if (kind === "void") continue;
			const cellState = state(x, y);
			// Unknown cells are not drawn at all, rather than drawn dark: the players'
			// map should not leak the shape of a room they have never entered.
			if (cellState === "unknown") continue;
			drawn.add(kind);
			const dim = cellState === "explored" ? ` opacity="${exploredOpacity}"` : "";
			uses.push(
				`<use href="#${symbolId(kind)}" x="${(x - crop.x) * cell}" y="${(y - crop.y) * cell}" ` +
					`width="${cell}" height="${cell}" data-x="${x}" data-y="${y}" data-kind="${kind}"` +
					`${dim} data-state="${cellState}"/>`,
			);
		}
	}

	// Only define symbols actually drawn, so a fogged or cropped map stays small.
	const defs = kindsIn(tile)
		.filter((kind) => drawn.has(kind))
		.map((kind) => {
			const spec = specOf(kind);
			const paint = { ...theme.tones[spec.tone], ink: theme.ink };
			return (
				`<symbol id="${symbolId(kind)}" viewBox="0 0 100 100" data-kind="${kind}" data-label="${escapeXml(spec.label)}">` +
				`${SHAPES[kind](paint)}</symbol>`
			);
		})
		.join("");

	const tokens = (opts.tokens ?? []).filter((token) => {
		if (token.x < crop.x || token.x >= endX || token.y < crop.y || token.y >= endY) return false;
		// A creature is only drawn where it can be seen. Terrain is remembered;
		// creatures are not.
		return state(token.x, token.y) === "visible";
	});

	const tokenMarkup =
		tokens.length > 0
			? `<g data-portents="tokens">${tokens
					.map((token) => {
						const colour = token.colour ?? TOKEN_COLOURS[token.kind] ?? theme.ink;
						const cx = (token.x - crop.x) * cell + cell / 2;
						const cy = (token.y - crop.y) * cell + cell / 2;
						const r = cell * 0.34;
						const label = escapeXml(token.glyph ?? token.name.slice(0, 1).toUpperCase());
						return (
							`<g data-token="${escapeXml(token.id)}" data-x="${token.x}" data-y="${token.y}" ` +
							`data-kind="${escapeXml(token.kind)}">` +
							`<title>${escapeXml(token.name)}</title>` +
							`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}" stroke="${theme.background}" stroke-width="${Math.max(1, cell * 0.06)}"/>` +
							`<text x="${cx}" y="${cy + r * 0.42}" font-size="${r * 1.15}" font-family="monospace" ` +
							`text-anchor="middle" fill="${theme.background}">${label}</text>` +
							"</g>"
						);
					})
					.join("")}</g>`
			: "";

	const gridLines = opts.grid
		? `<g stroke="${theme.ink}" stroke-width="0.5" opacity="0.18">${[
				...Array.from(
					{ length: cols + 1 },
					(_, i) => `<line x1="${i * cell}" y1="0" x2="${i * cell}" y2="${gridHeight}"/>`,
				),
				...Array.from(
					{ length: rows + 1 },
					(_, i) => `<line x1="0" y1="${i * cell}" x2="${gridWidth}" y2="${i * cell}"/>`,
				),
			].join("")}</g>`
		: "";

	const legendMarkup =
		legend.length > 0
			? `<g data-portents="legend" transform="translate(0 ${gridHeight + 14})" font-size="11" fill="${theme.ink}">${legend
					.map(
						(entry, i) =>
							`<text x="2" y="${i * 16}" font-family="monospace">${escapeXml(entry.glyph)}</text>` +
							`<text x="18" y="${i * 16}">${escapeXml(entry.label)}</text>`,
					)
					.join("")}</g>`
			: "";

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridWidth} ${totalHeight}" ` +
		`width="${gridWidth}" height="${totalHeight}" role="img" ` +
		`data-portents-tile="${escapeXml(tile.id)}" data-width="${tile.width}" data-height="${tile.height}" ` +
		`data-crop-x="${crop.x}" data-crop-y="${crop.y}" data-cols="${cols}" data-rows="${rows}" ` +
		`data-cell-size="${cell}">` +
		`<title>${escapeXml(opts.title ?? tile.name)}</title>` +
		`<defs>${defs}</defs>` +
		`<rect width="${gridWidth}" height="${totalHeight}" fill="${theme.background}"/>` +
		`<g data-portents="cells">${uses.join("")}</g>` +
		tokenMarkup +
		gridLines +
		legendMarkup +
		`</svg>`
	);
}

/**
 * The cells an SVG document claims to contain, read back out of the markup.
 *
 * This exists so the equivalence between the two projections is *checked*
 * rather than asserted: the test suite renders every tile, reads it back with
 * this, and compares against the grid. It is a deliberately dumb scan, not an
 * XML parser, so it cannot accidentally repair malformed output.
 */
export function readSvgCells(
	svg: string,
): Array<{ x: number; y: number; kind: string; href: string; state: string }> {
	const out: Array<{ x: number; y: number; kind: string; href: string; state: string }> = [];
	const pattern = /<use\s+href="([^"]+)"[^>]*?data-x="(\d+)"\s+data-y="(\d+)"\s+data-kind="([^"]+)"([^>]*)\/>/g;
	for (const match of svg.matchAll(pattern)) {
		out.push({
			href: match[1],
			x: Number.parseInt(match[2], 10),
			y: Number.parseInt(match[3], 10),
			kind: match[4],
			state: /data-state="([a-z]+)"/.exec(match[5])?.[1] ?? "visible",
		});
	}
	return out;
}

/** The tokens a document draws. */
export function readSvgTokens(svg: string): Array<{ id: string; x: number; y: number; kind: string }> {
	const pattern = /<g data-token="([^"]+)" data-x="(\d+)" data-y="(\d+)" data-kind="([^"]+)">/g;
	return [...svg.matchAll(pattern)].map((match) => ({
		id: match[1],
		x: Number.parseInt(match[2], 10),
		y: Number.parseInt(match[3], 10),
		kind: match[4],
	}));
}

/** The symbol ids a document defines. */
export function readSvgSymbols(svg: string): string[] {
	return [...svg.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
}
