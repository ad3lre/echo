# Security review — 2026-09-24

## Scope and method

Targeted source review of backend outbound HTTP and media imports, activities
service authentication, and selected OAuth, webhook, upload, and web HTML-rendering
boundaries. Used local Fastify injection and synthetic response streams, plus the
repository's security suites and dependency audit. No production traffic, accounts,
or deployment configuration were tested. This is not an exhaustive penetration
test of the monorepo; unreviewed paths and infrastructure remain outside assurance.

## Confirmed findings and fixes

### High: activities internal API authentication bypass

`server/activities/src/http/internalGameRoutes.ts` wrapped the synchronous HMAC
verifier in an async function and evaluated `!verify(...)` without awaiting it.
The Promise was always truthy. All three internal routes (`join`, `action`,
`leave`) therefore accepted unsigned requests with attacker-selected room/user IDs.
An attacker able to reach the activities HTTP listener could impersonate a player,
access game snapshots, or alter game participation/state. External reachability
is deployment-dependent; the configured default listener is loopback.

**Evidence:** local route tests returned HTTP 200 instead of 401 for unsigned
requests on all three endpoints before the fix.

**Fix:** call the synchronous signature verifier directly. Regression tests require
401 and no game-state access for missing, forged, expired, and body-tampered
signatures, and verify that valid signed requests still succeed. Added these tests
to the activities test command.

### High: outbound body resource exhaustion

`chatRemoteImageImport.ts` checked actual size only after `arrayBuffer()` had
buffered the entire remote response. Content-Length could be absent or dishonest.
`linkUnfurlFetch.ts` parsed remote oEmbed JSON without a response size limit.
Both helpers, and the HTML unfurler, cleared their abort timers after headers,
leaving body reads without the intended deadline. A user-provided remote URL
could consume excessive memory or keep work pending through a hostile server;
fediverse oEmbed endpoints can also be hosted on user-selected origins.

**Fix:** stream and count decoded bytes before retaining each chunk; cancel on
limit breach. Image imports use their existing byte budget; JSON is capped at
512 KiB. Fetch deadlines now remain active during response consumption (8 seconds
for previews, 30 seconds for image imports). HTML body failures return the existing
unfurl failure result. Redirect response bodies are cancelled before following.

**Evidence:** regression tests cover missing/dishonest Content-Length, cancellation,
exact-limit acceptance, oversized JSON, and a body that stalls after headers and
is interrupted by the deadline. The oversized tests use synthetic chunks rather
than attempting to exhaust process memory.

### High: realtime disclosure of restricted paper and ticket data

The server-targeted workspace event dispatcher checked server membership only.
Paper document bodies, paper comments, and ticket subjects/author IDs were therefore
sent to unrelated members, including members denied access to the paper channel or
ticket. Durable outbox replay used the same unrestricted delivery path and could
also disclose an older paper body after its visibility became private.

**Evidence:** tests against the actual publisher, with isolated permission/database
adapters and two simulated member sockets, observed both authorized and denied
recipients receiving confidential event payloads before the fix.

**Fix:** a domain recipient policy now checks current membership and the relevant
read authorization on every server-targeted delivery, including replay. Paper
updates require channel access and current paper visibility. Ticket updates require
the current ticket record and author-or-handler access. Deleted tickets and
removed/banned members are excluded. Ordinary server invalidations still reach
members. Regression tests cover immediate delivery, replay, privacy changes,
removed members, deleted tickets, and authorized handlers.

### High: ticket details exposed through alternate HTTP lookup

`GET /servers/:serverId/ticket-by-channel/:channelId` checked membership but not
whether the requester was the ticket author or a handler. Knowing a ticket channel
ID allowed an unrelated member to retrieve the ticket record. The lookup by ticket
ID did check author/handler access but did not require current membership.

**Evidence:** a local Fastify request from an unrelated simulated member returned
HTTP 200 with confidential ticket data before the fix; the regression expected 403.

**Fix:** both ticket lookup endpoints and realtime ticket delivery share a domain
read policy requiring current membership plus author-or-handler access. Route tests
verify denial for unrelated and former members, success for current authors and
handlers, and rejection of cross-server lookups.

### High: presigned S3 uploads could replace verified objects

The S3 presigner authorized unconditional PUTs to the same storage key for 15
minutes. After uploading and registering an object, a client could reuse that URL
to replace its bytes without going through registration again. Length binding
alone does not prevent replacement with different bytes of the same length. This
breaks the assumption that stored bytes still match the content/integrity checks
performed during registration. Local streamed uploads already use exclusive file
creation (`wx`).

**Fix:** presigned client PUTs now include `If-None-Match: *` and return the header
to clients. The real AWS signing regression verifies that `if-none-match` appears
in `X-Amz-SignedHeaders`, so the client cannot remove the condition. The test uses
synthetic credentials and makes no storage requests. Both web and Apple upload
clients already forward the returned headers. Atomic object-store enforcement is
specified by [AWS conditional-write documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

**Rollout:** bucket CORS must allow `If-None-Match` as well as `Content-Type`; custom
S3-compatible stores must honor conditional PUTs. Existing keys cannot be replaced
through this upload flow; choose a fresh object key. Previously issued URLs retain
their old permissions until they expire (15-minute issuance TTL). Live S3/R2
operation and deployed CORS were not tested or changed.

### Medium: legacy bearer fallback bypassed session and token scope

With `AUTH_LEGACY_BEARER` enabled, a validly signed native-session token whose
server session had been revoked could fall through to stateless legacy auth.
HTTP and socket paths accepted it without its session restriction. The socket
legacy fallback also accepted room-scoped game JWTs when their signing secret was
the same as the access-token secret. Production configuration already forbids
legacy mode; this finding affects configurations where it is enabled.

**Evidence:** isolated tests using real signed JWTs and the actual HTTP middleware
and socket resolver authenticated a revoked native token before the fix.

**Fix:** both legacy paths use a dedicated verifier rejecting session/type and
game-room claims. Tests verify HTTP 401 and unauthenticated socket identity for
revoked native tokens and game tokens, acceptance of an active native session,
and preservation of genuine legacy tokens in the supported legacy path.

## Additional hardening

The shared `ssrfSafeFetch` now always selects the protected connection agent and
manual redirects, regardless of caller options. Previously these protections
were optional; Discord CDN imports omitted the protected agent despite their
DNS-pinning contract. The agent validates and connects to the same resolved public
IP, closing the second-resolution gap. Tests verify forced transport settings
and rejection of loopback URLs. No practical compromise of a Discord-controlled
hostname was demonstrated; this is recorded as hardening, not a confirmed exploit.

## Validation and operational status

- New authentication, S3 signing, outbound-fetch, ticket-route, and realtime regression tests pass.
- Backend security suite, authentication integration suite, link-unfurl suite, and activities suite pass.
- Backend build and activities typecheck pass.
- Dependency audit: zero reported advisories across 1,733 dependency entries.
- Changes are local; services must be deployed/restarted to receive the fixes.

Dependency results are a point-in-time registry result, not proof that dependencies
or application code have no vulnerabilities. Database-backed integration tests,
live DNS-rebinding attacks, and production network exposure were not exercised.
