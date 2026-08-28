import type { Table } from "@portents/core";

/**
 * Weather
 *
 * Weighted toward the unremarkable, because weather that always matters stops mattering.
 */
export const weather = {
	id: "weather",
	name: "Weather",
	description: "Weighted toward the unremarkable, because weather that always matters stops mattering.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	entries: [
		{
			weight: 6,
			text: "Clear and cold, good visibility",
		},
		{
			weight: 6,
			text: "Overcast, still, flat grey light",
		},
		{
			weight: 4,
			text: "Persistent drizzle; everything is damp by evening",
		},
		{
			weight: 3,
			text: "Wind hard enough to make listening useless",
		},
		{
			weight: 3,
			text: "Fog until midday, visibility a stone's throw",
		},
		{
			weight: 2,
			text: "Heavy rain; low ground floods, tracks wash out",
		},
		{
			weight: 2,
			text: "Unseasonable heat, water sources unreliable",
		},
		{
			weight: 2,
			text: "Frost overnight; anything left out is ruined",
		},
		{
			weight: 1,
			text: "Thunderstorm arriving within the hour",
		},
		{
			weight: 1,
			text: "Snow, settling, and it will not stop today",
		},
		{
			weight: 1,
			text: "Still, warm, and wrong \u2014 no birds, no insects",
		},
	],
} as const satisfies Table;
