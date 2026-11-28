/**
 * Presentation adapters for site tools.
 *
 * Gameplay dispatch and campaign/sheet mutations live in the shared typed
 * command layer. This module maps the browser tool's legacy action shape and
 * response text to that protocol.
 */

import { guidanceTitle, WORLD_SECTIONS, type RememberResourceInput, type WorldSection } from "@portents/core";
import { executeCommand, PROTOCOL_VERSION, ProtocolValidationError } from "@portents/web";
import type { Command, CommandResult, WebSession } from "@portents/web";

async function dispatch(session: WebSession, command: Command): Promise<CommandResult> {
	return executeCommand(session, { version: PROTOCOL_VERSION, command });
}

function commandText(result: CommandResult): string {
	if (result.type !== "text") throw new Error(`Expected text command result, received ${result.type}`);
	return result.text;
}

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
			const listed = await dispatch(session, { type: "campaign.list" });
			const saved = listed.type === "campaigns"
				? listed.campaigns.map((entry) => ({ slug: entry.id, name: entry.name, systemLine: entry.system }))
				: [];
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
				? ["Campaigns:", ...saved.map((entry) => `- \`${entry.slug}\` — ${entry.name} (${entry.systemLine ?? ""})`)]
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
			const result = await dispatch(session, {
				type: "campaign.create",
				name: need(params.name, "Creating a campaign needs a name"),
				system: need(params.system, 'Creating a campaign needs a system, e.g. "5e (2024)"'),
				...(params.premise === undefined ? {} : { premise: params.premise }),
				...(params.tone === undefined ? {} : { tone: params.tone }),
				...(params.safety === undefined ? {} : { safety: params.safety }),
				...(params.setting === undefined ? {} : { settingId: params.setting }),
			});
			if (result.type !== "campaigns" || !session.campaign) throw new Error("Campaign creation returned no campaign");
			return `Created **${session.campaign.name}** (\`${session.campaign.slug}\`), ${session.campaign.systemLine}. Build a character with portents_sheet before play starts.`;
		}
		case "open":
		case "load": {
			await dispatch(session, { type: "campaign.open", campaignId: need(params.name, "Opening a campaign needs its slug") });
			return commandText(await dispatch(session, { type: "campaign.brief", campaignId: need(session.campaign?.slug, "No campaign is open") }));
		}
		case "brief":
			return commandText(await dispatch(session, { type: "campaign.brief", campaignId: requireCampaign(session).slug }));
		case "journal": {
			const heading = need(params.heading, "A journal entry needs a heading");
			await dispatch(session, { type: "campaign.journal", campaignId: requireCampaign(session).slug, heading, body: params.body ?? "" });
			return `Journalled **${heading}**.`;
		}
		case "scene": {
			const summary = need(params.summary, "A scene needs a summary");
			await dispatch(session, {
				type: "campaign.scene",
				campaignId: requireCampaign(session).slug,
				summary,
				...(params.location ? { location: params.location } : {}),
				...(params.time ? { time: params.time } : {}),
				...(params.tension ? { tension: params.tension } : {}),
			});
			return `Scene recorded: ${[summary, params.location].filter(Boolean).join(" · ")}`;
		}
		case "world": {
			const campaignId = requireCampaign(session).slug;
			const section = params.section;
			if (section !== undefined && !WORLD_SECTIONS.includes(section as WorldSection)) {
				throw new Error(`A world section must be one of: ${WORLD_SECTIONS.join(", ")}`);
			}
			const worldSection = section as WorldSection | undefined;
			if (!params.body) {
				return commandText(await dispatch(session, {
					type: "campaign.world",
					campaignId,
					...(worldSection ? { section: worldSection } : {}),
				}));
			}
			if (!worldSection) throw new Error(`A world note needs a section: ${WORLD_SECTIONS.join(", ")}`);
			await dispatch(session, { type: "campaign.world", campaignId, section: worldSection, body: params.body });
			return `Added to **${worldSection}**.`;
		}
		case "setting":
			await dispatch(session, {
				type: "campaign.setting",
				campaignId: requireCampaign(session).slug,
				...(params.setting === undefined ? {} : { setting: params.setting }),
			});
			return params.setting ? `Setting recorded: ${params.setting}` : "Predefined setting cleared.";
		case "system": {
			await dispatch(session, {
				type: "campaign.system",
				campaignId: requireCampaign(session).slug,
				system: need(params.system, 'Recording the system needs a value, e.g. "5e (2024)"'),
			});
			return `System recorded: ${session.campaign!.systemLine}`;
		}
		case "clock": {
			const result = await dispatch(session, {
				type: "campaign.clock",
				campaignId: requireCampaign(session).slug,
				name: need(params.clock_name, "A clock needs a name"),
				filled: params.filled ?? 0,
				...(params.segments === undefined ? {} : { segments: params.segments }),
			});
			if (result.type !== "clock") throw new Error("Clock command returned an unexpected result");
			return `Clock **${result.name}** at ${result.filled}/${result.segments}.`;
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
	const campaignId = campaign.slug;

	switch (params.action) {
		case "list":
			return commandText(await dispatch(session, { type: "sheet.list", campaignId }));
		case "create": {
			const name = need(params.character, "Creating a sheet needs a character name");
			const result = await dispatch(session, {
				type: "sheet.create",
				campaignId,
				character: name,
				...(params.main === undefined ? {} : { main: params.main }),
				...(params.concept === undefined ? {} : { concept: params.concept }),
				...(params.status === undefined ? {} : { status: params.status }),
				...(params.abilities === undefined ? {} : { abilities: params.abilities }),
			});
			const role = campaign.activeCharacter === name ? "main character" : "sidekick";
			return `Created **${name}** as the ${role}.\n\n${commandText(result)}`;
		}
		case "set_main": {
			const name = need(params.character, "Setting the main character needs a name");
			await dispatch(session, { type: "sheet.setMain", campaignId, character: name });
			return `**${name}** is now the main character.`;
		}
		case "read": {
			const result = await dispatch(session, {
				type: "sheet.read",
				campaignId,
				...(params.character === undefined ? {} : { character: params.character }),
			});
			return commandText(result);
		}
		case "patch_status": {
			const name = params.character ?? campaign.activeCharacter;
			if (!name) throw new Error("Patching a sheet needs a character");
			if (!params.status) throw new Error("Patching a status needs status keys");
			const result = await dispatch(session, { type: "sheet.patchStatus", campaignId, character: name, status: params.status });
			return `Patched **${name}**.\n\n${commandText(result)}`;
		}
		case "set_section":
		case "append_section": {
			const name = params.character ?? campaign.activeCharacter;
			if (!name) throw new Error("Updating a sheet needs a character");
			const result = await dispatch(session, {
				type: params.action === "set_section" ? "sheet.setSection" : "sheet.appendSection",
				campaignId,
				character: name,
				section: need(params.section, "Updating a sheet needs a section"),
				body: need(params.body, "Updating a sheet needs a body"),
			});
			if (result.type !== "empty") throw new Error("Sheet update returned an unexpected result");
			return `Updated **${params.section}** on ${name}'s sheet.`;
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
	try {
		return commandText(await dispatch(session, {
			type: "recall",
			campaignId: campaign.slug,
			...(params.id === undefined ? {} : { id: params.id }),
			...(params.query === undefined ? {} : { query: params.query }),
			...(params.kind === undefined ? {} : { kind: params.kind }),
			...(params.limit === undefined ? {} : { limit: params.limit }),
		}));
	} catch (error) {
		if (params.id !== undefined && error instanceof ProtocolValidationError &&
			error.code === "NOT_FOUND" && error.details?.entity === "resource" && error.details?.identifier === params.id) {
			return `No resource or setting map with id ${JSON.stringify(params.id)}.`;
		}
		throw error;
	}
}

export type RememberParams = RememberResourceInput;

export async function rememberAction(session: WebSession, params: RememberParams): Promise<string> {
	const result = await dispatch(session, { type: "remember", campaignId: requireCampaign(session).slug, resource: params });
	if (result.type !== "remembered") throw new Error("Remember command returned an unexpected result");
	return `Remembered **${result.name}** as \`${result.id}\` in \`${result.path}\`.`;
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
