# Mutating HTTP surface matrix (`/api/v1` and related)

This document summarizes **who can call what** for **POST / PUT / PATCH / DELETE** (and CSRF-exempt auth-style GETs where relevant). It is derived from route registration in [`backend/src/api/routes/index.ts`](../../backend/src/api/routes/index.ts), the Echo split in [`backend/src/api/routes/echo.ts`](../../backend/src/api/routes/echo.ts), CSRF rules in [`backend/src/auth/csrf.ts`](../../backend/src/auth/csrf.ts), and global HTTP plugins in [`backend/src/bootstrap/httpPlugins.ts`](../../backend/src/bootstrap/httpPlugins.ts).

## Legend

| Column        | Meaning                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**      | Primary caller identity expected by the handler                                                                                                                                                                                                             |
| **CSRF**      | Browser `POST`/`PUT`/`PATCH`/`DELETE` under `/api/v1`: `yes` = double-submit required unless path is exempt; `exempt` = listed in `csrf.ts`                                                                                                                 |
| **Global RL** | [`httpPlugins.ts`](../../backend/src/bootstrap/httpPlugins.ts): **150/min** per `uid:<jwtSub>` or `ip:<req.ip>`, skipped when request matches “Echo read” allow-list ([`echoReadRateLimitPaths.ts`](../../backend/src/bootstrap/echoReadRateLimitPaths.ts)) |
| **Scoped RL** | Additional plugin-specific limiters where registered                                                                                                                                                                                                        |

`req.ip` effectiveness depends on `trustProxy` and edge configuration.

---

## CSRF exemptions (mutating paths only)

Exact paths (from [`csrf.ts`](../../backend/src/auth/csrf.ts)):

| Path                                  | Rationale                                  |
| ------------------------------------- | ------------------------------------------ |
| `/api/v1/auth/login`                  | No session / CSRF cookie yet               |
| `/api/v1/auth/register`               | No session yet                             |
| `/api/v1/auth/guest`                  | No session yet                             |
| `/api/v1/auth/refresh`                | Cookie refresh bootstrap                   |
| `/api/v1/auth/login/mfa`              | MFA step                                   |
| `/api/v1/auth/forgot-password`        | Unauthenticated recovery                   |
| `/api/v1/auth/reset-password`         | Token-based reset                          |
| `/api/v1/auth/discord/login/start`    | OAuth start from login modal               |
| `/api/v1/auth/google/login/start`     | OAuth start from login modal               |
| `/api/v1/auth/desktop/redeem-handoff` | Desktop one-time code                      |
| `/api/v1/founder/login`               | Founder HttpOnly cookie flow               |
| `/api/v1/founder/logout`              | Founder cookie clear                       |
| `/api/v1/echo/support/contact`        | Public support form (honeypot + scoped RL) |
| `/api/v1/hooks/livekit`               | Webhook secret (not browser CSRF)          |
| `/api/v1/dev/diagnostics/ingest`      | Dev diagnostics                            |
| `/api/v1/echo/uploads/local/put`      | Signed upload token flow                   |

Prefixes:

| Prefix                                | Rationale                   |
| ------------------------------------- | --------------------------- |
| `/api/v1/auth/passkey/`               | WebAuthn ceremony           |
| `/api/v1/hooks/discord-bot/`          | `x-echo-discord-bot-secret` |
| `/api/v1/hooks/discord-bridge/`       | Bridge secret               |
| `/api/v1/hooks/discord-voice-mirror/` | Mirror secret               |

All other **`/api/v1` mutating** routes require matching `X-CSRF-Token` and `echo_csrf` cookie (and session-bound secret when session cookie present).

---

## Top-level route families (prefix `/api/v1`)

| Plugin (file)                                                                                | Typical mutating routes                    | Auth                                | CSRF                                                              | Global RL                                                    | Scoped RL                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `health`                                                                                     | Usually GET-only                           | n/a                                 | n/a                                                               | allow-list reads                                             | —                                                          |
| `systemDeployCountdown`                                                                      | POST (ops)                                 | env-gated                           | non-exempt unless path exempt                                     | yes                                                          | —                                                          |
| `giphy`                                                                                      | GET-only proxy                             | n/a                                 | n/a                                                               | yes                                                          | **20/min per IP** (plugin)                                 |
| `serperImageSearch`                                                                          | GET-only                                   | **session** (`requireAuth`)         | n/a (GET)                                                         | yes                                                          | **10/min per IP** + plan/global/upstream budgets           |
| `auth/*`                                                                                     | login, register, guest, OAuth, sessions, … | varies                              | many **exempt** (see table)                                       | yes                                                          | per-route (e.g. guest abuse limiter in `guest.ts`)         |
| `passkeyRoutes`                                                                              | WebAuthn                                   | varies                              | `/auth/passkey/*` prefix exempt                                   | yes                                                          | —                                                          |
| `discordOAuth` / `googleOAuth`                                                               | OAuth callbacks / link                     | varies                              | mixed                                                             | yes                                                          | —                                                          |
| `meDiscord` / `meGoogle`                                                                     | `/me/*` federation                         | session / bearer                    | non-exempt                                                        | yes                                                          | —                                                          |
| `discordBotHook*` / `discordBridgeHook*` / `discordVoiceMirrorHook*` / `discordPresenceHook` | POST webhooks                              | shared secrets                      | prefix exempt                                                     | yes                                                          | per-plugin                                                 |
| `livekitWebhook`                                                                             | POST `/hooks/livekit`                      | webhook auth                        | **exempt**                                                        | yes                                                          | —                                                          |
| `analytics`                                                                                  | POST `/analytics/events`                   | none (optional JWT for attribution) | non-exempt (body-only; browser should still send CSRF if cookies) | yes                                                          | **120/min** `analytics:uid:*` or `analytics:ip:*` (plugin) |
| `devDiagnostics`                                                                             | POST `/dev/diagnostics/ingest`             | dev-only gates in handler           | **exempt** exact in csrf                                          | yes                                                          | —                                                          |
| `founder`                                                                                    | `/founder/*`                               | founder cookie / login              | login/logout exempt                                               | yes                                                          | —                                                          |
| `agentNetworkDiagnostics`                                                                    | `/agent/*`                                 | Bearer + env                        | non-exempt                                                        | yes                                                          | —                                                          |
| `echo` (see below)                                                                           | `/echo/*`                                  | **secured subtree: session**        | non-exempt for mutations                                          | Echo GETs allow-listed; **500/min** on subtree for non-reads | per-route (e.g. uploads, support)                          |

Discord bot HTTP (`/discord/v10`) and gateway WebSocket are **outside** `/api/v1`; they use **Bot token** / gateway auth, not browser CSRF.

---

## Echo domain (`/api/v1/echo`)

From [`echo.ts`](../../backend/src/api/routes/echo.ts):

1. **`echoPublic`** is registered **without** `requireAuth`. It exposes **GET** directory/marketing-style endpoints and **POST `/support/contact`** (scoped rate limit + honeypot). **Mutations elsewhere under `/echo` are not in this plugin.**

2. **Secured subtree**: all other Echo feature plugins run under `secured.addHook('preHandler', requireAuth)`. Any **POST/PUT/PATCH/DELETE** there expects a **valid browser session** (or compatible auth) and **CSRF** unless the path is globally exempt (none of the standard Echo REST paths are in the CSRF exempt list).

Guest write guard and other hooks apply inside this subtree per feature modules.

---

## Client / SPA notes

- **Founder API** types and URLs live in [`frontend/src/api/founderClient.ts`](../../frontend/src/api/founderClient.ts), which is only imported from lazily loaded [`frontend/src/views/FounderDashboardView.vue`](../../frontend/src/views/FounderDashboardView.vue) (see [`frontend/src/App.vue`](../../frontend/src/App.vue)).
- **Vite production** builds set `sourcemap: false` explicitly; CI fails if `frontend/dist/**/*.map` appears ([`.github/workflows/echo-frontend-ci.yml`](../../.github/workflows/echo-frontend-ci.yml)).

---

## Maintenance

When adding a **new mutating** route:

1. Decide **CSRF**: if browser-callable without prior session cookie, add a **narrow** exemption in [`csrf.ts`](../../backend/src/auth/csrf.ts) with a comment.
2. Decide **auth**: prefer `requireAuth` (or explicit secret/Bearer) over “obscure URL”.
3. Decide **rate limits**: global bucket may be enough; high-abuse or unauthenticated endpoints should register a **scoped** `@fastify/rate-limit` like [`analytics.ts`](../../backend/src/api/routes/analytics.ts) or [`giphy.ts`](../../backend/src/api/routes/giphy.ts).
4. Update this matrix in the same PR when behavior is security-relevant.
