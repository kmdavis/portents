import { createHash, randomBytes } from "node:crypto";

export interface Principal {
	readonly id: string;
}

export interface IdentityProvider {
	authenticate(credential: string): Promise<Principal | null>;
}

export interface LocalCredentialRecord {
	readonly digest: string;
	readonly principalId: string;
}

/** The server's durable credential adapter; credential material is never stored. */
export interface LocalCredentialRepository {
	insert(record: LocalCredentialRecord): Promise<void>;
	findByDigest(digest: string): Promise<LocalCredentialRecord | null>;
	deleteByDigest(digest: string): Promise<boolean>;
}

const localCredentialPattern = /^ptl1_[A-Za-z0-9_-]{43}$/;
function credentialDigest(credential: string): string {
	return createHash("sha256").update(credential, "utf8").digest("hex");
}

/** Random, revocable local bearer credentials backed by the server's durable store. */
export class LocalCredentialProvider implements IdentityProvider {
	private readonly repository: LocalCredentialRepository;
	constructor(repository: LocalCredentialRepository) {
		this.repository = repository;
	}

	async issue(principalId: string): Promise<string> {
		if (!principalId) throw new TypeError("A principal ID is required");
		const credential = `ptl1_${randomBytes(32).toString("base64url")}`;
		await this.repository.insert({ digest: credentialDigest(credential), principalId });
		return credential;
	}

	async authenticate(credential: string): Promise<Principal | null> {
		if (!localCredentialPattern.test(credential)) return null;
		const record = await this.repository.findByDigest(credentialDigest(credential));
		return record ? { id: record.principalId } : null;
	}

	async revoke(credential: string): Promise<boolean> {
		if (!localCredentialPattern.test(credential)) return false;
		return this.repository.deleteByDigest(credentialDigest(credential));
	}
}

export interface VerifiedFederatedIdentity {
	/** Exact, configured issuer URL returned by a validating provider adapter. */
	readonly issuer: string;
	/** Provider-stable subject. Never use a display name or email as identity. */
	readonly subject: string;
}

/** Must verify signature, issuer, audience, expiry, and provider policy before returning claims. */
export interface FederatedTokenVerifier {
	verify(credential: string): Promise<VerifiedFederatedIdentity | null>;
}

/** Maps verified provider identities to stable, server-owned principals. */
export interface ExternalIdentityDirectory {
	findPrincipal(issuer: string, subject: string): Promise<string | null>;
}

export class FederatedIdentityProvider implements IdentityProvider {
	private readonly verifier: FederatedTokenVerifier;
	private readonly directory: ExternalIdentityDirectory;
	constructor(verifier: FederatedTokenVerifier, directory: ExternalIdentityDirectory) {
		this.verifier = verifier;
		this.directory = directory;
	}

	async authenticate(credential: string): Promise<Principal | null> {
		const identity = await this.verifier.verify(credential);
		if (!identity || !identity.issuer || !identity.subject) return null;
		const principalId = await this.directory.findPrincipal(identity.issuer, identity.subject);
		return principalId ? { id: principalId } : null;
	}
}

/** Resolves a Bearer header against configured adapters without caching principals. */
export async function authenticateBearer(
	authorization: string | null | undefined,
	providers: readonly IdentityProvider[],
): Promise<Principal> {
	const match = authorization?.match(/^Bearer ([^\s]+)$/i);
	if (!match) throw new UnauthenticatedError();
	for (const provider of providers) {
		const principal = await provider.authenticate(match[1]!);
		if (principal) return principal;
	}
	throw new UnauthenticatedError();
}

export class UnauthenticatedError extends Error {
	readonly code = "UNAUTHENTICATED" as const;
	constructor() {
		super("Authentication is required");
		this.name = "UnauthenticatedError";
	}
}

/** Campaign IDs are server-assigned opaque identifiers, not storage keys or caller-supplied owners. */
export interface CampaignOwnership {
	listOwnedCampaignIds(principalId: string): Promise<readonly string[]>;
	findCampaignOwner(campaignId: string): Promise<string | null>;
}

export class ResourceUnavailableError extends Error {
	readonly code = "NOT_FOUND" as const;
	constructor() {
		super("The requested resource is unavailable");
		this.name = "ResourceUnavailableError";
	}
}

export async function listOwnedCampaignIds(
	principal: Principal,
	ownership: CampaignOwnership,
): Promise<readonly string[]> {
	return ownership.listOwnedCampaignIds(principal.id);
}

/** Use the same outcome for absent and foreign-owned campaigns. */
export async function requireOwnedCampaign(
	principal: Principal,
	campaignId: string,
	ownership: CampaignOwnership,
): Promise<void> {
	const owner = await ownership.findCampaignOwner(campaignId);
	if (owner !== principal.id) throw new ResourceUnavailableError();
}

/** Resolves an asset to its owning campaign before any asset bytes are exposed. */
export interface CampaignAssetOwnership extends CampaignOwnership {
	findAssetCampaignId(assetId: string): Promise<string | null>;
}

/** Resolve and authorize an asset through its campaign before serving its bytes. */
export async function requireOwnedCampaignAsset(
	principal: Principal,
	assetId: string,
	ownership: CampaignAssetOwnership,
): Promise<void> {
	const campaignId = await ownership.findAssetCampaignId(assetId);
	if (!campaignId) throw new ResourceUnavailableError();
	await requireOwnedCampaign(principal, campaignId, ownership);
}

export interface EntitlementPolicy {
	allows(principalId: string, entitlement: string): Promise<boolean>;
}

/** All users retain full free access; deployments may inject a future policy. */
export const freeEntitlementPolicy: EntitlementPolicy = Object.freeze({
	async allows(_principalId: string, _entitlement: string): Promise<boolean> {
		return true;
	},
});
