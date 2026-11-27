# @portents/identity

Server-side identity and authorization primitives. This package is not a server or a campaign store; the server application must authenticate every request and call the ownership checks before reading, mutating, exporting, or serving campaign-owned assets.

Local bearer credentials use a reserved `ptl1_` namespace. The secret is returned once; the server persists only its SHA-256 digest and a separate non-secret credential ID. Authentication looks up each credential on every request. Revocation takes an authenticated principal ID and credential ID, so an owner can revoke a lost device without possessing its token; the durable repository must enforce owner-scoped deletion.

Hosted OAuth/OIDC integration is an adapter boundary: `FederatedTokenVerifier` must validate signature, issuer, audience, expiry, and relevant authentication policy before returning claims. It returns `unrecognized` only for another provider's token, `rejected` for invalid credentials, and throws operational failures; only unrecognized credentials may fall through to another verifier. `ExternalIdentityDirectory` maps the validated `(issuer, subject)` pair to a stable internal principal. This package deliberately does not trust decoded JWT claims or implement provider-specific discovery/JWKS policy.

Campaign ownership is resolved by the server-owned `CampaignOwnership` port. Campaigns not owned by the principal return the same `ResourceUnavailableError` as absent campaigns to avoid an ownership existence oracle. `requireOwnedCampaignAsset` returns the authorized campaign ID, but that ID alone is not a capability: the asset association, ownership check, and byte retrieval must share a transaction or immutable consistent association. Ownership creation and campaign mutations belong in the server's transactional store; the `Storage` port in core is not sufficient.

`freeEntitlementPolicy` allows requests by default. It is a future policy seam only: no billing, paid feature, or client-controlled entitlement is included.
