import { createHash, randomBytes } from "node:crypto";

export interface Principal {
	readonly id: string;
}

export type CredentialAuthenticationResult =
	| { readonly type: "authenticated"; readonly principal: Principal }
	| { readonly type: "unrecognized" }
	| { readonly type: "rejected" };

export interface IdentityProvider {
	authenticate(credential: string): Promise<CredentialAuthenticationResult>;
}

export interface IssuedLocalCredential {
	/** Non-secret handle for owner-scoped revocation. */
	readonly id: string;
	/** Secret is returned once and is never persisted. */
	readonly credential: string;
}

export interface LocalCredentialRecord {
	readonly id: string;
	readonly digest: string;
	readonly principalId: string;
}

/** Durable adapter; must enforce unique IDs/digests and owner-scoped deletion. */
export interface LocalCredentialRepository {
	insert(record: LocalCredentialRecord): Promise<void>;
	findByDigest(digest: string): Promise<LocalCredentialRecord | null>;
	deleteById(principalId: string, credentialId: string): Promise<boolean>;
}

const localCredentialPrefix = "ptl1_";
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

	async issue(principalId: string): Promise<IssuedLocalCredential> {
		if (!principalId) throw new TypeError("A principal ID is required");
		const id = randomBytes(16).toString("base64url");
		const credential = `${localCredentialPrefix}${randomBytes(32).toString("base64url")}`;
		await this.repository.insert({ id, digest: credentialDigest(credential), principalId });
		return { id, credential };
	}

	async authenticate(credential: string): Promise<CredentialAuthenticationResult> {
		if (!credential.startsWith(localCredentialPrefix)) return { type: "unrecognized" };
		if (!localCredentialPattern.test(credential)) return { type: "rejected" };
		const record = await this.repository.findByDigest(credentialDigest(credential));
		return record
			? { type: "authenticated", principal: { id: record.principalId } }
			: { type: "rejected" };
	}

	async revoke(principalId: string, credentialId: string): Promise<boolean> {
		if (!principalId || !credentialId) return false;
		return this.repository.deleteById(principalId, credentialId);
	}
}

export interface VerifiedFederatedIdentity {
	/** Exact, configured issuer URL returned by a validating provider adapter. */
	readonly issuer: string;
	/** Provider-stable subject. Never use a display name or email as identity. */
	readonly subject: string;
}

export type FederatedVerificationResult =
	| { readonly type: "unrecognized" }
	| { readonly type: "rejected" }
	| { readonly type: "verified"; readonly identity: VerifiedFederatedIdentity };

/** Must verify signature, issuer, audience, expiry, and provider policy before returning claims. */
export interface FederatedTokenVerifier {
	/** Return unrecognized for another provider's token, rejected for invalid credentials, and throw only for operational failures. */
	verify(credential: string): Promise<FederatedVerificationResult>;
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

	async authenticate(credential: string): Promise<CredentialAuthenticationResult> {
		const verification = await this.verifier.verify(credential);
		if (verification.type !== "verified") return verification;
		const { issuer, subject } = verification.identity;
		if (!issuer || !subject) return { type: "rejected" };
		const principalId = await this.directory.findPrincipal(issuer, subject);
		return principalId
			? { type: "authenticated", principal: { id: principalId } }
			: { type: "rejected" };
	}
}

/** Resolves a Bearer header without caching principals or trying other providers after rejection/failure. */
export async function authenticateBearer(
	authorization: string | null | undefined,
	localProvider: LocalCredentialProvider,
	federatedProviders: readonly FederatedIdentityProvider[],
): Promise<Principal> {
	const match = authorization?.match(/^Bearer ([^\s]+)$/i);
	if (!match) throw new UnauthenticatedError();
	const credential = match[1]!;
	if (credential.startsWith(localCredentialPrefix)) {
		const result = await localProvider.authenticate(credential);
		if (result.type === "authenticated") return result.principal;
		throw new UnauthenticatedError();
	}
	for (const provider of federatedProviders) {
		const result = await provider.authenticate(credential);
		if (result.type === "authenticated") return result.principal;
		if (result.type === "rejected") throw new UnauthenticatedError();
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
): Promise<string> {
	const owner = await ownership.findCampaignOwner(campaignId);
	if (owner !== principal.id) throw new ResourceUnavailableError();
	return campaignId;
}

/** Resolves an asset to its owning campaign before any asset bytes are exposed. */
export interface CampaignAssetOwnership extends CampaignOwnership {
	findAssetCampaignId(assetId: string): Promise<string | null>;
}

/**
 * Return the authorized campaign ID. Callers must keep association and ownership reads
 * consistent with the asset read, using the same transaction or immutable association.
 */
export async function requireOwnedCampaignAsset(
	principal: Principal,
	assetId: string,
	ownership: CampaignAssetOwnership,
): Promise<string> {
	const campaignId = await ownership.findAssetCampaignId(assetId);
	if (!campaignId) throw new ResourceUnavailableError();
	return requireOwnedCampaign(principal, campaignId, ownership);
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
