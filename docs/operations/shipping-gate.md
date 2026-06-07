# Shipping gate (public testing)

This document summarizes **release-blocking** risks and how the codebase enforces them.

## Production boot failures (misconfiguration is refused)

With `NODE_ENV=production`, the server exits on dangerous or incomplete public-facing configuration (see `backend/src/config.ts` after the `config` object). Enforced examples:

- Postgres storage and `DATABASE_URL` required; in-memory backend is rejected.
- `JWT_SECRET` must not remain the dev default.
- `AUTH_LEGACY_BEARER` must not be enabled.
- `ECHO_DISCORD_BOT_WEBHOOK_SECRET` must not equal the built-in local dev string.
- **`CORS_ORIGIN`** must be set to an explicit origin list (never empty, never `*`).
- **`ECHO_METRICS_SCRAPE_TOKEN`** must be set so `/api/v1/metrics` is not anonymously readable.
- **Media URL policy:** `ECHO_MEDIA_URL_REQUIRE_HTTPS=true` and/or non-empty **`ECHO_MEDIA_URL_ALLOWED_HOSTS`** (constrains HTTP(S) media URLs in messages and branding).
- **`REDIS_URL`** is required unless **`ECHO_REQUIRE_REDIS_IN_PRODUCTION=false`** (defaults to requiring Redis in production for shared sessions).
- LiveKit: if enabled, `LIVEKIT_PUBLIC_URL` must not use `ws://` (browsers need `wss://` on the public internet).
- `VOICE_SIDECAR_ENABLED` must not be on in production (explicitly blocked).
- **`ECHO_SMTP_HOST`** must be set so transactional mail works (signup DOI, support).
- **`ECHO_MARKETING_PUBLIC_URL`** origin must appear in **`CORS_ORIGIN`** (browser POST from app-echo.net).

Automated coverage: `backend/src/tests/productionConfigGates.test.ts`.

## Operator responsibilities (not all are expressible as code)

- **TLS:** Terminate TLS at the edge and align `ENFORCE_HTTPS` / forwarded headers with your proxy (see `docs/operations/PRODUCTION_SECURITY_CHECKLIST.md`).
- **Load / voice:** Validate concurrent rooms, TURN, and webhook-driven DB load before calling voice “stable” at scale.

## Items reviewed — not identified as code-level show-stoppers

- **LiveKit webhook** (`backend/src/api/routes/livekitWebhook.ts`): signature verification before DB writes.
- **Voice join / LiveKit session REST** (`backend/src/api/routes/echo/echoVoice.ts`): `requireAuth` and membership checks.
- **Dev diagnostics ingest** (`backend/src/api/routes/devDiagnostics.ts`): returns 403 in production.
- **Double-submit CSRF** on mutating `/api/v1` routes (`backend/src/auth/csrf.ts`) with documented exemptions.

## Doc drift note

`docs/operations/PRODUCTION_SECURITY_CHECKLIST.md` historically mentioned `ALLOW_MOCK_API` and `/api/v1/mock/*`. Verify against the running tree if you still rely on that text.

## CodeQL (release branch scans)

Static analysis runs on `release/**` via `.github/workflows/codeql.yml` with `.github/codeql/codeql-config.yml` excluding tests, dev seed scripts, and the internal bot package.

Many **missing rate limiting** findings are false positives: production uses `@fastify/rate-limit` globally (`httpPlugins.ts`), on the Echo API scope (`api/routes/index.ts`), and on sensitive routes (auth, OAuth, uploads, voice, MLS). CodeQL does not model the Fastify plugin. `.github/codeql/codeql-config.yml` excludes `js/missing-rate-limiting` on `echoMls.ts` for this reason.

**Insufficient password hash** (`js/insufficient-password-hash`) on `backend/src/auth/oauthCookieIntegrity.ts` is a false positive: that module HMAC-signs short-lived OAuth state cookies (Google, YouTube, Discord link/login flows), not user passwords. Passwords are hashed with **bcrypt** in `backend/src/auth/store/helpers.ts`. The MAC key is scrypt-derived from `JWT_SECRET` for domain separation (same pattern as `totpCrypto.ts` / `discordTokenCrypto.ts`). All federated OAuth cookie/state signing should go through that helper so CodeQL and reviewers see one place.

Link unfurl **SSRF** alerts are mitigated by `canSafelyResolveUrlForOutboundFetch`, manual redirect validation, and `safeFetchAgent` connect-time DNS checks (`backend/src/services/linkUnfurl/`).

**DOM text reinterpreted as HTML** (`js/xss-through-dom`) on `frontend/src/utils/captureVideoFrame.ts` is a false positive: the probe only assigns `blob:` object URLs from `URL.createObjectURL` on caller-supplied video blobs to a detached `<video>` for metadata/frame decode. `blobUrlForVideoElement` rejects non-`blob:` values; CodeQL still models `video.src` as an XSS sink, so `.github/codeql/codeql-config.yml` excludes that path.

## Related references

- `docs/operations/PRODUCTION_SECURITY_CHECKLIST.md` — broader operator checklist.
- `backend/src/tests/shippingSecurity.test.ts` — metrics auth behavior, rate limits, and media URL validation examples.
