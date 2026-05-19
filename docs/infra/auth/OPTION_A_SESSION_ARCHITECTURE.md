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
