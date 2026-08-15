# Native (iOS) Bearer-Token Auth — Implementation Plan

**Status:** Implemented for native Apple auth · **Scope:** iOS native shell first (extensible to Android/desktop)

## Problem

Echo auth is **cookie-only by design** (`docs/infra/auth/OPTION_A_SESSION_ARCHITECTURE.md`): an
`HttpOnly; Secure; SameSite=Lax` session cookie (`echo_sid`) + server-side session state, **no bearer
tokens in the SPA**. This is correct and XSS-safe for the **web**, where the SPA and API share the
`chat-echo.com` origin.

It breaks for a **bundled native app** (UI served from a local `tauri://…` origin, API at
`https://chat-echo.com`):

- The request is **cross-site**, so a `SameSite=Lax` cookie is never sent. → every authenticated call
  401s right after register/login (the "session expired / couldn't hydrate attention state / sign in
  again" cascade).
- Desktop avoids this because `resolveCookieSameSite()` returns `none` for origins in
  `config.echoDesktopAllowedOrigins` (`backend/src/auth/sessionCookies.ts:73`). iOS does not get
  `SameSite=None`, and **even if it did**, WKWebView's ITP blocks third-party cookies far more
  aggressively than desktop WebView2 — so a cookie tweak is fragile.

**Today's working iOS config sidesteps this** by loading the WebView from `https://chat-echo.com`
remotely (`src-tauri/tauri.ios.chat-echo.conf.json` → `devUrl`), making everything same-origin. The
cost is website-style startup (network-dependent, slow first paint). To get **fast bundled-local
startup AND working auth**, native needs an auth path that does not depend on a same-site cookie.

## Decision

Add a **session-bound bearer-token** path for native shells. Native sends
`Authorization: Bearer <accessToken>`; tokens are minted alongside the normal server session so
**logout, refresh-token revocation, password-change invalidation, and 45-day inactivity all still
apply**. The web stays exactly as-is (cookie, HttpOnly).

> **Do NOT just reuse the existing `config.authLegacyBearer` path.** That branch
> (`backend/src/auth/middleware.ts:126`) verifies a _stateless_ JWT and loads the user — it skips the
> server-session/refresh-revocation checks the cookie path enforces (`middleware.ts:72-108`). A
> stateless token can't be revoked before expiry. The native path must be session-bound.

### Why bearer over cookie fixes (alternative considered)

Adding the iOS origin to `echoDesktopAllowedOrigins` to get `SameSite=None; Secure` _might_ work on
some iOS versions but is at the mercy of WKWebView ITP / third-party-cookie partitioning and could
regress on any iOS update. A 30-minute spike to confirm is worthwhile, but the durable fix is bearer.

## Existing building blocks (already in the repo)

- `backend/src/auth/token.ts`: `signAccessToken()` / `verifyAccessToken()` (TTL `config.jwtExpiresIn`),
  `createRefreshToken()`, `hashRefreshToken()`.
- `backend/src/auth/issueBrowserSession.ts`: `issueEchoBrowserSession()` — single chokepoint that
  creates the server session, sets cookies, returns `{ user, csrfToken }`. Login/register/OAuth all
  funnel through here.
- `backend/src/auth/middleware.ts`: `requireAuth()` — cookie branch (session-bound) + gated legacy
  bearer branch (stateless).
- Refresh-token store (`getAuthStore().findRefreshTokenById`, rotation) already exists.
- `frontend/src/services/auth/iosNativeAuth.ts` + `src-tauri/src/ios_auth.rs`: Keychain "session
  memory" commands (currently store display-name/pfp only) — extend for token storage.
- `frontend/src/api/echo/transport.ts:118` `echoFetch` builds headers in one place — single injection
  point for `Authorization`.

## Token model

- **Access token**: short-lived JWT (~15 min), memory-only on device. Carries `sub`, `username`, and a
  **`sid`** (server-session id) so the middleware can verify the session still exists.
- **Refresh token**: opaque, stored hashed server-side (reuse existing refresh store), rotated on every
  refresh; stored on device in the **iOS Keychain**.
- Lifetimes mirror the cookie session (`config.refreshTokenTtlDays`, 45-day inactivity).

## Backend changes

1. **Config flag** `AUTH_NATIVE_BEARER` (`config.ts`, native clients enabled by default), distinct from `authLegacyBearer`.
2. **Client detection**: native clients send `X-Echo-Client: ios` (set in `transport.ts`/`authClient.ts`).
   Use it in `issueEchoBrowserSession` to decide whether to also return tokens in the JSON body.
3. **`issueEchoBrowserSession`**: when native + `AUTH_NATIVE_BEARER`, also mint an access token (with
   `sid`) + refresh token tied to the just-created session and return
   `{ user, csrfToken, auth: { accessToken, refreshToken, expiresInSec } }`. Cookies can still be set
   (harmless if unused).
4. **`requireAuth`** — new **session-bound bearer branch** (before the legacy one), active when
   `AUTH_NATIVE_BEARER`:
   - `verifyAccessToken(token)` → extract `sub` + `sid`.
   - Look up the server session by `sid`; verify its refresh token is still active and `userId` matches
     (same checks as the cookie branch at `middleware.ts:72-108`). Reject 401 otherwise.
   - Apply `checkGuestGates`, set `req.authUser`, `touchServerSession(sid)`.
5. **Refresh endpoint** `POST /auth/token/refresh`: accepts the refresh token in the **body/Authorization**
   (not cookie); rotates it; returns a new access (+ rotated refresh) token. Reuse existing rotation +
   **reuse-detection → revoke session**. (The current `/auth/refresh` is cookie-based; add a
   native/body variant or branch on client.)
6. **Logout** `POST /auth/logout`: accept refresh token in body for native so the server session is
   deleted (cookie clears are a no-op there).
7. **CSRF**: bearer-authenticated requests don't carry ambient cookie credentials, so **skip CSRF
   enforcement when auth came from the bearer branch** (CSRF only protects cookie auth).

## Frontend changes

1. **Native token store** (`frontend/src/stores/authSession.ts` or a new `nativeAuthToken.ts`):
   access token in memory + `expiresAt`; refresh token persisted via Keychain (Tauri command).
2. **`transport.ts` (`echoFetch`) + `authClient.ts`**: when native (`VITE_ECHO_IOS` + `isTauri()`):
   - Add `Authorization: Bearer <accessToken>` and `X-Echo-Client: ios` to headers.
   - On `401`: try one refresh via `/auth/token/refresh` using the Keychain refresh token; on success
     retry the original request; on failure call `invalidateSessionForReauth()` (existing path).
   - Keep `credentials: 'include'` (harmless; cookie just won't be sent cross-site).
3. **register / login / `/auth/me` / OAuth handoff**: on native, read `auth.{accessToken,refreshToken}`
   from the response and store them (memory + Keychain).
4. **Boot** (`frontend/src/main.ts` / `iosBootOrchestrator`): on native, if a Keychain refresh token
   exists, exchange it for an access token at startup (the native equivalent of cookie
   `restoreSessionFromApi()`), then proceed. Wire into the existing `runIosBootCheck()` /
   `hasStoredSessionToRestore()` flow.

## Native shell (Rust) changes

- `src-tauri/src/ios_auth.rs`: add `ios_auth_store_token` / `ios_auth_get_token` /
  `ios_auth_clear_token` Keychain commands (mirror the existing session-memory commands); register in
  `src-tauri/src/lib.rs` `invoke_handler`. Refresh token lives in the Keychain (Secure Enclave-backed),
  **never** `localStorage`.

## Security

- Refresh token only in Keychain; access token short-lived and memory-only.
- Rotation + reuse detection on every refresh → revoke session on anomaly.
- Native tokens are **session-bound**, so they inherit logout / password-change / 45-day-inactivity
  revocation — no weakening vs the cookie model.
- Bearer enabled **only for native** (no cross-site cookie option there, and Keychain > browser storage);
  web remains cookie/HttpOnly, preserving the XSS posture of Option A.

## Rollout

- Behind `AUTH_NATIVE_BEARER` (backend) + native build gate (frontend). Cookie path stays the default;
  desktop is unaffected (keeps `SameSite=None`). Ship iOS first; consider extending to Android/desktop
  later for consistency.

## Testing

- **Backend unit/integration**: session-bound bearer branch (valid, expired, revoked-session,
  password-changed, guest-gated); refresh rotation + reuse detection; logout revokes; CSRF skipped for
  bearer.
- **iOS simulator, bundled-local (`sim:bundle`, cross-origin)** — the config that currently fails:
  register → authed calls 200; kill/relaunch → token restored from Keychain → still authed; logout →
  subsequent calls 401.
- **Web regression**: cookie flow unchanged; no `Authorization` header sent; CSRF still enforced.

## Sequencing

1. Backend: config flag, token model (`sid` in access token), `issueEchoBrowserSession` returns tokens,
   `requireAuth` session-bound bearer branch. (Behind flag, no client yet.)
2. Backend: `/auth/token/refresh` (body) + logout-by-body + CSRF skip for bearer.
3. Rust: Keychain token commands.
4. Frontend: token store + `transport`/`authClient` header injection + 401-refresh-retry.
5. Frontend: register/login/me/boot wiring.
6. Tests + simulator E2E on the bundled-local build; then flip `sim:bundle` to be the default iOS
   dev/test path (fast startup + working auth).

## Related

- `docs/infra/auth/OPTION_A_SESSION_ARCHITECTURE.md` (cookie design this extends)
- `docs/plans/AUTHENTICATION_PLAN.md` (session cookie semantics)
- `docs/operations/ios-tauri.md` (iOS build modes; bundled-local vs remote-load)
