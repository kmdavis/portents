import {
	ActorNotFoundError,
	EntityNotFoundError,
	StorageUnavailableError,
	appendToSection,
	formatResourceList,
	moveActor,
	parseTile,
	setSection,
	stringifySheet,
	type Campaign,
	type MapView,
} from "@portents/core";
import {
	ProtocolValidationError,
	PROTOCOL_VERSION,
	parseCommandRequest,
	type CommandResult,
	type LedgerReference,
} from "./protocol.ts";
import type { WebSession } from "./session.ts";

export interface CampaignIdentityMap {
	/** Convert a public campaign ID to this local session's storage slug. */
	readonly toSlug: (campaignId: string) => string;
	/** Convert a local storage slug to the public identity returned by list/create. */
	readonly toId: (campaignSlug: string) => string;
}

export interface ExecuteCommandOptions {
	readonly campaignIdentity?: CampaignIdentityMap;
}

const text = (value: string): CommandResult => ({ type: "text", text: value });

function fail(error: unknown): never {
	if (error instanceof ProtocolValidationError) throw error;
	if (error instanceof EntityNotFoundError || error instanceof ActorNotFoundError) {
		throw new ProtocolValidationError("Requested resource was not found", "NOT_FOUND", {
			entity: error.entity,
			identifier: error.identifier,
		});
	}
	if (error instanceof StorageUnavailableError) {
		throw new ProtocolValidationError("Storage operation failed", "STORAGE_FAILURE", {
			...(error.details.operation ? { operation: error.details.operation } : {}),
		});
	}
	throw new ProtocolValidationError("Unexpected command failure", "INTERNAL_ERROR");
}

/** Validate and execute one versioned command against the local session facade. */
export async function executeCommand(
	session: WebSession,
	input: unknown,
	options: ExecuteCommandOptions = {},
): Promise<CommandResult> {
	const request = parseCommandRequest(input);
	if (request.version !== PROTOCOL_VERSION) {
		throw new ProtocolValidationError("Unsupported protocol version", "UNSUPPORTED_VERSION");
	}
	const command = request.command;
	const resolveSlug = options.campaignIdentity?.toSlug ?? ((id: string) => id);
	const resolveId = options.campaignIdentity?.toId ?? ((slug: string) => slug);
	const getCampaign = async (id: string): Promise<Campaign> => {
		const slug = resolveSlug(id);
		if (!slug) throw new ProtocolValidationError("Campaign ID does not resolve", "NOT_FOUND");
		const campaign = session.campaign?.slug === slug
			? session.campaign
			: await session.loadCampaign(slug);
		if (campaign.slug !== slug) throw new ProtocolValidationError("Campaign ID does not resolve", "NOT_FOUND");
		return campaign;
	};
	const campaignIdFor = (slug: string): string => {
		const id = resolveId(slug);
		if (!id) throw new ProtocolValidationError("Campaign identity mapping returned an empty ID", "INTERNAL_ERROR");
		return id;
	};

	try {
		switch (command.type) {
			case "campaign.open":
			case "campaign.load": {
				const slug = resolveSlug(command.campaignId);
				if (!slug) throw new ProtocolValidationError("Campaign ID does not resolve", "NOT_FOUND");
				const campaign = await session.openCampaign(slug);
				return text(`${campaign.name} (${campaign.systemLine})`);
			}
			case "campaign.close": {
				const campaign = await getCampaign(command.campaignId);
				if (session.campaign?.slug === campaign.slug) session.closeCampaign();
				return { type: "empty" };
			}
			case "campaign.brief":
				return text(await (await getCampaign(command.campaignId)).brief());
			case "campaign.list":
				return {
					type: "campaigns",
					campaigns: (await session.listCampaigns()).map((campaign) => ({
						id: campaignIdFor(campaign.slug),
						name: campaign.name,
						system: campaign.systemLine,
					})),
				};
			case "campaign.create": {
				const campaign = await session.createCampaign(command.name, command.system, {
					premise: command.premise,
					tone: command.tone,
					safety: command.safety,
					settingId: command.settingId,
				});
				return {
					type: "campaigns",
					campaigns: [{ id: campaignIdFor(campaign.slug), name: campaign.name, system: campaign.systemLine }],
				};
			}
			case "campaign.journal":
				await (await getCampaign(command.campaignId)).journal(command.heading, command.body);
				return { type: "empty" };
			case "campaign.scene":
				await (await getCampaign(command.campaignId)).setScene({
					summary: command.summary,
					...(command.location === undefined ? {} : { location: command.location }),
					...(command.time === undefined ? {} : { time: command.time }),
					...(command.tension === undefined ? {} : { tension: command.tension }),
				});
				return { type: "empty" };
			case "campaign.world": {
				const campaign = await getCampaign(command.campaignId);
				if (command.body === undefined) {
					return text(command.section ? await campaign.worldSection(command.section) : await campaign.readWorld());
				}
				if (!command.section) throw new ProtocolValidationError("World updates require a section");
				await campaign.addToWorld(command.section, command.body);
				return { type: "empty" };
			}
			case "campaign.setting":
				await (await getCampaign(command.campaignId)).setSetting(command.setting);
				return { type: "empty" };
			case "campaign.system":
				await (await getCampaign(command.campaignId)).setSystem(command.system);
				return { type: "empty" };
			case "campaign.clock": {
				const clock = await (await getCampaign(command.campaignId)).setClock(command.name, command.filled ?? 0, command.segments);
				return { type: "clock", name: clock.name, filled: clock.filled, segments: clock.segments };
			}
			case "dice.roll": {
				const campaign = command.campaignId === undefined ? undefined : await getCampaign(command.campaignId);
				const outcome = await session.roll(command.expression, {
					dc: command.dc,
					reason: command.reason,
					record: campaign !== undefined,
					...(campaign ? { campaign } : {}),
				});
				const ledger: LedgerReference[] = outcome.ids.map((id) => ({ id, kind: "roll" }));
				return { type: "roll", lines: outcome.lines, totals: outcome.totals, ledger };
			}
			case "dice.odds":
				return text(session.odds(command.expression, command.dc));
			case "deck.list":
				return { type: "catalog", ids: session.deckIds() };
			case "table.list":
				return { type: "catalog", ids: session.tableIds() };
			case "deck.draw": {
				const campaign = command.campaignId === undefined ? undefined : await getCampaign(command.campaignId);
				const outcome = await session.drawOutcome(command.deckId, command.count, {
					record: campaign !== undefined,
					...(campaign ? { campaign } : {}),
				});
				return {
					type: "text",
					text: outcome.cards.join("\n"),
					...(outcome.ledger ? { ledger: [outcome.ledger] } : {}),
				};
			}
			case "table.roll": {
				const campaign = command.campaignId === undefined ? undefined : await getCampaign(command.campaignId);
				const outcome = await session.rollTableOutcome(command.tableId, {
					record: campaign !== undefined,
					...(campaign ? { campaign } : {}),
				});
				return { type: "text", text: outcome.text, ...(outcome.ledger ? { ledger: [outcome.ledger] } : {}) };
			}
			case "oracle.answer": {
				const campaign = command.campaignId === undefined ? undefined : await getCampaign(command.campaignId);
				const outcome = await session.oracleOutcome(command.kind, command.question, command.likelihood, {
					record: campaign !== undefined,
					...(campaign ? { campaign } : {}),
				});
				return { type: "text", text: outcome.text, ...(outcome.ledger ? { ledger: [outcome.ledger] } : {}) };
			}
			case "map.generate":
				return { type: "map", ...session.map({ rooms: command.rooms, seed: command.seed }) };
			case "map.moveActor": {
				const tile = parseTile(command.tile);
				const explored = new Set(command.explored ?? []);
				if ([...explored].some((index) => index >= tile.width * tile.height)) {
					throw new ProtocolValidationError("Explored cell index is outside the map");
				}
				const view: MapView = {
					map: tile,
					actors: command.actors,
					explored,
					visible: new Set(),
					sightRadius: command.sightRadius,
				};
				const moved = moveActor(view, command.actorId, { x: command.x, y: command.y });
				return {
					type: "map-view",
					tile: command.tile,
					actors: moved.actors,
					explored: [...moved.explored].sort((a, b) => a - b),
					visible: [...moved.visible].sort((a, b) => a - b),
					...(moved.sightRadius === undefined ? {} : { sightRadius: moved.sightRadius }),
				};
			}
			case "guidance.get":
				return text(session.guidance(command.topic));
			case "ledger.verify":
				return text((await getCampaign(command.campaignId)).ledger.describe(command.id));
			case "sheet.list": {
				const names = await (await getCampaign(command.campaignId)).listCharacters();
				return text(names.length ? `Characters: ${names.join(", ")}` : "No characters yet.");
			}
			case "sheet.create": {
				const campaign = await getCampaign(command.campaignId);
				const sheet = await campaign.createCharacter({
					name: command.character,
					...(command.concept === undefined ? {} : { concept: command.concept }),
					...(command.status === undefined ? {} : { status: command.status }),
					...(command.abilities === undefined ? {} : { abilities: command.abilities }),
				}, command.main === undefined ? {} : { active: command.main });
				return text(stringifySheet(sheet));
			}
			case "sheet.setMain":
				await (await getCampaign(command.campaignId)).setActiveCharacter(command.character);
				return { type: "empty" };
			case "sheet.read": {
				const campaign = await getCampaign(command.campaignId);
				const name = command.character ?? campaign.activeCharacter;
				if (!name) return text("No active character.");
				const sheet = await campaign.readCharacter(name);
				return text(sheet ? stringifySheet(sheet) : `No sheet on disk for ${name}.`);
			}
			case "sheet.patchStatus": {
				const campaign = await getCampaign(command.campaignId);
				const name = command.character ?? campaign.activeCharacter;
				if (!name) throw new ProtocolValidationError("Patching status needs a character");
				return text(stringifySheet(await campaign.patchCharacter(name, command.status)));
			}
			case "sheet.setSection":
			case "sheet.appendSection": {
				const campaign = await getCampaign(command.campaignId);
				const name = command.character ?? campaign.activeCharacter;
				if (!name) throw new ProtocolValidationError("Updating a sheet needs a character");
				const sheet = await campaign.requireCharacter(name);
				const next = command.type === "sheet.setSection"
					? setSection(sheet, command.section, command.body)
					: appendToSection(sheet, command.section, command.body);
				await campaign.writeCharacter(next);
				return { type: "empty" };
			}
			case "recall": {
				const campaign = await getCampaign(command.campaignId);
				if (command.id !== undefined) {
					return text(await campaign.requireRecallById(command.id));
				}
				const records = await campaign.queryResources({
					text: command.query,
					kind: command.kind,
					limit: command.limit,
					audience: "gm",
				});
				return text(formatResourceList(records));
			}
			case "remember": {
				const written = await (await getCampaign(command.campaignId)).rememberResource(command.resource);
				return { type: "remembered", id: written.resource.id, name: written.resource.name, path: written.path };
			}
		}
	} catch (error) {
		fail(error);
	}
}
