# Discord user OAuth (account linking)

Echo can link a signed-in **Echo user** to a **Discord user** via OAuth2, using the **same Discord application** as the export bot under [`bot/`](/bot/). The bot uses a **bot token** and privileged intents for guild export; account linking uses the **OAuth2 authorization code** flow with a **user access token**. These are different credentials on the same Discord application (same Client ID).

## Environment

Set in the monorepo root `.env` (see [`.env.example`](../../.env.example)):

| Variable                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DISCORD_OAUTH_CLIENT_ID`           | Public OAuth2 Client ID (same app as the bot).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DISCORD_OAUTH_CLIENT_SECRET`       | **Server-only.** Never expose to the SPA or commit real values. Rotate if leaked.                                                                                                                                                                                                                                                                                                                                                                                              |
| `DISCORD_OAUTH_REDIRECT_URI`        | Must match exactly what is registered in the Discord Developer Portal. Local dev (Vite proxy default): `http://localhost:8080/api/v1/auth/discord/callback` so session cookies land on the same origin as `/api` requests. Local dev with direct API origin (`VITE_API_URL=http://localhost:3000`): `http://localhost:3000/api/v1/auth/discord/callback`. Production: `https://<api-host>/api/v1/auth/discord/callback` when TLS terminates on the API or edge.                |
| `DISCORD_OAUTH_SCOPES`              | Space-separated scopes. If unset, the backend defaults to: `connections`, `email`, `guilds`, `identify`, `identify.premium`, `openid`, `relationships.read`, `sdk.social_layer`, `sdk.social_layer_presence`. The [Portal OAuth2 URL Generator](https://discord.com/developers/applications) lists additional scopes (`bot`, `rpc.*`, `guilds.join`, …); use those only when you implement the matching flows—Echo’s default targets **user** linking, not bot install or RPC. |
| `ECHO_DISCORD_TOKEN_ENCRYPTION_KEY` | **Required in production** when linking is enabled: 64 hex chars or base64 for 32 bytes. Dedicated from `ECHO_2FA_ENCRYPTION_KEY` so key rotation stays independent.                                                                                                                                                                                                                                                                                                           |
| `ECHO_APP_PUBLIC_URL`               | SPA origin used after OAuth to redirect with `?discord_linked=1` or `0`.                                                                                                                                                                                                                                                                                                                                                                                                       |

If Client ID, secret, or redirect URI are unset, the API returns `NOT_CONFIGURED` for start and the callback redirects with `discord_error=not_configured`.

### “Invalid OAuth2 redirect_uri” (Discord’s page)

Discord compares the `redirect_uri` Echo sends in the authorize URL to **OAuth2 → Redirects** on your application. It must match **exactly** (after URL decoding), including:

- **`http` vs `https`** — must match the portal entry **and** what your server actually speaks on that host/port.
  - **Mismatch with portal:** Echo sends `redirect_uri` on authorize; Discord rejects if it is not listed (often 400 on `/oauth2/authorize`).
  - **Local `https://localhost` without TLS:** If the portal and `.env` use `https://localhost:3000/...` but the Echo API only listens for **plain HTTP** (default `fastify.listen`), the browser shows **ERR_SSL_PROTOCOL_ERROR** (or similar) on the callback — use plain `http://localhost/...` for your actual local origin, or terminate HTTPS in front of the API (reverse proxy + certs).
- **`localhost` vs `127.0.0.1`** — they are different hosts; pick one and use it in both `.env` and the portal.
- **Port** — must match the callback origin you actually run (`8080` with Vite proxy default, `3000` only when using direct API origin).
- **Path** — Echo’s callback is `/api/v1/auth/discord/callback` (no trailing slash unless you registered one).

`POST /api/v1/auth/discord/start` returns `redirectUri` alongside `authorizeUrl` so you can copy the value into the portal. In development the backend also logs the same `redirectUri` on start.

## API

- `POST /api/v1/auth/discord/start` (Bearer session): sets a short-lived signed cookie and returns `{ authorizeUrl }`. The browser should navigate to `authorizeUrl`.
- `GET /api/v1/auth/discord/callback?code=&state=` (browser redirect from Discord): exchanges the code, fetches `GET /users/@me`, maps to **normalized** JSON, applies **guest vs full-account merge**, stores **encrypted** tokens, redirects to `ECHO_APP_PUBLIC_URL` with query flags (no secrets).
- `GET /api/v1/me/discord`: linked or not; **normalized** fields only (`mergeKind`, `profile`: ids, names, `avatarUrl`, `bannerUrl`, `emailPresent`, optional counts / `premiumType`), no tokens or raw Discord payloads.
- `DELETE /api/v1/me/discord`: removes the link row (disconnect).

## Flow mechanics

Echo supports both:

1. **Link flow**: `POST /api/v1/auth/discord/start` (requires a session).
2. **Login flow**: `POST /api/v1/auth/discord/login/start` (unauthenticated).

On callback:

- If a Discord link row is not found during a login flow, Echo can auto-provision a new user in `auth_users` (with a `NULL` password hash), merge in the Discord profile data, and log the user in. **New sign-ups require an email from Discord** (OAuth `email` scope and user consent); if Discord does not return an email, the callback redirects with `discord_no_email`.
- **Echo email verification is always required** for new Discord sign-ups: Echo does not treat Discord’s own `verified` email flag as proof of ownership. After provisioning, Echo sends the same signup verification email as password registration (`sendSignupVerificationEmail`).
- Email collisions (`oauth_email_conflict`) or MFA constraints (`discord_login_mfa`) block automatic login, instructing the user to log in manually and link the account in settings instead.

## Scopes: core vs enhancement

**Core (safe to depend on for v1 linking):**

- `identify` — Discord user id, username, global name, avatar/banner hashes; `premium_type` when Discord returns it on `/users/@me`.
- `identify.premium` — Listed in the Developer Portal **OAuth2 URL Generator** as a separate scope from `identify`; include it if Discord requires it for your Nitro / subscription fields. Echo’s default scope set includes it alongside `identify`.
- `email` — only used when merging into a **guest** with no email and Discord marks the email verified.

**Optional product enrichment (graceful degradation):**

- `guilds` — used only to populate `guildCount` on the normalized profile when `/users/@me/guilds` succeeds.
- `connections` — used only for `connectionsCount` when `/users/@me/connections` succeeds.

**Social SDK–related (approval may be required; do not depend on for core UX):**

- `openid` — documented together with `sdk.social_layer` / `sdk.social_layer_presence` for [Social SDK](https://discord.com/developers/docs/discord-social-sdk/core-concepts/oauth2-scopes) flows.
- `sdk.social_layer_presence` / `sdk.social_layer` — presence and limited communications features per Discord; Echo’s link flow **does not** require these for storing the normalized profile, but they are included in the **default** scope set when `DISCORD_OAUTH_SCOPES` is unset.
- `relationships.read` — friends / requests / blocks; [Social SDK terms](https://support-dev.discord.com/hc/en-us/articles/30225844245271-Discord-Social-SDK-Terms) may apply; may need Discord access approval.

The linking flow should **no-op** when optional endpoints fail or omit data. You can remove or replace scopes via `DISCORD_OAUTH_SCOPES` without breaking connect / disconnect / normalized storage for the core fields.

## Internal model

Linked accounts are stored in `auth_discord_user_links` (see `backend/src/db/authTables.ts`):

- **Encrypted** `access_token` / `refresh_token` (AES-256-GCM).
- `discord_normalized_jsonb` — Echo-owned **versioned** object (`v: 1`, ids, display fields, avatar/banner CDN URLs, `emailPresent`, optional counts). All product logic and `GET /me/discord` use this layer.
- `discord_raw_cache_jsonb` — optional, small debug/reconciliation payload (not authoritative; may be cleared anytime).
- `merge_kind` — `full` (guest import into `auth_users` where allowed) or `partial` (registered user: no automatic overwrite of core identity).

## Security notes

- **CSRF:** OAuth `state` matches a signed, time-limited payload in an httpOnly cookie issued at `POST /discord/start`.
- **Redirect URI** must match the portal exactly; prefer an **API** callback URL, then redirect to the SPA with query parameters.
