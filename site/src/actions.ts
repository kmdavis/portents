/**
 * Campaign and sheet actions, composed from the engine.
 *
 * These live in the demo rather than on `WebSession` on purpose. They are
 * *tool-shaped*: one function with an `action` string that dispatches, which is
 * convenient for a model and wrong for a library. `WebSession` keeps one method per
 * operation; this file flattens them for the tool layer.
 *
 * Everything returns a string, because that is what goes back to the model.
 */

import {
	appendToSection,
	formatResourceList,
	guidanceTitle,
	setSection,
	stringifySheet,
	WORLD_SECTIONS,
	type RememberResourceInput,
	type WorldSection,
} from "@portents/core";
import type { WebSession } from "@portents/web";

/** Require a value the model should have supplied, with the message it needs to see. */
function need<T>(value: T | undefined, what: string): T {
	if (value === undefined || value === null || value === "") throw new Error(what);
	return value;
}

export interface CampaignParams {
	action: string;
	name?: string;
	system?: string;
	premise?: string;
	tone?: string;
	safety?: string;
	setting?: string;
	heading?: string;
	body?: string;
	summary?: string;
	location?: string;
	time?: string;
	tension?: string;
	section?: string;
	clock_name?: string;
	filled?: number;
	segments?: number;
}

export async function campaignAction(session: WebSession, params: CampaignParams): Promise<string> {
	switch (params.action) {
		case "list": {
			const saved = await session.listCampaigns();
			// Title first, then the exact system line to pass to "create". Offering only
			// the alias made a model announce the game as "5e" and tell the player that
			// was what this installation called it.
			const systems = session.registry
				.guidanceIds()
				.map((id) => {
					const entry = session.registry.guidanceFor(id);
					if (!entry) return id;
					return `${guidanceTitle(entry)} — pass \`system: "${entry.aliases[0]}"\``;
				})
				.sort();
			const lines = saved.length
				? ["Campaigns:", ...saved.map((entry) => `- \`${entry.slug}\` — ${entry.name} (${entry.systemLine ?? entry.system})`)]
				: ["No campaigns saved in this browser yet."];
			const settings = session.registry.settingIds().map((id) => session.registry.requireSetting(id));
			return [
				...lines,
				"",
				"Systems available:",
				...systems.map((line) => `- ${line}`),
				"",
				"Settings available:",
				...(settings.length > 0
					? settings.map((setting) => `- **${setting.name}** — pass \`setting: "${setting.id}"\`: ${setting.summary}`)
					: ["- No predefined settings loaded; homebrew is available."]),
				"",
				"Where a system has more than one printing the newer one is the default. Use the title when",
				"you speak to the player, not the short code.",
			].join("\n");
		}

		case "create": {
			const campaign = await session.createCampaign(
				need(params.name, "Creating a campaign needs a name"),
				need(params.system, 'Creating a campaign needs a system, e.g. "5e (2024)"'),
				{ premise: params.premise, tone: params.tone, safety: params.safety, settingId: params.setting },
			);
			return `Created **${campaign.name}** (\`${campaign.slug}\`), ${campaign.systemLine}. Build a character with portents_sheet before play starts.`;
		}

		case "open":
		case "load": {
			const campaign = await session.openCampaign(need(params.name, "Opening a campaign needs its slug"));
			return await campaign.brief();
		}

		case "brief":
			return await requireCampaign(session).brief();

		case "journal": {
			const campaign = requireCampaign(session);
			await campaign.journal(need(params.heading, "A journal entry needs a heading"), params.body ?? "");
			return `Journalled **${params.heading}**.`;
		}

		case "scene": {
			const campaign = requireCampaign(session);
			// summary is required by Scene, so an empty one is a caller error rather than
			// something to paper over with a placeholder.
			await campaign.setScene({
				summary: need(params.summary, "A scene needs a summary"),
				...(params.location ? { location: params.location } : {}),
				...(params.time ? { time: params.time } : {}),
				...(params.tension ? { tension: params.tension } : {}),
			});
			return `Scene recorded: ${[params.summary, params.location].filter(Boolean).join(" · ")}`;
		}

		case "world": {
			const campaign = requireCampaign(session);
			if (!params.body) {
				if (!params.section) return await campaign.readWorld();
				if (!WORLD_SECTIONS.includes(params.section as WorldSection)) {
					throw new Error(`A world section must be one of: ${WORLD_SECTIONS.join(", ")}`);
				}
				return await campaign.worldSection(params.section as WorldSection);
			}
			if (!params.section) throw new Error(`A world note needs a section: ${WORLD_SECTIONS.join(", ")}`);
			await campaign.addToWorld(params.section as WorldSection, params.body);
			return `Added to **${params.section}**.`;
		}

		case "setting": {
			const campaign = requireCampaign(session);
			await campaign.setSetting(params.setting);
			return params.setting ? `Setting recorded: ${params.setting}` : "Predefined setting cleared.";
		}

		case "system": {
			const campaign = requireCampaign(session);
			await campaign.setSystem(need(params.system, 'Recording the system needs a value, e.g. "5e (2024)"'));
			return `System recorded: ${campaign.systemLine}`;
		}

		case "clock": {
			const campaign = requireCampaign(session);
			const clock = await campaign.setClock(
				need(params.clock_name, "A clock needs a name"),
				params.filled ?? 0,
				params.segments,
			);
			return `Clock **${clock.name}** at ${clock.filled}/${clock.segments}.`;
		}

		default:
			return `Unknown campaign action ${JSON.stringify(params.action)}.`;
	}
}

export interface SheetParams {
	action: string;
	character?: string;
	/** Promote or refuse to promote this character. Omit to let the engine decide. */
	main?: boolean;
	concept?: string;
	section?: string;
	body?: string;
	status?: Record<string, string>;
	abilities?: Record<string, string>;
}

export async function sheetAction(session: WebSession, params: SheetParams): Promise<string> {
	const campaign = requireCampaign(session);

	switch (params.action) {
		case "list": {
			const names = await campaign.listCharacters();
			return names.length ? `Characters: ${names.join(", ")}` : "No characters yet.";
		}

		case "create": {
			if (!params.character) throw new Error("Creating a sheet needs a character name");
			const sheet = await campaign.createCharacter(
				{
					name: params.character,
					...(params.concept ? { concept: params.concept } : {}),
					...(params.status ? { status: params.status } : {}),
					...(params.abilities ? { abilities: params.abilities } : {}),
				},
				// Only an explicit `main: true` promotes. Passing `active: true`
				// unconditionally -- which this did -- made every sidekick the main
				// character the moment it was created, defeating the engine default that
				// exists to prevent exactly that.
				params.main === undefined ? {} : { active: params.main },
			);
			const role = campaign.activeCharacter === params.character ? "main character" : "sidekick";
			return `Created **${params.character}** as the ${role}.\n\n${stringifySheet(sheet)}`;
		}

		case "set_main": {
			if (!params.character) throw new Error("Setting the main character needs a name");
			await campaign.setActiveCharacter(params.character);
			return `**${params.character}** is now the main character.`;
		}

		case "read": {
			const name = params.character ?? campaign.activeCharacter;
			if (!name) return "No active character.";
			const sheet = await campaign.readCharacter(name);
			return sheet ? stringifySheet(sheet) : `No sheet on disk for ${name}.`;
		}

		case "patch_status": {
			const name = params.character ?? campaign.activeCharacter;
			if (!name) throw new Error("Patching a sheet needs a character");
			if (!params.status) throw new Error("Patching a status needs status keys");
			const sheet = await campaign.patchCharacter(name, params.status);
			return `Patched **${name}**.\n\n${stringifySheet(sheet)}`;
		}

		case "set_section":
		case "append_section": {
			const name = params.character ?? campaign.activeCharacter;
			if (!name) throw new Error("Updating a sheet needs a character");
			const heading = need(params.section, "Updating a sheet needs a section");
			if (params.body === undefined) throw new Error("Updating a sheet needs a body");
			const body = params.body;
			const sheet = await campaign.readCharacter(name);
			if (!sheet) throw new Error(`No character ${JSON.stringify(name)} in this campaign`);
			const next = params.action === "set_section" ? setSection(sheet, heading, body) : appendToSection(sheet, heading, body);
			await campaign.writeCharacter(next);
			return `Updated **${heading}** on ${name}'s sheet.`;
		}

		default:
			return `Unknown sheet action ${JSON.stringify(params.action)}.`;
	}
}

export interface RecallParams {
	readonly id?: string;
	readonly query?: string;
	readonly kind?: string;
	readonly limit?: number;
}

export async function recallAction(session: WebSession, params: RecallParams): Promise<string> {
	const campaign = requireCampaign(session);
	if (params.id) {
		return (await campaign.recallById(params.id)) ?? `No resource or setting map with id ${JSON.stringify(params.id)}.`;
	}
	const records = await campaign.queryResources({
		text: params.query,
		kind: params.kind,
		limit: params.limit,
		audience: "gm",
	});
	return formatResourceList(records);
}

export type RememberParams = RememberResourceInput;

export async function rememberAction(session: WebSession, params: RememberParams): Promise<string> {
	const written = await requireCampaign(session).rememberResource(params);
	return `Remembered **${written.resource.name}** as \`${written.resource.id}\` in \`${written.path}\`.`;
}

function requireCampaign(session: WebSession) {
	const campaign = session.campaign;
	if (!campaign) {
		throw new Error(
			'No campaign is open. Use portents_campaign { action: "list" } to see saved games, then "open" or "create" one.',
		);
	}
	return campaign;
}
