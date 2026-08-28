import type { Table } from "@portent/core";

/**
 * Names: Human / Common
 *
 * Given name plus a byname. Fine for humans, halflings and most townsfolk.
 */
export const namesCommon = {
	id: "names-common",
	name: "Names: Human / Common",
	description: "Given name plus a byname. Fine for humans, halflings and most townsfolk.",
	provenance: {
		source: "original writing for Portent",
		license: "CC0",
	},
	entries: [
		{
			text: "Alric {{table:names-bynames}}",
		},
		{
			text: "Bettany {{table:names-bynames}}",
		},
		{
			text: "Cassian {{table:names-bynames}}",
		},
		{
			text: "Doreth {{table:names-bynames}}",
		},
		{
			text: "Edda {{table:names-bynames}}",
		},
		{
			text: "Fenwick {{table:names-bynames}}",
		},
		{
			text: "Gwen {{table:names-bynames}}",
		},
		{
			text: "Hollis {{table:names-bynames}}",
		},
		{
			text: "Ilse {{table:names-bynames}}",
		},
		{
			text: "Jorem {{table:names-bynames}}",
		},
		{
			text: "Kettil {{table:names-bynames}}",
		},
		{
			text: "Lisbet {{table:names-bynames}}",
		},
		{
			text: "Maddox {{table:names-bynames}}",
		},
		{
			text: "Nesta {{table:names-bynames}}",
		},
		{
			text: "Oswin {{table:names-bynames}}",
		},
		{
			text: "Perrin {{table:names-bynames}}",
		},
		{
			text: "Quill {{table:names-bynames}}",
		},
		{
			text: "Rowan {{table:names-bynames}}",
		},
		{
			text: "Sable {{table:names-bynames}}",
		},
		{
			text: "Tamsin {{table:names-bynames}}",
		},
		{
			text: "Ulric {{table:names-bynames}}",
		},
		{
			text: "Vesna {{table:names-bynames}}",
		},
		{
			text: "Wend {{table:names-bynames}}",
		},
		{
			text: "Yarrow {{table:names-bynames}}",
		},
	],
} as const satisfies Table;
