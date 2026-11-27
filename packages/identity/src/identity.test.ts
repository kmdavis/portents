import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
		if ([...this.records.values()].some((existing) => existing.id === record.id) || this.records.has(record.digest)) {
			throw new Error("duplicate credential ID or digest");
		}
		this.records.set(record.digest, record);
	}
	async findByDigest(digest: string): Promise<LocalCredentialRecord | null> {
		return this.records.get(digest) ?? null;
	}
	async deleteById(principalId: string, credentialId: string): Promise<boolean> {
		for (const [digest, record] of this.records) {
			if (record.id === credentialId && record.principalId === principalId) return this.records.delete(digest);
		}
		return false;
	}
}

function federatedProvider(
	verify: FederatedTokenVerifier["verify"],
	findPrincipal: ExternalIdentityDirectory["findPrincipal"] = async () => "principal-7",
): FederatedIdentityProvider {
	return new FederatedIdentityProvider({ verify }, { findPrincipal });
}

test("local credentials store SHA-256 digests and revoke independently by owner-scoped ID", async () => {
	const repository = new MemoryCredentialRepository();
	const provider = new LocalCredentialProvider(repository);
	const first = await provider.issue("principal-1");
	const second = await provider.issue("principal-1");
	const digest = (credential: string): string => createHash("sha256").update(credential, "utf8").digest("hex");

	assert.match(first.credential, /^ptl1_[A-Za-z0-9_-]{43}$/);
	assert.notEqual(first.id, second.id);
	assert.notEqual(first.credential, second.credential);
	assert.deepEqual([...repository.records.values()], [
		{ id: first.id, digest: digest(first.credential), principalId: "principal-1" },
		{ id: second.id, digest: digest(second.credential), principalId: "principal-1" },
	]);
	assert.deepEqual(await authenticateBearer(`Bearer ${first.credential}`, provider, []), { id: "principal-1" });
	assert.deepEqual(await authenticateBearer(`Bearer ${second.credential}`, provider, []), { id: "principal-1" });

	assert.equal(await provider.revoke("principal-2", first.id), false);
	assert.equal(await provider.revoke("principal-1", first.id), true);
	await assert.rejects(authenticateBearer(`Bearer ${first.credential}`, provider, []), UnauthenticatedError);
	assert.deepEqual(await authenticateBearer(`Bearer ${second.credential}`, provider, []), { id: "principal-1" });
	assert.equal(await provider.revoke("principal-1", first.id), false);
});

test("missing, malformed, and unknown bearer credentials are unauthenticated", async () => {
	const local = new LocalCredentialProvider(new MemoryCredentialRepository());
	const federated = federatedProvider(async () => ({ type: "unrecognized" }));
	for (const header of [undefined, null, "", "Basic abc", "Bearer two values", "Bearer ptl1_invalid"]) {
		await assert.rejects(authenticateBearer(header, local, [federated]), UnauthenticatedError);
	}
});

test("reserved local credentials never fall through to federated providers", async () => {
	const repository = new MemoryCredentialRepository();
	const local = new LocalCredentialProvider(repository);
	const issued = await local.issue("principal-1");
	let federatedCalls = 0;
	const federated = federatedProvider(async () => {
		federatedCalls++;
		return { type: "verified", identity: { issuer: "https://id.example", subject: "subject" } };
	});

	assert.deepEqual(await authenticateBearer(`Bearer ${issued.credential}`, local, [federated]), { id: "principal-1" });
	await local.revoke("principal-1", issued.id);
	await assert.rejects(authenticateBearer(`Bearer ${issued.credential}`, local, [federated]), UnauthenticatedError);
	await assert.rejects(authenticateBearer("Bearer ptl1_malformed", local, [federated]), UnauthenticatedError);
	assert.equal(federatedCalls, 0);
});

test("campaign and asset ownership deny other principals without exposing existence", async () => {
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
	assert.equal(await requireOwnedCampaign({ id: "alice" }, "campaign-a", ownership), "campaign-a");
	assert.equal(await requireOwnedCampaignAsset({ id: "alice" }, "asset-a", ownership), "campaign-a");
	await assert.rejects(requireOwnedCampaign({ id: "bob" }, "campaign-a", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaign({ id: "bob" }, "missing", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaignAsset({ id: "bob" }, "asset-a", ownership), ResourceUnavailableError);
	await assert.rejects(requireOwnedCampaignAsset({ id: "alice" }, "missing", ownership), ResourceUnavailableError);
});

test("federated identities reject unmapped or empty claims and distinguish issuer namespaces", async () => {
	const verifier = federatedProvider(async (token) => {
		switch (token) {
			case "mapped": return { type: "verified", identity: { issuer: "https://one.example", subject: "same-subject" } };
			case "other-issuer": return { type: "verified", identity: { issuer: "https://two.example", subject: "same-subject" } };
			case "empty-issuer": return { type: "verified", identity: { issuer: "", subject: "same-subject" } };
			case "empty-subject": return { type: "verified", identity: { issuer: "https://one.example", subject: "" } };
			case "bad": return { type: "rejected" };
			default: return { type: "unrecognized" };
		}
	}, async (issuer, subject) => issuer === "https://one.example" && subject === "same-subject" ? "principal-7" : null);
	const local = new LocalCredentialProvider(new MemoryCredentialRepository());

	assert.deepEqual(await authenticateBearer("Bearer mapped", local, [verifier]), { id: "principal-7" });
	for (const token of ["other-issuer", "empty-issuer", "empty-subject", "bad"]) {
		await assert.rejects(authenticateBearer(`Bearer ${token}`, local, [verifier]), UnauthenticatedError);
	}
});

test("only unrecognized federated credentials fall through; rejection and provider errors fail closed", async () => {
	const local = new LocalCredentialProvider(new MemoryCredentialRepository());
	const unknown = federatedProvider(async () => ({ type: "unrecognized" }));
	const mapped = federatedProvider(async () => ({
		type: "verified",
		identity: { issuer: "https://id.example", subject: "subject" },
	}));
	assert.deepEqual(await authenticateBearer("Bearer opaque", local, [unknown, mapped]), { id: "principal-7" });

	let laterProviderCalls = 0;
	const rejected = federatedProvider(async () => ({ type: "rejected" }));
	const later = federatedProvider(async () => {
		laterProviderCalls++;
		return { type: "verified", identity: { issuer: "https://id.example", subject: "subject" } };
	});
	await assert.rejects(authenticateBearer("Bearer rejected", local, [rejected, later]), UnauthenticatedError);
	assert.equal(laterProviderCalls, 0);

	const verifierFailure = federatedProvider(async () => { throw new Error("provider offline"); });
	await assert.rejects(authenticateBearer("Bearer outage", local, [verifierFailure, later]), /provider offline/);
	const directoryFailure = federatedProvider(
		async () => ({ type: "verified", identity: { issuer: "https://id.example", subject: "subject" } }),
		async () => { throw new Error("directory offline"); },
	);
	await assert.rejects(authenticateBearer("Bearer mapped", local, [directoryFailure, later]), /directory offline/);
	assert.equal(laterProviderCalls, 0);
});

test("free entitlement policy allows access without billing state", async () => {
	assert.equal(await freeEntitlementPolicy.allows("principal-1", "campaigns"), true);
});
