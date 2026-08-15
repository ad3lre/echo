# Production security checklist (Echo)

**Audience:** Operators and engineers deploying Echo to a network-accessible environment.

## Environment and process

1. **`NODE_ENV=production`** — Required for safe defaults. Non-production keeps dev-oriented behavior (for example reflecting `CORS_ORIGIN`, optional metrics auth, and the local Discord bot webhook default string when the secret env is unset).
2. **`ECHO_BACKEND_STORAGE=postgres`** and **`DATABASE_URL`** — Required in production (the server enforces this).
3. **`JWT_SECRET`** — Strong random secret; never use the dev default (the server refuses `dev-insecure-secret` in production).
4. **`REDIS_URL`** — **Required in production by default** (shared server-side sessions). The server refuses to start without it unless you explicitly set **`ECHO_REQUIRE_REDIS_IN_PRODUCTION=false`** for a deliberate single-process deployment.
5. **`AUTH_LEGACY_BEARER`** — Must be **`false`** (or unset) in production. Legacy Bearer JWT bypasses refresh revocation semantics; the server refuses to start if this is enabled in production.
6. **`ECHO_DISCORD_BOT_WEBHOOK_SECRET`** — Set a unique secret for `POST /api/v1/hooks/discord-bot/*`. Do not use the local dev default string in production (the server rejects it).

## Observability endpoints

7. **`/api/v1/metrics`** — **`ECHO_METRICS_SCRAPE_TOKEN` is required in production**; scrapers must send `Authorization: Bearer <token>`. Still prefer restricting the route at the reverse proxy or network policy.
8. **`/api/v1/health`** — With **`ECHO_HEALTH_REDACT=true`** (default in production), returns only `{ status, timestamp }`. Set **`ECHO_HEALTH_REDACT=false`** for operator diagnostics (`db`, `nats`, `backendStorageMode`, `useMockDb`).

## Abuse-prone public routes

9. **Giphy proxy** (`/api/v1/giphy/*`) — Per-IP rate limit (20 requests / minute / IP by default). Keep **`GIPHY_API_KEY`** server-side only.
10. **Public invite preview** (`GET /api/v1/echo/invites/:code/preview`) — Rate limited (60 requests / minute / IP by default); avoid using it as a bulk enumeration API.

## Instance-level abuse (operators)

11. **First operator** — Promote at least one account after deploy: `UPDATE auth_users SET is_instance_operator = true WHERE id = '<user-id>';` Instance bans apply across the deployment (auth, register, guest mint, sockets), not just one server. Prefer **user + device (HWID)** bans over raw IP when NAT is likely; use **`expiresAtMinutes`** or allowlist rows for false positives.
12. **`ECHO_INSTANCE_BANS_ENABLED`** — Set to `false` only on deliberately private single-tenant instances. Device dimension requires **`ECHO_AUTH_HWID_PEPPER`** (same as HWID account cap).
13. **Server bans vs instance bans** — Guild moderators use `/servers/:serverId/moderation` (`BAN_MEMBERS`). Instance operators use `/api/v1/echo/instance/bans` for platform-wide blocks.

## Message and branding media URLs (production)

14. **At least one of** **`ECHO_MEDIA_URL_REQUIRE_HTTPS=true`** **or** non-empty **`ECHO_MEDIA_URL_ALLOWED_HOSTS`** — Required in production (the server enforces this). `ECHO_MEDIA_URL_ALLOWED_HOSTS` is a comma-separated hostname list (lowercase); when set, only those hosts (and their subdomains) are allowed for HTTP(S) media URLs when policy checks run.

## Video HLS worker

15. **`ECHO_VIDEO_HLS_WORKER=standalone`** — Required in production by default so ffmpeg does not share the API event loop. Run `npm run worker:video-hls` (or PM2 `echo-video-hls-worker`). Set **`ECHO_ALLOW_EMBEDDED_VIDEO_HLS=true`** only for deliberate single-process smoke stacks.
16. **`BCRYPT_SALT_ROUNDS`** — Default is **12**. Keep ≥12 in production; existing password hashes are not rehashed until the next password change.
17. **CSAM image scan** — When **`ECHO_CSAM_IMAGE_SCAN_MODE=on`**, scanner errors **fail closed** by default (`ECHO_CSAM_FAIL_CLOSED` defaults true in that mode). Set **`ECHO_CSAM_FAIL_CLOSED=false`** only if you accept fail-open on scanner outages.

## Reverse proxy

18. Terminate TLS at the edge. Set **`ECHO_TRUST_PROXY=true`** only when Echo is behind a trusted reverse proxy that strips spoofed **`X-Forwarded-*`** headers; otherwise leave it unset/false.
19. If TLS is terminated at the proxy, set **`ENFORCE_HTTPS=true`** and forward the canonical proto header through that trusted proxy path.
20. **`CORS_ORIGIN`** — **Required in production**: explicit origin(s), comma-separated if needed; never `*` or empty (the server enforces this for credentialed auth and Socket.IO).

## Related docs

- CSP/HSTS on the HTML document (Caddy / Cloudflare): [http-observatory-headers.md](./http-observatory-headers.md)
- Socket auth and cookies: [runbooks/jwt-socket-auth.md](runbooks/jwt-socket-auth.md)
- Session architecture: [../auth/OPTION_A_SESSION_ARCHITECTURE.md](../auth/OPTION_A_SESSION_ARCHITECTURE.md)
