# Echo Threat Model (Baseline)

This is a baseline threat model intended to make trust boundaries and security invariants explicit. It is scoped to the repo as shipped and should be updated whenever a new externally reachable surface is added.

## Trust Boundaries

- Public internet → reverse proxy (TLS termination, header normalization)
- Reverse proxy → Echo backend (Fastify)
- Browser / desktop client → Echo backend (cookie sessions + CSRF)
- Echo backend → Postgres (data store, authorization must already be decided)
- Echo backend → Redis (server sessions; availability affects auth continuity)
- Echo backend → NATS (internal messaging; treat as untrusted unless authenticated/encrypted)
- Echo backend → third-party outbound HTTP (link unfurl, OAuth, webhooks)
- Echo backend ↔ Socket.IO clients (realtime fanout; room membership is authorization-sensitive)
- Echo backend ↔ LiveKit / voice infra (token issuance and room joins are authorization-sensitive)

## Primary Assets

- Account identity and session integrity (cookie sessions, refresh tokens)
- Tenant isolation (workspace/server membership, roles, channels, DMs)
- Message confidentiality and integrity (read state, DM activity, attention updates)
- Secrets (JWT secret, refresh/session signing keys, bot webhook secrets, OAuth client secrets, encryption keys)
- Outbound fetch integrity (SSRF protections on unfurl and media URL policies)

## Security Invariants

- Server-side authorization is the source of truth; clients must not be able to join or subscribe to internal realtime fanout rooms without explicit permission checks.
- Cookie session identifiers and guest binding cookies must be unforgeable and validated server-side.
- Password reset / email verification links must be built from configured public URLs, not from request headers.
- Outbound HTTP fetches that touch untrusted URLs must prevent access to loopback, private networks, and link-local targets across DNS resolution and redirects.
- Production must refuse insecure defaults for externally reachable endpoints (CORS, metrics auth, webhook secrets, media URL policy).

## High-Risk Entry Points (External)

### Auth: Login, Refresh, Logout, Guest

- Routes: `/api/v1/auth/*`
- Threats:
  - session fixation / cookie confusion
  - refresh token replay
  - login CSRF / browser continuity bypass in OAuth callbacks
- Existing controls:
  - server-side sessions bound to refresh token ids
  - CSRF double-submit for mutating requests
  - production config gates for unsafe secrets and origins
- Regression references:
  - tracked patches: [patched-security-issues.md](./patched-security-issues.md)

### Realtime: Socket.IO handshake and room joins

- Surface: `/socket.io`, room join handlers
- Threats:
  - unauthorized subscription to user- or server-scoped fanout rooms
  - websocket auth desync vs REST state
- Existing controls:
  - cookie-based handshake authentication
  - centralized server permission helpers for RBAC: [echoPolicy.ts](../../../server/backend/src/domain/echoPolicy.ts)
- Regression references:
  - room join bypass patch: [patched-security-issues.md](./patched-security-issues.md#L7-L22)

### Outbound fetch: Link unfurl

- Surface: message link processing / unfurl fetch pipeline
- Threats:
  - SSRF via DNS rebinding or redirect chains
- Existing controls:
  - DNS resolution checks + per-hop redirect validation (see patch record): [patched-security-issues.md](./patched-security-issues.md#L38-L53)

### Media URL policy

- Surface: message embeds / branding media URLs (user-supplied URLs)
- Threats:
  - SSRF-like effects via server-side fetchers
  - mixed content / downgrade risks
- Existing controls:
  - production requires HTTPS policy or allowlisted hosts: [PRODUCTION_SECURITY_CHECKLIST.md](../../operations/PRODUCTION_SECURITY_CHECKLIST.md#message-and-branding-media-urls-production)

### Operational endpoints: `/metrics`, `/health`, dev diagnostics

- Threats:
  - internal data exposure
  - debug ingestion exposure
- Existing controls:
  - production metrics scrape token recommended/required: [PRODUCTION_SECURITY_CHECKLIST.md](../../operations/PRODUCTION_SECURITY_CHECKLIST.md#observability-endpoints)
  - dev diagnostics disabled in production: [devDiagnostics.ts](../../../server/backend/src/api/routes/devDiagnostics.ts)

## Assumptions and Non-Goals

- Edge hardening (request smuggling, cache poisoning) is expected to be provided by the deployment reverse proxy/CDN configuration.
- Multi-service authentication (mTLS, NATS auth) is deployment-dependent and must be explicitly configured before relying on it as a trust boundary.
