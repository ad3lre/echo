# Option A — Strict BFF session architecture (signed off)

**Decision:** Echo adopts **Option A** from the Auth pillar plan: **no long-lived bearer tokens in the SPA**, **HttpOnly session cookie** + **server-side session state**, with **Redis** as the hot session store in production-capable deployments. **Option C** (standalone OAuth2/OIDC authorization server) is deferred until federation or first-class third-party API clients are required.

## Session truth (who wins)

| Store         | Role                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redis**     | Authoritative **hot** session: `sessionId` → `{ userId, refreshTokenId, csrfSecret }`, TTL aligned with refresh lifetime. Invalidation for “this browser” deletes this key.                                     |
| **Postgres**  | Durable **refresh token** rows (`auth_refresh_tokens`), user profile, TOTP, etc. Logout / rotation revokes rows here; sessions that reference a revoked refresh become invalid on the next `requireAuth` check. |
| **Cookies**   | `echo_sid` (HttpOnly) binds the browser to Redis; `echo_csrf` (readable) supplies double-submit CSRF for unsafe HTTP methods; `echo_rt` (HttpOnly, path-scoped) carries the opaque refresh token for rotation.  |
| **Socket.IO** | Same **cookies** on the handshake as REST (same-site + `credentials`). Identity is resolved from `echo_sid` → Redis → user, consistent with `requireAuth`.                                                      |

**Conflict rule:** If Redis has no session for `echo_sid` but cookies are present → **401**, clear session cookies. If refresh row is revoked or expired while Redis still holds the session → **`requireAuth` fails** after `findRefreshTokenById` check, session deleted.

## Invalidation & multi-tab

- **Logout (this device):** Revoke current refresh row, delete Redis session, clear cookies.
- **Logout all / password change:** `revokeUserRefreshTokens`, **`deleteAllRedisSessionsForUser`**, clear cookies on this device.
- **Refresh rotation:** Old refresh revoked, new refresh stored, **same or new** session id in Redis updated to point at the new `refreshTokenId`.
- **Multi-tab:** Two tabs share cookies; concurrent refresh races may invalidate one tab’s refresh token (standard rotation). Mitigation: client retries `POST /auth/refresh` once on 401 then `/me`.

## CSRF

Unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) to `/api/v1/*` require header **`X-CSRF-Token`** equal to the **`echo_csrf`** cookie and to the CSRF secret stored in the Redis session (when a session exists). Exemptions include login/register/guest/refresh/MFA/public OAuth callback and health/metrics.

## Operational notes

- **`REDIS_URL`:** Set in production for multi-process correctness. When unset, the server uses an **in-memory** session store (single-process dev/CI only); logs warn in production if Redis is missing.
- **JWT:** Access JWTs are **not** returned to the SPA. Short-lived JWTs may still be used internally (e.g. MFA pending step). Optional **`AUTH_LEGACY_BEARER`** (default off) can restore Bearer validation for tooling only — not used by the first-party client.

## Client auth invariants (frontend contract)

Session rotation (register, login, guest upgrade, password change) revokes the old
session server-side while requests issued under it may still be in flight. The
client must uphold these invariants so a rotation never tears down the session it
just created:

1. **Stale 401s must not invalidate a newer session.** Any code path that reacts
   to a 401 by calling `invalidateSessionForReauth` / `clearLocalTokens` must
   capture `authStateGeneration` _before_ the request and skip teardown when the
   generation changed mid-flight (the 401 belongs to the previous session).
   Reference implementations: `echoFetch` in `frontend/src/api/echo/transport.ts`
   and the benign-401 branch of `restoreSessionFromApi` in
   `frontend/src/stores/authSession.ts`.
2. **`restoreSessionFromApi() === null` does not mean "unauthenticated".** It
   also returns `null` for transient network errors and for stale responses
   superseded by a concurrent `setSession`. Callers (notably `startInitialLoad`)
   must re-check `isAuthenticated` / `authStateGeneration` before auto-minting a
   guest or resetting workspace state.
3. **Async work that applies state after `await` must be generation-guarded.**
   Workspace hydrates, social refreshes, and profile applications must compare
   `authStateGeneration` captured at start against the current value before
   writing to stores (same pattern as `startInitialLoadSeq` /
   `echoWorkspaceSocialRefreshSeq`).
4. **Desktop (Tauri WebView) bootstrap auth endpoints must be CORS-simple.**
   `tauri.localhost` → API is cross-origin; OPTIONS preflights are the #1 cause
   of broken `Set-Cookie` behind CDNs/WAFs. Login, register, guest, MFA, guest
   upgrade, refresh, and handoff redeem use `application/x-www-form-urlencoded`
   or query-param POSTs with no custom headers when `IS_ECHO_TAURI_SHELL`.
   New session-minting endpoints must follow the same pattern.
5. **The realtime socket must recycle when `authStateGeneration` changes.**
   Cookie sessions keep `accessToken === null`, so the socket auth key must
   include the generation counter — `isAuthenticated` alone misses same-user
   rotations such as guest upgrade.
6. **Every session-minting response runs `finalizeAuthSessionResponse`.** This
   applies the rotated CSRF token and native bearer tokens; skipping it leaves
   the client sending stale `X-CSRF-Token` headers after rotation.
