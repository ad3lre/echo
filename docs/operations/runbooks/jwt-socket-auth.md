# Runbook: Socket.IO authentication (Echo)

**Audience:** Engineers debugging **socket connect failures**, immediate disconnects, or missing auth when the handshake does not match how the first-party app signs in.

## Model (Option A — default)

- The **first-party SPA** authenticates the REST API with **cookies** (`echo_sid` server session + `echo_rt` refresh where applicable) and **CSRF** on mutating HTTP calls.
- **Socket.IO** should use **`withCredentials: true`** so the browser sends the same **session cookies** on the handshake as on `fetch(..., { credentials: 'include' })`.
- **`resolveSocketIdentity`** (see `server/backend/src/sockets/resolveSocketIdentity.ts`) resolves the user in this order:
  1. **`echo_sid`** from the handshake `Cookie` header → Redis (or memory) session → active Postgres refresh row for `refreshTokenId`.
  2. If **`AUTH_LEGACY_BEARER=true`**, JWT from `Authorization: Bearer` or `auth.token` on the handshake (tooling / migration only).

## Symptoms

- Browser: connect error, immediate disconnect, or user shows as unauthenticated while REST `/me` works (often **cross-origin** cookies not sent, or missing `withCredentials`).
- Server logs: cookie session resolve warnings; or, in legacy mode, JWT invalid / missing.

## Configuration checklist

1. **Same-site / proxy** — SPA and API must share a deployment story where **session cookies** reach the API host on the socket handshake (same origin, or credentialed CORS with correct `Access-Control-Allow-Credentials` and non-wildcard `CORS_ORIGIN`).
2. **`REDIS_URL`** — Required in production for **multi-tab / restart-safe** session truth; without it, sessions are **in-process only** (see server startup warning).
3. **`AUTH_LEGACY_BEARER`** — Leave **`false`** for production first-party; enable only for scripts that still send Bearer JWT.
4. **`AUTH_REQUIRE_SOCKET_TOKEN`** / production strictness — If the server rejects anonymous sockets, ensure the client either has a **valid session cookie** on the handshake or (legacy) supplies a JWT when legacy Bearer is enabled.
5. **Clock skew** — Short-lived JWTs (legacy path) still care about `exp`; session cookies do not replace NTP hygiene for any remaining JWT consumers.

## Mitigations

- Fix **origin / cookie** / **Vite proxy** so socket and REST see the same API host and cookies.
- Redeploy with aligned **`JWT_SECRET`**, **`REDIS_URL`**, and **`CORS_ORIGIN`** across processes.

## Correlation

- Clients may send **`X-Request-Id`** on the Socket.IO handshake; the server uses it as a fallback correlation id when the payload omits `correlationId` (`socketHandshakeCorrelationId` in `handlers.ts`).

## Related documentation

- Session architecture: [`OPTION_A_SESSION_ARCHITECTURE.md`](../../infra/auth/OPTION_A_SESSION_ARCHITECTURE.md).
- Stack / auth snapshot: [`STACK.md`](../../overview/STACK.md).
- Auth roadmap: [`AUTHENTICATION_PLAN.md`](../../plans/AUTHENTICATION_PLAN.md).
- Production security checklist: [`../PRODUCTION_SECURITY_CHECKLIST.md`](../PRODUCTION_SECURITY_CHECKLIST.md).
- Broader readiness: [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md) §8.
