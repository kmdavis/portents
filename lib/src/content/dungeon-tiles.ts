/**
 * The default dungeon tile set.
 *
 * Draw a tile each time the party opens an unexplored exit and connect it to the
 * exit they came through. The set depletes if you draw without replacement,
 * which gives a dungeon a natural size and a natural ending.
 *
 * Authored as ASCII art, which is the source of truth: the graphical rendering
 * is a projection of the same parsed grid, so the two cannot disagree. Exits are
 * derived from the art, never declared here, so a tile cannot claim a door it
 * does not draw.
 *
 * Legend lives in the cell registry (`../tiles/cells.ts`) and is generated from
 * it, so it can never describe a character the parser rejects.
 *
 * All original content. CC0.
 */

import type { TileSource } from "../tiles/tile.ts";

export const dungeonTiles: readonly TileSource[] = [
	{
		id: "four-way-junction",
		name: "Four-Way Junction",
		tags: ["junction"],
		note: "Nothing here but a choice.",
		art: [
			"###+###", //
			"#.....#",
			"+.....+",
			"#.....#",
			"###+###",
		],
	},
	{
		id: "bend",
		name: "Bend",
		tags: ["corridor"],
		note: "The corridor turns.",
		art: [
			"#####", //
			"+...#",
			"###.#",
			"  #.#",
			"  #+#",
		],
	},
	{
		id: "long-hall",
		name: "Long Hall",
		tags: ["corridor"],
		note: "Twenty paces of nothing. Roll for dressing if the party looks closely.",
		art: [
			"###########", //
			"+.........+",
			"###########",
		],
	},
	{
		id: "t-junction",
		name: "T-Junction",
		tags: ["junction"],
		note: "The passage splits. No signage.",
		art: [
			"#######", //
			"+.....+",
			"###.###",
			"  #+#  ",
		],
	},
	{
		id: "pillared-hall",
		name: "Pillared Hall",
		tags: ["room", "combat"],
		note: "Good cover, broken sightlines. An excellent place to be ambushed.",
		art: [
			"####+####", //
			"#.......#",
			"+.O...O.+",
			"#.......#",
			"#.O...O.#",
			"#.......#",
			"#########",
		],
	},
	{
		id: "stair-down",
		name: "Stair Down",
		tags: ["room", "vertical"],
		note: "Worn steps descending into colder air.",
		art: [
			"#######", //
			"+.....#",
			"#.>>>.#",
			"#.>>>.#",
			"###+###",
		],
	},
	{
		id: "spiral-stair",
		name: "Spiral Stair",
		tags: ["room", "vertical"],
		note: "Up and down both, and tight enough that only one can fight at a time.",
		art: [
			"#####", //
			"#.<.#",
			"+.>.#",
			"#...#",
			"##+##",
		],
	},
	{
		id: "collapsed-chamber",
		name: "Collapsed Chamber",
		tags: ["room", "obstacle"],
		note: "Half the ceiling is on the floor. The east exit is buried and can be dug out in an hour.",
		art: [
			"#########", //
			"+..^^^..#",
			"#.^^^^^.#",
			"#..^^^..S",
			"####+####",
		],
	},
	{
		id: "chasm",
		name: "Chasm",
		tags: ["room", "obstacle"],
		note: "The floor is gone. Something at the bottom, a long way down.",
		art: [
			"#########", //
			"+.......#",
			"#.vvvvv.#",
			"#.vvvvv.+",
			"#.......#",
			"#########",
		],
	},
	{
		id: "narrow-bridge",
		name: "Narrow Bridge",
		tags: ["corridor", "obstacle"],
		note: "A span with no rail. Single file, and a bad place to fight.",
		art: [
			"#vvvvvvv#", //
			"+=======+",
			"#vvvvvvv#",
		],
	},
	{
		id: "flooded-room",
		name: "Flooded Room",
		tags: ["room", "hazard"],
		note: "Knee-deep, cold and opaque. Anything dropped here is lost. The south exit is submerged.",
		art: [
			"#########", //
			"+~~~~~~~#",
			"#~~~~~~~#",
			"#~~~~~~~#",
			"####~####",
		],
	},
	{
		id: "shrine",
		name: "Shrine",
		tags: ["room", "feature"],
		note: "An altar to something local. The offerings on it are fresh.",
		art: [
			"#########", //
			"#..TTT..#",
			"#.......#",
			"+.......#",
			"#########",
		],
	},
	{
		id: "crypt-niches",
		name: "Crypt Niches",
		tags: ["room", "feature"],
		note: "Bodies shelved three high. One lid is broken open from the inside.",
		art: [
			"#########", //
			"#TTTTTTT#",
			"+.......+",
			"#TTTTTTT#",
			"#########",
		],
	},
	{
		id: "guard-post",
		name: "Guard Post",
		tags: ["room", "combat"],
		note: "Arrow slits in the north wall cover the corridor beyond. Whoever holds this holds the approach.",
		art: [
			"#########", //
			"#.......#",
			"+...*...+",
			"#########",
		],
	},
	{
		id: "portcullis-corridor",
		name: "Portcullis Corridor",
		tags: ["corridor", "trap"],
		note: "Two iron grates, one at each end, worked by a mechanism somewhere else. A killing box waiting for occupants.",
		art: [
			"#########", //
			"+A.....A+",
			"#########",
		],
	},
	{
		id: "fungus-cavern",
		name: "Fungus Cavern",
		tags: ["cave", "feature"],
		note: "Cultivated, tended, harvested recently. Someone farms here. Both exits are low crawls.",
		art: [
			" ###+### ", //
			"##.....##",
			"+.......#",
			"##.....##",
			" ##+#### ",
		],
	},
	{
		id: "kennel",
		name: "Kennel",
		tags: ["room", "combat"],
		note: "Stalls, straw and chewed bones. The gates are open. Whatever lived here is loose in the dungeon now.",
		art: [
			"#########", //
			"#T.T.T.T#",
			"+.......+",
			"#########",
		],
	},
	{
		id: "trapped-corridor",
		name: "Trapped Corridor",
		tags: ["corridor", "trap"],
		note: "Two covered pits. The dust lies flat where nobody has walked.",
		art: [
			"#########", //
			"+..o.o..+",
			"#########",
		],
	},
	{
		id: "statue-gallery",
		name: "Statue Gallery",
		tags: ["room", "feature"],
		note: "Four figures, all facing the brazier. None of them faced it yesterday.",
		art: [
			"#########", //
			"#i.....i#",
			"+...*...+",
			"#i.....i#",
			"#########",
		],
	},
	{
		id: "dead-end",
		name: "Dead End",
		tags: ["corridor"],
		note: "It simply stops. There is a reason this was dug.",
		art: [
			"#######", //
			"+.....#",
			"#######",
		],
	},
	{
		id: "great-hall",
		name: "Great Hall",
		tags: ["room", "landmark"],
		note: "The largest space so far, built to impress, with an obvious focal point at the far end.",
		art: [
			"#####+#####", //
			"#.O.....O.#",
			"+.........+",
			"#....T....#",
			"#.O.....O.#",
			"#####+#####",
		],
	},
	{
		id: "cistern",
		name: "Cistern",
		tags: ["room", "hazard"],
		note: "A plank walk over standing water. Something below the surface has been eating the fish.",
		art: [
			"#########", //
			"+~~~~~~~#",
			"#=======#",
			"#~~~~~~~#",
			"####+####",
		],
	},
	{
		id: "hidden-vault",
		name: "Hidden Vault",
		tags: ["room", "treasure"],
		note: "Emptied properly, except for what was overlooked. The only way in is the false wall.",
		art: [
			"#######", //
			"#.....#",
			"S..T..#",
			"#.....#",
			"#######",
		],
	},
] as const;
