import assert from "node:assert/strict";
import { test } from "node:test";
import {
	authenticateBearer,
	FederatedIdentityProvider,
	freeEntitlementPolicy,
	listOwnedCampaignIds,
	LocalCredentialProvider,
	ResourceUnavailableError,
	requireOwnedCampaign,
	requireOwnedCampaignAsset,
	UnauthenticatedError,
	type CampaignAssetOwnership,
	type ExternalIdentityDirectory,
	type FederatedTokenVerifier,
	type LocalCredentialRecord,
	type LocalCredentialRepository,
} from "./index.ts";

class MemoryCredentialRepository implements LocalCredentialRepository {
	readonly records = new Map<string, LocalCredentialRecord>();
	async insert(record: LocalCredentialRecord): Promise<void> {
		if (this.records.has(record.digest)) throw new Error("duplicate credential digest");
		this.records.set(record.digest, record);
	}
	async findByDigest(digest: string): Promise<LocalCredentialRecord | null> {
		return this.records.get(digest) ?? null;
	}
	async deleteByDigest(digest: string): Promise<boolean> {
		return this.records.delete(digest);
	}
}

test("local credentials authenticate their principal and stop working after revocation", async () => {
	const repository = new MemoryCredentialRepository();
	const provider = new LocalCredentialProvider(repository);
	const credential = await provider.issue("principal-1");

	assert.match(credential, /^ptl1_[A-Za-z0-9_-]{43}$/);
	assert.equal([...repository.records.values()].some((record) => record.digest === credential), false);
	assert.deepEqual(await authenticateBearer(`Bearer ${credential}`, [provider]), { id: "principal-1" });
	assert.equal(await provider.revoke(credential), true);
	await assert.rejects(authenticateBearer(`Bearer ${credential}`, [provider]), UnauthenticatedError);
	assert.equal(await provider.revoke(credential), false);
});

test("missing, malformed, and unknown bearer credentials are unauthenticated", async () => {
	const provider = new LocalCredentialProvider(new MemoryCredentialRepository());
	for (const header of [undefined, null, "", "Basic abc", "Bearer two values", "Bearer ptl1_invalid"]) {
		await assert.rejects(authenticateBearer(header, [provider]), UnauthenticatedError);
	}
});

test("campaign and asset ownership deny another principal without exposing existence", async () => {
	const campaignOwners = new Map([["campaign-a", "alice"], ["campaign-b", "bob"]]);
	const assetCampaigns = new Map([["asset-a", "campaign-a"], ["asset-b", "campaign-b"]]);
	const ownership: CampaignAssetOwnership = {
		async listOwnedCampaignIds(principalId) {
			return [...campaignOwners].filter(([, owner]) => owner === principalId).map(([id]) => id);
		},
		async findCampaignOwner(campaignId) {
			return campaignOwners.get(campaignId) ?? null;
		},
		async findAssetCampaignId(assetId) {
			return assetCampaigns.get(assetId) ?? null;
		},
	};
	assert.deepEqual(await listOwnedCampaignIds({ id: "alice" }, ownership), ["campaign-a"]);
	await requireOwnedCampaign({ id: "alice" }, "campaign-a", ownership);
	await requireOwnedCampaignAsset({ id: "alice" }, "asset-a", ownership);
	await assert.rejects(requireOwnedCampaign({ id: "bob" }, "campaign-a", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaign({ id: "bob" }, "missing", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaignAsset({ id: "bob" }, "asset-a", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaignAsset({ id: "alice" }, "missing", ownership), ResourceUnavailableError);
});

test("federated credentials require verified provider identity and an existing principal mapping", async () => {
	const verified: FederatedTokenVerifier = {
		async verify(token) {
			return token === "verified" ? { issuer: "https://identity.example", subject: "subject-7" } : null;
		},
	};
	const directory: ExternalIdentityDirectory = {
		async findPrincipal(issuer, subject) {
			return issuer === "https://identity.example" && subject === "subject-7" ? "principal-7" : null;
		},
	};
	const provider = new FederatedIdentityProvider(verified, directory);
	assert.deepEqual(await provider.authenticate("verified"), { id: "principal-7" });
	assert.equal(await provider.authenticate("unverified"), null);
});

test("free entitlement policy allows access without billing state", async () => {
	assert.equal(await freeEntitlementPolicy.allows("principal-1", "campaigns"), true);
});
