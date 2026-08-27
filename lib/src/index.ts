/**
 * @portent/core — a solo tabletop RPG engine.
 *
 * Deterministic generators an agent or an application drives: dice, map tiles,
 * and (as they land) decks, random tables and oracles. Nothing here calls a
 * language model, and nothing here touches a filesystem except through the
 * Storage port, so the same code runs in Node and in a browser.
 *
 * ```ts
 * import { roll, formatRoll, parseTile, renderAscii, renderSvg } from "@portent/core";
 *
 * formatRoll(roll("6#4d6kh3"));   // ability scores
 * renderSvg(parseTile(mySource)); // the same tile the ASCII shows
 * ```
 */

// Ports: the capabilities the library needs from its host.
export {
	assertValidKey,
	type Clock,
	cryptoRandomSource,
	defaultRandomSource,
	fixedClock,
	InvalidKeyError,
	isValidKey,
	type RandomSource,
	randomSeed,
	randomSourceFrom,
	seededRandomSource,
	type Storage,
	StorageError,
	type StorageKey,
	StorageUnavailableError,
	systemClock,
	tickingClock,
} from "./ports/index.ts";

// Dice.
export {
	analyze,
	chanceOf,
	type Condition,
	diceSummary,
	type Distribution,
	type Expr,
	type FnName,
	formatDistribution,
	formatRoll,
	MAX_REPEATS,
	type Modifier,
	type ModifierType,
	parse,
	type ParsedExpression,
	percentileOf,
	type RepeatedExpression,
	roll,
	type RolledGroup,
	rollExpression,
	type RollOptions,
	type RollResult,
	splitRepeat,
} from "./dice/index.ts";

// Map tiles.
export {
	CELL_SPECS,
	type CellKind,
	type CellSpec,
	census,
	connects,
	type Edge,
	edgesOf,
	type Exit,
	exitsOf,
	glyphOf,
	isPassable,
	kindsIn,
	knownGlyphs,
	legendFor,
	legendOf,
	MAX_TILE_SIZE,
	parchmentTheme,
	parseTile,
	parseTileSet,
	readSvgCells,
	readSvgSymbols,
	renderAscii,
	renderSvg,
	slateTheme,
	specOf,
	specOfGlyph,
	type SvgOptions,
	symbolId,
	type Theme,
	type Tile,
	TileParseError,
	type TileSource,
} from "./tiles/index.ts";

// Bundled content.
export { dungeonTiles } from "./content/dungeon-tiles.ts";
