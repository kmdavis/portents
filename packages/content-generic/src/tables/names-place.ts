import type { Table } from "@portent/core";

/**
 * Names: Places
 *
 * Settlements, holds and landmarks. Composed from a prefix and a suffix so it never repeats itself.
 */
export const namesPlace = {
	id: "names-place",
	name: "Names: Places",
	description: "Settlements, holds and landmarks. Composed from a prefix and a suffix so it never repeats itself.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	entries: [
		{
			text: "{{pick:Ash|Black|Cold|Dun|Fen|Grim|Hollow|Iron|Long|Mere|Nine|Oak|Rook|Salt|Thorn|White|Wolf|Yew}}{{pick:barrow|bridge|combe|dale|fell|ford|gate|hallow|hollow|march|mere|reach|scar|stead|thorpe|watch|well|wick}}",
		},
	],
} as const satisfies Table;
