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

## Message and branding media URLs (production)

11. **At least one of** **`ECHO_MEDIA_URL_REQUIRE_HTTPS=true`** **or** non-empty **`ECHO_MEDIA_URL_ALLOWED_HOSTS`** — Required in production (the server enforces this). `ECHO_MEDIA_URL_ALLOWED_HOSTS` is a comma-separated hostname list (lowercase); when set, only those hosts (and their subdomains) are allowed for HTTP(S) media URLs when policy checks run.

## Reverse proxy

12. Terminate TLS at the edge. Set **`ECHO_TRUST_PROXY=true`** only when Echo is behind a trusted reverse proxy that strips spoofed **`X-Forwarded-*`** headers; otherwise leave it unset/false.
13. If TLS is terminated at the proxy, set **`ENFORCE_HTTPS=true`** and forward the canonical proto header through that trusted proxy path.
14. **`CORS_ORIGIN`** — **Required in production**: explicit origin(s), comma-separated if needed; never `*` or empty (the server enforces this for credentialed auth and Socket.IO).

## Related docs

- CSP/HSTS on the HTML document (Caddy / Cloudflare): [http-observatory-headers.md](./http-observatory-headers.md)
- Socket auth and cookies: [runbooks/jwt-socket-auth.md](runbooks/jwt-socket-auth.md)
- Session architecture: [../auth/OPTION_A_SESSION_ARCHITECTURE.md](../auth/OPTION_A_SESSION_ARCHITECTURE.md)
