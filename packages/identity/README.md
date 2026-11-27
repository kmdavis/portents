# @portents/identity

Server-side identity and authorization primitives. This package is not a server or a campaign store; the server application must authenticate every request and call the ownership checks before reading, mutating, exporting, or serving campaign-owned assets.

Local credentials are random bearer secrets. Only a SHA-256 digest is persisted; because credentials contain 256 bits of random entropy, a password KDF is unnecessary. Credential lookups are performed on each authentication attempt, so revocation takes effect on the next lookup. The injected credential repository must enforce unique digests and durable deletion.

Hosted OAuth/OIDC integration is an adapter boundary: `FederatedTokenVerifier` must validate signature, issuer, audience, expiry, and relevant authentication policy before returning claims. `ExternalIdentityDirectory` maps the validated `(issuer, subject)` pair to a stable internal principal. This package deliberately does not trust decoded JWT claims or implement provider-specific discovery/JWKS policy.

Campaign ownership is resolved by the server-owned `CampaignOwnership` port. Campaigns not owned by the principal return the same `ResourceUnavailableError` as absent campaigns to avoid an ownership existence oracle. `requireOwnedCampaignAsset` resolves an asset to a campaign and applies that same check before bytes are served. Ownership creation and campaign mutations belong in the server's transactional store; the `Storage` port in core is not sufficient.

`freeEntitlementPolicy` allows requests by default. It is a future policy seam only: no billing, paid feature, or client-controlled entitlement is included.
