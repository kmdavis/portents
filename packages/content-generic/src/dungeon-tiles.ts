/**
 * The default dungeon tile set.
 *
 * Every tile is 7×7 and every connector sits at the centre of an edge, which is
 * what makes them fit together with no matching logic: a tile's east door is
 * always opposite its neighbour's west door. `standardTileProblems` from
 * `@portent/core` enforces both rules, and the tests here assert it finds
 * nothing.
 *
 * The 5×5 interior inside the wall ring is the working space. It is enough for
 * pillars around a feature, or a corridor with room to stand beside it.
 *
 * Authored as ASCII art, which is the source of truth: the graphical rendering
 * is a projection of the same parsed grid, so the two cannot disagree. Exits are
 * derived from the art, never declared, so a tile cannot claim a door it does
 * not draw.
 *
 * Legend lives in the cell registry and is generated from it, so it can never
 * describe a character the parser rejects.
 *
 * All original content. CC0.
 */

import type { TileSource } from "@portent/core";

export const dungeonTiles: readonly TileSource[] = [
	// ── Circulation ────────────────────────────────────────────────────────────
	{
		id: "four-way-hall",
		name: "Four-Way Hall",
		tags: ["room", "junction"],
		note: "An open room with a door on every side. Nothing here but a choice.",
		art: [
			"###+###",
			"#.....#",
			"#.....#",
			"+.....+",
			"#.....#",
			"#.....#",
			"###+###",
		],
	},
	{
		id: "cross-corridor",
		name: "Cross Corridor",
		tags: ["corridor", "junction"],
		note: "Two passages meeting at right angles. Poor cover, long sightlines.",
		art: [
			"###+###",
			"###.###",
			"###.###",
			"+.....+",
			"###.###",
			"###.###",
			"###+###",
		],
	},
	{
		id: "straight-corridor",
		name: "Straight Corridor",
		tags: ["corridor"],
		note: "Twenty paces of nothing. Roll for dressing if the party looks closely.",
		art: [
			"#######",
			"#######",
			"#######",
			"+.....+",
			"#######",
			"#######",
			"#######",
		],
	},
	{
		id: "bend-west-south",
		name: "Bend",
		tags: ["corridor"],
		note: "The corridor turns south. Anything coming the other way is heard before it is seen.",
		art: [
			"#######",
			"#######",
			"#######",
			"+...###",
			"###.###",
			"###.###",
			"###+###",
		],
	},
	{
		id: "bend-north-east",
		name: "Bend, Reversed",
		tags: ["corridor"],
		note: "The corridor turns east.",
		art: [
			"###+###",
			"###.###",
			"###.###",
			"###...+",
			"#######",
			"#######",
			"#######",
		],
	},
	{
		id: "t-junction",
		name: "T-Junction",
		tags: ["corridor", "junction"],
		note: "The passage splits. No signage, and the draught comes from the south.",
		art: [
			"#######",
			"#######",
			"#######",
			"+.....+",
			"###.###",
			"###.###",
			"###+###",
		],
	},
	{
		id: "dead-end",
		name: "Dead End",
		tags: ["corridor"],
		note: "It simply stops. There is a reason this was dug; find out what it was.",
		art: [
			"#######",
			"#######",
			"#######",
			"+..####",
			"#######",
			"#######",
			"#######",
		],
	},
	{
		id: "archway-passage",
		name: "Archway Passage",
		tags: ["corridor", "feature"],
		note: "Two open arches, no doors, and the carving above them has been chiselled flat.",
		art: [
			"#######",
			"#######",
			"#######",
			"+A...A+",
			"#######",
			"#######",
			"#######",
		],
	},

	// ── Rooms ──────────────────────────────────────────────────────────────────
	{
		id: "pillared-hall",
		name: "Pillared Hall",
		tags: ["room", "combat"],
		note: "Good cover, broken sightlines. An excellent place to be ambushed.",
		art: [
			"###+###",
			"#.....#",
			"#.O.O.#",
			"+.....+",
			"#.O.O.#",
			"#.....#",
			"###+###",
		],
	},
	{
		id: "guard-post",
		name: "Guard Post",
		tags: ["room", "combat"],
		note: "Arrow slits in the north wall cover the corridor beyond. Whoever holds this holds the approach.",
		art: [
			"#######",
			"#.....#",
			"#.O.O.#",
			"+.....+",
			"#.....#",
			"#.....#",
			"###+###",
		],
	},
	{
		id: "shrine",
		name: "Shrine",
		tags: ["room", "feature"],
		note: "An altar to something local. The offerings on it are fresh.",
		art: [
			"###+###",
			"#.....#",
			"#.TTT.#",
			"+.....+",
			"#.....#",
			"#.....#",
			"#######",
		],
	},
	{
		id: "crypt-niches",
		name: "Crypt Niches",
		tags: ["room", "feature"],
		note: "Bodies shelved three high. One lid is broken open, and it was pushed from the inside.",
		art: [
			"#######",
			"#TTTTT#",
			"#.....#",
			"+.....+",
			"#.....#",
			"#TTTTT#",
			"#######",
		],
	},
	{
		id: "statue-gallery",
		name: "Statue Gallery",
		tags: ["room", "feature"],
		note: "Four figures, all facing the brazier. None of them faced it yesterday.",
		art: [
			"###+###",
			"#i...i#",
			"#.....#",
			"+..*..+",
			"#.....#",
			"#i...i#",
			"###+###",
		],
	},
	{
		id: "great-hall",
		name: "Great Hall",
		tags: ["room", "landmark"],
		note: "Built to impress, with an obvious focal point and pillars to hide behind.",
		art: [
			"###+###",
			"#O...O#",
			"#..T..#",
			"+.....+",
			"#..*..#",
			"#O...O#",
			"###+###",
		],
	},
	{
		id: "kennel",
		name: "Kennel",
		tags: ["room", "combat"],
		note: "Stalls, straw and chewed bones. The gates are open. Whatever lived here is loose in the dungeon now.",
		art: [
			"#######",
			"#T.T.T#",
			"#.....#",
			"+.....+",
			"#.....#",
			"#T.T.T#",
			"#######",
		],
	},
	{
		id: "hidden-vault",
		name: "Hidden Vault",
		tags: ["room", "treasure"],
		note: "Emptied properly, except for what was overlooked. The only way in is the false wall.",
		art: [
			"#######",
			"#.....#",
			"#.....#",
			"S..T..#",
			"#.....#",
			"#.....#",
			"#######",
		],
	},

	// ── Vertical ───────────────────────────────────────────────────────────────
	{
		id: "stair-down",
		name: "Stair Down",
		tags: ["room", "vertical"],
		note: "Worn steps descending into colder air.",
		art: [
			"###+###",
			"#.....#",
			"#.>>>.#",
			"+.>>>.#",
			"#.>>>.#",
			"#.....#",
			"#######",
		],
	},
	{
		id: "stair-up",
		name: "Stair Up",
		tags: ["room", "vertical"],
		note: "Steps rising towards a draught and, faintly, daylight.",
		art: [
			"###+###",
			"#.....#",
			"#.<<<.#",
			"+.<<<.#",
			"#.<<<.#",
			"#.....#",
			"#######",
		],
	},
	{
		id: "spiral-stair",
		name: "Spiral Stair",
		tags: ["room", "vertical"],
		note: "Up and down both, and tight enough that only one can fight at a time.",
		art: [
			"#######",
			"#..<..#",
			"#.....#",
			"+..>..+",
			"#.....#",
			"#.....#",
			"###+###",
		],
	},

	// ── Hazards ────────────────────────────────────────────────────────────────
	{
		id: "collapsed-chamber",
		name: "Collapsed Chamber",
		tags: ["room", "obstacle"],
		note: "Half the ceiling is on the floor. The east wall is thin enough to break through in an hour.",
		art: [
			"###+###",
			"#..^..#",
			"#.^^^.#",
			"+^^^^^S",
			"#.^^^.#",
			"#..^..#",
			"#######",
		],
	},
	{
		id: "chasm-room",
		name: "Chasm",
		tags: ["room", "obstacle"],
		note: "The floor is gone. Something at the bottom, a long way down, and it has noticed the light.",
		art: [
			"###+###",
			"#.....#",
			"#.vvv.#",
			"+.vvv.+",
			"#.vvv.#",
			"#.....#",
			"###+###",
		],
	},
	{
		id: "narrow-bridge",
		name: "Narrow Bridge",
		tags: ["corridor", "obstacle"],
		note: "A span with no rail. Single file, and a bad place to fight.",
		art: [
			"#######",
			"#vvvvv#",
			"#vvvvv#",
			"+=====+",
			"#vvvvv#",
			"#vvvvv#",
			"#######",
		],
	},
	{
		id: "flooded-room",
		name: "Flooded Room",
		tags: ["room", "hazard"],
		note: "Knee-deep, cold and opaque. Anything dropped here is lost.",
		art: [
			"###+###",
			"#~~~~~#",
			"#~~~~~#",
			"+~~~~~+",
			"#~~~~~#",
			"#~~~~~#",
			"###+###",
		],
	},
	{
		id: "cistern",
		name: "Cistern",
		tags: ["room", "hazard"],
		note: "A plank walk over standing water. Something below the surface has been eating the fish.",
		art: [
			"###+###",
			"#~~~~~#",
			"#~~~~~#",
			"+=====+",
			"#~~~~~#",
			"#~~~~~#",
			"#######",
		],
	},
	{
		id: "trapped-corridor",
		name: "Trapped Corridor",
		tags: ["corridor", "trap"],
		note: "Two covered pits. The dust lies flat where nobody has walked.",
		art: [
			"#######",
			"#######",
			"#######",
			"+.o.o.+",
			"#######",
			"#######",
			"#######",
		],
	},

	// ── Caves ──────────────────────────────────────────────────────────────────
	{
		id: "fungus-cavern",
		name: "Fungus Cavern",
		tags: ["cave", "feature"],
		note: "Cultivated, tended, harvested recently. Someone farms here, and it is not the goblins.",
		art: [
			" ##+## ",
			"##...##",
			"#.....#",
			"+.....+",
			"#.....#",
			"##...##",
			" ##+## ",
		],
	},
	{
		id: "rubble-cave",
		name: "Rubble Cave",
		tags: ["cave", "obstacle"],
		note: "A natural void, half filled by a roof fall. Slow going and loud.",
		art: [
			" ##### ",
			"##^^^##",
			"#^^^^^#",
			"+..^..+",
			"#^^^^^#",
			"##^^^##",
			" ##+## ",
		],
	},
] as const;
