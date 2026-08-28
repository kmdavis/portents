import type { Table } from "@portent/core";

/**
 * Tavern Names
 *
 * Composed inn and tavern signs.
 */
export const tavernNames = {
	id: "tavern-names",
	name: "Tavern Names",
	description: "Composed inn and tavern signs.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	entries: [
		{
			text: "The {{pick:Broken|Crooked|Drowned|Gilded|Hungry|Laughing|Patient|Rusted|Sleeping|Sullen|Thirsty|Weeping}} {{pick:Anchor|Boar|Bell|Crow|Ferret|Hart|Hound|Lantern|Mule|Pilgrim|Sergeant|Wheel}}",
		},
		{
			text: "The {{pick:Three|Seven|Nine|Two}} {{pick:Barrels|Coins|Crowns|Feathers|Kettles|Knives|Sisters|Widows}}",
		},
		{
			text: "The {{pick:Last|First|Only|Wrong}} {{pick:Bed|Chance|Draught|House|Road|Toll|Turning}}",
		},
		{
			text: "{{table:names-common}}'s {{pick:Rest|Cellar|Table|Yard|Hearth}}",
		},
	],
} as const satisfies Table;
