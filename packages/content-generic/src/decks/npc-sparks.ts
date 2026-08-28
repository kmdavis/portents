import type { Deck } from "@portents/core";

/**
 * NPC Spark Deck
 *
 * Draw one card to invent an NPC on the spot. Each card gives a role, what they want, and what they are hiding — enough to play them immediately. Add a name with `dnd_table names-common` and a habit with `npc-mannerism`.
 */
export const npcSparks = {
	id: "npc-sparks",
	name: "NPC Spark Deck",
	description: "Draw one card to invent an NPC on the spot. Each card gives a role, what they want, and what they are hiding \u2014 enough to play them immediately. Add a name with `dnd_table names-common` and a habit with `npc-mannerism`.",
	provenance: {
		source: "original writing for Portents",
		license: "CC0-1.0",
	},
	cards: [
		{
			name: "The Tired Official",
			text: "Wants: the paperwork to be somebody else's problem. Hides: they signed something they should not have.",
		},
		{
			name: "The Competent Servant",
			text: "Wants: to be paid what they are worth. Hides: they know every private thing in this house.",
		},
		{
			name: "The Failed Adventurer",
			text: "Wants: to be asked along one more time. Hides: they left someone behind to die.",
		},
		{
			name: "The Local Authority",
			text: "Wants: no trouble on their patch this month. Hides: they are being paid to look away.",
		},
		{
			name: "The Devout",
			text: "Wants: a sign that they were right. Hides: they have stopped believing.",
		},
		{
			name: "The Merchant",
			text: "Wants: the party's custom, and their route information. Hides: the cargo is not what the manifest says.",
		},
		{
			name: "The Grieving",
			text: "Wants: someone blamed. Hides: they think it was their fault.",
		},
		{
			name: "The Child Who Sees Everything",
			text: "Wants: to be believed. Hides: nothing at all, which is the problem.",
		},
		{
			name: "The Rival Professional",
			text: "Wants: the same job the party took. Hides: they would rather split it than lose it.",
		},
		{
			name: "The Innkeeper",
			text: "Wants: the party to eat, drink, and cause no damage. Hides: which of their guests is a spy.",
		},
		{
			name: "The Scholar",
			text: "Wants: access to something the party can reach. Hides: they already know what is down there.",
		},
		{
			name: "The Debtor",
			text: "Wants: thirty more days. Hides: they have no intention of paying.",
		},
		{
			name: "The Veteran",
			text: "Wants: to be left alone. Hides: they recognise the enemy's insignia.",
		},
		{
			name: "The Fixer",
			text: "Wants: a cut, and a favour later. Hides: who they actually work for.",
		},
		{
			name: "The Zealot",
			text: "Wants: converts, or obstacles removed. Hides: how far they will go.",
		},
		{
			name: "The Healer",
			text: "Wants: supplies and quiet. Hides: they treated the party's enemy last week.",
		},
		{
			name: "The Heir",
			text: "Wants: out of the inheritance entirely. Hides: they have already sold part of it.",
		},
		{
			name: "The Guide",
			text: "Wants: to get home before dark. Hides: a shortcut they will not use.",
		},
		{
			name: "The Informer",
			text: "Wants: protection. Hides: they informed on the party already.",
		},
		{
			name: "The Craftsman",
			text: "Wants: their work respected and paid for. Hides: they made the thing the party is hunting.",
		},
		{
			name: "The Drunk with a Memory",
			text: "Wants: another drink and an audience. Hides: they are entirely lucid.",
		},
		{
			name: "The Stranger Who Knows Your Name",
			text: "Wants: to deliver a message. Hides: who sent them, and when.",
		},
	],
} as const satisfies Deck;
