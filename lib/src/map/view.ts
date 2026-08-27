/**
 * What the party knows about a map, and who is standing on it.
 *
 * The map itself is immutable data. What changes during play is knowledge and
 * position, so those live here rather than on the tile. Three states, which is
 * what a table actually needs:
 *
 * - **unknown** — never seen. The GM's map has the room; the players' does not.
 * - **explored** — seen before, not currently in sight. Terrain is remembered;
 *   creatures are not, because a goblin does not stay where you last saw it.
 * - **visible** — in someone's field of view right now.
 *
 * Every mutation returns a new view. Play is full of "what would they see from
 * here?" questions, and answering one should not disturb the real state.
 */

import type { Tile } from "../tiles/tile.ts";
import { type CellSet, cellKey, computeFov, type FovOptions, type Position } from "./visibility.ts";

/** How a cell should be drawn. */
export type CellState = "unknown" | "explored" | "visible";

export type ActorKind = "pc" | "ally" | "neutral" | "foe" | "object";

export interface Actor {
	readonly id: string;
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly kind: ActorKind;
	/** Single character for text output. Defaults per kind. */
	readonly glyph?: string;
	/** Overrides the palette for this actor. */
	readonly colour?: string;
	/**
	 * Whether this actor sees. Party members do; a chest does not. Defaults to
	 * true for `pc` and `ally`.
	 */
	readonly sees?: boolean;
	/** Sight radius in cells. Falls back to the view's default. */
	readonly sightRadius?: number;
}

/** Default text glyphs. Uppercase and punctuation that no cell glyph uses. */
const ACTOR_GLYPHS: Record<ActorKind, string> = {
	pc: "@",
	ally: "&",
	neutral: "?",
	foe: "!",
	object: "$",
};

export function actorGlyph(actor: Actor): string {
	return actor.glyph ?? ACTOR_GLYPHS[actor.kind];
}

export function actorSees(actor: Actor): boolean {
	return actor.sees ?? (actor.kind === "pc" || actor.kind === "ally");
}

export interface MapView {
	readonly map: Tile;
	/** Cells ever seen. Grows and never shrinks. */
	readonly explored: CellSet;
	/** Cells in sight right now. Recomputed whenever anyone moves. */
	readonly visible: CellSet;
	readonly actors: readonly Actor[];
	/** Sight radius used for actors that do not specify one. */
	readonly sightRadius: number | undefined;
}

export interface CreateViewOptions {
	readonly actors?: readonly Actor[];
	readonly sightRadius?: number;
	/** Start with the whole map known, for a GM view. */
	readonly revealAll?: boolean;
}

export function createView(map: Tile, options: CreateViewOptions = {}): MapView {
	const view: MapView = {
		map,
		explored: new Set(),
		visible: new Set(),
		actors: options.actors ? [...options.actors] : [],
		sightRadius: options.sightRadius,
	};
	if (options.revealAll) return revealAll(view);
	return view.actors.length > 0 ? recomputeVisibility(view) : view;
}

/** The state of one cell, for a renderer to branch on. */
export function cellState(view: MapView, x: number, y: number): CellState {
	const key = cellKey(x, y, view.map.width);
	if (view.visible.has(key)) return "visible";
	if (view.explored.has(key)) return "explored";
	return "unknown";
}

/**
 * Recompute what is visible from the current actor positions, and fold that into
 * what has been explored.
 *
 * Actors with the same sight radius are batched into one field-of-view call,
 * since the union of two unlimited-sight viewers is one calculation over two
 * origins rather than two calculations.
 */
export function recomputeVisibility(view: MapView, options: FovOptions = {}): MapView {
	const viewers = view.actors.filter(actorSees);
	if (viewers.length === 0) {
		return { ...view, visible: new Set() };
	}

	const byRadius = new Map<number, Position[]>();
	for (const actor of viewers) {
		const radius = actor.sightRadius ?? view.sightRadius ?? Number.POSITIVE_INFINITY;
		const group = byRadius.get(radius);
		if (group) group.push({ x: actor.x, y: actor.y });
		else byRadius.set(radius, [{ x: actor.x, y: actor.y }]);
	}

	const visible: CellSet = new Set();
	for (const [radius, origins] of byRadius) {
		for (const key of computeFov(view.map, origins, { ...options, radius })) visible.add(key);
	}

	const explored = new Set(view.explored);
	for (const key of visible) explored.add(key);

	return { ...view, visible, explored };
}

/** Mark the whole map known and in sight. The GM's own view. */
export function revealAll(view: MapView): MapView {
	const all: CellSet = new Set();
	for (let y = 0; y < view.map.height; y++) {
		for (let x = 0; x < view.map.width; x++) {
			if (view.map.cells[y][x] !== "void") all.add(cellKey(x, y, view.map.width));
		}
	}
	return { ...view, visible: all, explored: all };
}

/** Mark a rectangle of cells explored without anyone standing there. */
export function revealArea(
	view: MapView,
	area: { x: number; y: number; width: number; height: number },
): MapView {
	const explored = new Set(view.explored);
	for (let y = area.y; y < area.y + area.height; y++) {
		for (let x = area.x; x < area.x + area.width; x++) {
			if (x < 0 || y < 0 || x >= view.map.width || y >= view.map.height) continue;
			if (view.map.cells[y][x] === "void") continue;
			explored.add(cellKey(x, y, view.map.width));
		}
	}
	return { ...view, explored };
}

/**
 * Reveal one tile of a composed map, by lattice position.
 *
 * The usual way a dungeon opens up: the party walks into room 4, so room 4 is
 * now on the players' map whether or not they can see every corner of it.
 */
export function revealTile(
	view: MapView,
	col: number,
	row: number,
	options: { tileSize?: number; overlap?: number } = {},
): MapView {
	const size = options.tileSize ?? 7;
	const overlap = options.overlap ?? 1;
	const stride = size - overlap;
	return revealArea(view, { x: col * stride, y: row * stride, width: size, height: size });
}

/** Forget everything. Useful when the party leaves and the dungeon resets. */
export function forgetAll(view: MapView): MapView {
	return { ...view, explored: new Set(), visible: new Set() };
}

// ── Actors ───────────────────────────────────────────────────────────────────

export function withActors(view: MapView, actors: readonly Actor[], options: FovOptions = {}): MapView {
	return recomputeVisibility({ ...view, actors: [...actors] }, options);
}

export function addActor(view: MapView, actor: Actor, options: FovOptions = {}): MapView {
	if (view.actors.some((existing) => existing.id === actor.id)) {
		throw new Error(`Actor id ${JSON.stringify(actor.id)} is already on the map`);
	}
	return withActors(view, [...view.actors, actor], options);
}

export function removeActor(view: MapView, id: string, options: FovOptions = {}): MapView {
	return withActors(
		view,
		view.actors.filter((actor) => actor.id !== id),
		options,
	);
}

export function moveActor(view: MapView, id: string, to: Position, options: FovOptions = {}): MapView {
	let found = false;
	const actors = view.actors.map((actor) => {
		if (actor.id !== id) return actor;
		found = true;
		return { ...actor, x: to.x, y: to.y };
	});
	if (!found) throw new Error(`No actor with id ${JSON.stringify(id)}`);
	return withActors(view, actors, options);
}

/**
 * Actors the party can currently see.
 *
 * Terrain is remembered but creatures are not, so this reads from `visible`
 * only. An actor that sees is always included: you know where your own party is.
 */
export function visibleActors(view: MapView): Actor[] {
	return view.actors.filter(
		(actor) => actorSees(actor) || view.visible.has(cellKey(actor.x, actor.y, view.map.width)),
	);
}

export function actorAt(view: MapView, x: number, y: number): Actor | undefined {
	return view.actors.find((actor) => actor.x === x && actor.y === y);
}
