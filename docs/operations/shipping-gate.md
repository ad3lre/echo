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

## Related references

- `docs/operations/PRODUCTION_SECURITY_CHECKLIST.md` — broader operator checklist.
- `backend/src/tests/shippingSecurity.test.ts` — metrics auth behavior, rate limits, and media URL validation examples.
