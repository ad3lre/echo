# Echo Authentication Plan

**Implementation note (2026-03-27):** **Option A is largely shipped** — cookie + Redis sessions, CSRF for mutating auth routes, forgot/reset password, WebAuthn passkeys, MFA paths, and socket resolution from **`echo_sid`** (see [`auth/OPTION_A_SESSION_ARCHITECTURE.md`](../infra/auth/OPTION_A_SESSION_ARCHITECTURE.md)). Treat sections below as **design history + forward hardening** where they still describe “gaps” that are already closed in code.

**Modern authentication system with safety-first design**

_Aligned with Echo's stack: Vue 3, Fastify, PostgreSQL, Socket.IO_

_Security × UX compromises noted throughout—BFF pattern (no JWT in frontend), length over complexity, Lax cookies, progressive throttling, inactivity-based refresh, server-side socket validation._

---

## 1. Overview

This plan outlines building a production-ready authentication system for Echo that addresses the current gaps (no login, no sessions, placeholder `user_${random}` in Socket.IO) while incorporating modern security best practices. **Passkey-first registration** allows users to sign up with biometrics (Face ID / Touch ID) or hardware keys (YubiKey) via the WebAuthn API—no password required.

### Design Principles

- **Least privilege** – Tokens and sessions carry minimal required claims; **minimize JWT claims** – avoid PII in tokens (use opaque IDs only, e.g. `sub`, `role`)
- **Defense in depth** – Multiple layers of validation and protection
- **Zero trust** – Verify every request; never trust client-only state
- **Fail secure** – Defaults deny access when uncertain
- **Auditability** – Log security-relevant events for forensics (with minimal PII)

---

## 2. Architecture

### Backend-for-Frontend (BFF) Pattern

**The Fastify server handles all token logic. The Vue 3 app never sees a JWT.**

- Vue makes requests to the BFF (Fastify) with **credentials** (cookies) only—no `Authorization: Bearer` headers.
- The BFF issues a **session cookie** (HttpOnly, Secure, SameSite=Lax) that represents the session.
- When Vue calls the BFF, the BFF reads the session cookie and translates it into the JWT/headers needed for internal services or PostgreSQL.
- **Benefit:** Removes the XSS window almost completely—no token in JS memory; frontend cannot exfiltrate what it never receives.

### Token Strategy: Short-Lived Access + Refresh Tokens

| Token              | Lifetime                                             | Storage                                 | Purpose                                     |
| ------------------ | ---------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| **Session Cookie** | Inactivity-based; **45-day no-activity hard logout** | `HttpOnly` secure cookie (Vue only)     | Auth with BFF; Vue never sees contents      |
| **Access Token**   | 15–30 min                                            | **Server-side only** (BFF memory/Redis) | BFF uses for internal services, Socket auth |
| **Refresh Token**  | Same as session                                      | `HttpOnly` secure cookie                | BFF uses to obtain new access tokens        |

**Rationale:** With BFF, the Vue app never holds JWTs. Session cookie in HttpOnly is not accessible to JS—closing the XSS window. **Inactivity-based expiry:** Extend while user is active. **45-day no-activity hard logout** – if no activity for 45 days, revoke and require re-login.

- **JWT signing:** Prefer **Ed25519 (EdDSA)** over RS256 – 32-byte keys, faster signatures, more resilient to side-channel attacks
- **Rotating signing keys:** Support multiple active keys (e.g. `kid` claim); set up key versioning to silently switch keys without breaking tokens; rotate regularly; retire old keys after max token TTL
- **`aud` (audience) claim:** Include in JWTs so tokens are only accepted by your API – prevents reuse in other services
- **Revocation:** `jti` blocklist only for **compromised** tokens (theft detected); keeps normal UX intact; no full revocation list for routine logout
- **Session limits (optional):** Limit simultaneous active sessions per user; can silently revoke old sessions on login

### Auth Flow (High Level)

```
┌─────────────┐     POST /auth/login      ┌─────────────────────────────────┐
│   Client    │  { email, password }      │  BFF (Fastify)                  │
│  (Vue SPA)  │ ────────────────────────► │  - Validates credentials        │
└─────────────┘                           │  - Issues JWT (server-side)     │
       ▲                                  │  - Set-Cookie: session          │
       │  Set-Cookie: session             │    (HttpOnly, Secure)           │
       │  (Vue never receives JWT)        └─────────────────────────────────┘
       └─────────────────────────────────

┌─────────────┐     GET /api/...          ┌─────────────────────────────────┐
│   Client    │  Cookie: session          │  BFF reads session cookie       │
│  (Vue SPA)  │ ────────────────────────► │  → Resolves to user/JWT         │
└─────────────┘  (no Authorization)       │  → Proxies to internal services │
                                          └─────────────────────────────────┘
```

---

## 3. Backend Components

### 3.1 New Config Variables

Add to `.env.example` and config:

| Variable                             | Purpose                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Ed25519 key pair; **prefer HSM/KMS** – private key never in app memory; BFF sends "sign this" to KMS only |
| `JWT_ACCESS_EXPIRY`                  | e.g. `15m`                                                                                                |
| `JWT_REFRESH_EXPIRY`                 | Inactivity cutoff (e.g. `45d`); extend on activity; **45-day no-activity hard logout**                    |
| `REFRESH_GRACE_PERIOD_SEC`           | e.g. `15` – seconds to accept old token after rotation (multi-tab race fix)                               |
| `REFRESH_TOKEN_SECRET`               | Separate secret for refresh tokens (rotation)                                                             |
| `PASSWORD_PEPPER`                    | Server-side secret added before hashing; stored outside DB                                                |
| `SESSION_STORE_URL`                  | Optional Redis URL for session/revocation (e.g. `redis://localhost:6379`)                                 |
| `CORS_ORIGIN`                        | Explicit origin(s) for cookie SameSite and CORS; **no wildcards** on auth routes                          |
| `WEBAUTHN_RP_ID`                     | Relying Party ID (e.g. `echo.example.com`); must match origin                                             |

**Secrets management:** Use **HSM/KMS** (AWS KMS, GCP KMS, Azure Key Vault). The JWT private key should **never exist in the BFF's application memory**—only the "request to sign" goes to KMS. Avoid raw keys in env vars.

**CORS:** Strict CORS + origin enforcement on auth endpoints – no wildcards; ensure only legitimate frontends can hit auth routes.

### 3.2 Database Schema

**`users`** (extend existing):

```sql
-- Password stored as bcrypt or argon2 hash (nullable for passkey-only accounts)
password_hash    TEXT
email_verified_at TIMESTAMPTZ
status           TEXT DEFAULT 'active'  -- active, suspended, deleted
mfa_enabled      BOOLEAN DEFAULT FALSE
password_reset_at TIMESTAMPTZ           -- triggers 24h cooling period; block email change / financial actions
security_version INT DEFAULT 0          -- increment on "Logout all devices"; token.version must match for validity
last_login_at    TIMESTAMPTZ
failed_login_count INT DEFAULT 0
locked_until     TIMESTAMPTZ
```

**`refresh_tokens`**:

```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users(id)
token_hash      TEXT NOT NULL      -- SHA-256 of token for lookup
family_id       UUID NOT NULL      -- For rotation; detect reuse
expires_at      TIMESTAMPTZ NOT NULL
created_at      TIMESTAMPTZ
revoked_at      TIMESTAMPTZ
user_agent      TEXT
ip_address      INET
device_fingerprint_hash TEXT       -- Optional; for passive binding
```

**Refresh token binding (passive):** Bind rotation to **device ID** (hash of device fingerprint + user-agent). On issue, store hash; on refresh, compare; **log anomalies but don't block** – silently detects stolen refresh tokens without blocking legitimate users.

**`password_history`** (for reuse prevention):

```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id)
password_hash TEXT NOT NULL   -- hash of old password
created_at  TIMESTAMPTZ
-- Keep last N per user; prune oldest
```

**`webauthn_credentials`** (passkeys):

```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users(id)
credential_id   BYTEA UNIQUE NOT NULL   -- from attestation
public_key      BYTEA NOT NULL          -- COSE public key
counter         BIGINT DEFAULT 0        -- replay protection
transports      TEXT[]                  -- ['internal','usb','nfc']
created_at      TIMESTAMPTZ
last_used_at    TIMESTAMPTZ
-- ABI constraint: authenticator device type if needed
```

**`login_events`** (audit):

```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id)
event_type  TEXT  -- login_success, login_fail, logout, mfa_challenge
ip_address  INET
user_agent  TEXT
created_at  TIMESTAMPTZ
```

**Database bloat:** `refresh_tokens` and `login_events` grow aggressively. **Plan a cleanup job** (cron or pg_cron) to delete expired tokens and audit logs older than 90 days. Keeps indexes performant.

**TDE (Transparent Data Encryption):** Enable PostgreSQL TDE for `webauthn_credentials` and `users` tables so a physical disk or snapshot leak is useless without the master key.

### 3.3 API Routes

| Method | Path                                    | Purpose                                                                                   |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register`                 | Create account (email, password)                                                          |
| POST   | `/api/v1/auth/passkey/register/options` | WebAuthn registration challenge                                                           |
| POST   | `/api/v1/auth/passkey/register/verify`  | Verify attestation; create user + credential (passkey-first)                              |
| POST   | `/api/v1/auth/login`                    | Issue access + set refresh cookie                                                         |
| POST   | `/api/v1/auth/passkey/login/options`    | WebAuthn assertion challenge                                                              |
| POST   | `/api/v1/auth/passkey/login/verify`     | Verify assertion; issue tokens                                                            |
| POST   | `/api/v1/auth/logout`                   | Revoke refresh token, clear cookie                                                        |
| POST   | `/api/v1/auth/logout-all`               | Increment `security_version`; revoke all sessions (panic button)                          |
| POST   | `/api/v1/auth/refresh`                  | Exchange refresh cookie for new access token                                              |
| POST   | `/api/v1/auth/forgot-password`          | Request password reset email                                                              |
| POST   | `/api/v1/auth/reset-password`           | Reset with **single-use, short-lived** token from email; **MFA required if user has MFA** |
| POST   | `/api/v1/auth/verify-email`             | Verify email via **single-use, short-lived** token                                        |
| GET    | `/api/v1/auth/me`                       | Current user (protected)                                                                  |
| POST   | `/api/v1/auth/mfa/setup`                | Init TOTP                                                                                 |
| POST   | `/api/v1/auth/mfa/verify`               | Complete TOTP setup or login                                                              |
| POST   | `/api/v1/auth/mfa/disable`              | Disable MFA (re-auth required)                                                            |
| POST   | `/api/v1/auth/change-email`             | Change email (MFA required)                                                               |
| POST   | `/api/v1/auth/change-password`          | Change password (MFA required)                                                            |

### 3.4 Fastify Plugins & Middleware

- **`@fastify/jwt`** – Encode/decode access tokens
- **`@fastify/cookie`** – Read refresh token from cookie
- **Auth decorator** – `request.user` after token verification
- **Optional session store** – Redis for revocation / "logout everywhere"

---

## 4. Security Measures

### 4.1 Password Policy

- **Hashing:** Argon2id (preferred) or bcrypt (cost ≥ 12)
- **Pepper:** Add a server-side secret (`PASSWORD_PEPPER`) before hashing; never store pepper in DB; rotate periodically
- **Min length:** 12–14 characters (entropy matters more than complexity)
- **No complexity checklist** – Avoid forcing "one uppercase, one number, one symbol"; users forget which symbol they used, driving "Forgot Password" cycles. Use **minimum length + common-password blocklist** instead.
- **Password strength meter** – Visual feedback (weak/medium/strong) instead of a chore checklist; symbols optional unless user adds them
- **Breach check:** Optional – check against Have I Been Pwned API (k-anonymity)
- **Common password blocklist** – Reject top 10k+ common list
- **Password reuse prevention:** Silently store hashes of last N passwords; reject new password if it matches

### 4.2 Rate Limiting (Auth-Specific)

| Endpoint                | Limit                      |
| ----------------------- | -------------------------- |
| `/auth/login`           | 5 attempts / 15 min per IP |
| `/auth/register`        | 3 / hour per IP            |
| `/auth/forgot-password` | 3 / hour per IP            |
| `/auth/refresh`         | 30 / min per IP            |
| `/auth/mfa/verify`      | 5 / 15 min per user        |

- **User agent + IP throttling:** More precise than IP-only; blocks bot abuse silently
- Use `@fastify/rate-limit` with Redis store in production for distributed limits

### 4.3 Account Lockout & Brute-Force Protection

- **Avoid hard lockouts** – Locking after N attempts is a DoS vector: attackers can lock legitimate users out. Prefer **progressive throttling** (increasing delay between attempts) or **CAPTCHA** (Cloudflare Turnstile, reCAPTCHA v3) after 3 failed attempts.
- Stops bots; allows humans who forgot their password to keep trying
- Store `failed_login_count`; clear on successful login

### 4.4 Transport Security

- **TLS 1.3** – Enforce minimum TLS 1.3; disable older protocols; no UX impact
- **Reject deprecated TLS at app level** – In addition to web server config, ensures no fallback attacks
- **HSTS** – `Strict-Transport-Security` header with `max-age` and `includeSubDomains`; no UX impact
- **Certificate pinning** – For mobile/native clients, pin expected cert or public key to mitigate MITM

### 4.5 Cookie Security

```
Set-Cookie: session=<opaque_id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...
```

**BFF:** Vue receives session cookie only; BFF resolves it to user/session. No JWT in cookie or frontend.

**Honey-token (Fort Knox):** Set `__Host-Echo-Verify` cookie (JS-accessible). Vue hashes it and sends in `X-Echo-Verify` header. BFF validates; defeats proxy/SSRF replay without both cookie and header.

- **HttpOnly** – Session cookie not accessible to JavaScript (XSS mitigation)
- **Secure** – HTTPS only
- **SameSite=Lax** – `Strict` causes "Logged Out" on first load when user navigates from external link (Slack, email, bookmark); browser won't send cookie on that first request. **Lax** provides nearly identical CSRF protection for modern browsers while allowing session to persist when navigating _to_ the site from elsewhere.
- **Path** – Limited to auth routes

### 4.6 JWT Claims

- Keep JWTs minimal: `sub` (user ID), `role`, `jti`, `exp`, `iat`, `aud`, `version` (security_version) only
- **`aud` (audience):** Set to your API identifier; verify on decode – ensures tokens only accepted by your API, preventing reuse elsewhere
- **Avoid PII** (no email, name, or other identifiers) – reduces exposure if token is leaked

### 4.7 CSRF Protection

- For cookie-based refresh: SameSite=Lax largely mitigates CSRF for modern browsers (GET safe; POST from cross-site typically blocked)
- Store CSRF token in cookie (readable) and require it in header for mutations

### 4.8 Access Token Revocation (Stolen Tokens)

- When theft detected (e.g. refresh family reuse), add access token `jti` to blocklist in **Redis**
- **Set EXPIRE (TTL) to the remaining life of the token** – use `exp` from JWT to compute seconds until expiry; prevents blocklist from growing infinitely; Redis auto-evicts when TTL hits zero
- Use `SET key val EX seconds` (or `SETEX`) – lookups stay **O(1)**; no manual cleanup job
- Blocklist **only for compromised tokens** – routine logout does not use it; keeps normal UX intact
- Middleware checks blocklist before accepting token; skip for normal requests (no DB hit for valid tokens)

### 4.9 Refresh Token Rotation

- Each refresh returns a **new** refresh token; old one is invalidated
- **45-day no-activity hard logout:** On each refresh, set `expires_at = now + 45d`. If user has no activity for 45 days, token expires; next request fails and user must re-login
- Store `family_id`; if an old token is reused, revoke entire family (token theft)
- **Use HMAC for refresh token verification** – add a keyed MAC in addition to hash; protects against token tampering if DB leaked
- Log and alert on family revocation

**Race condition (multi-tab):** When multiple tabs or concurrent API calls hit `/auth/refresh` at once, the first succeeds and invalidates the old token; the second receives the old token and triggers "theft detection," logging the user out everywhere. **Fix: Grace period (10–30 s)** – during a short window after rotation, still accept the _just-replaced_ old refresh token and return the same new token. **Idempotent refresh:** Beyond grace period, make refresh idempotent per `family_id`—if multiple tabs hit at the same millisecond, return the exact same new token set to all; do not flag as theft.

### 4.10 Single-Use, Short-Lived Verification Tokens

- Email verification, password reset, and MFA recovery tokens must be **single-use** and **short-lived** (e.g. 15–60 min)
- **Short-lived sliding session tokens for sensitive actions** – e.g. re-authenticate for password/email change silently; issue ephemeral token valid only for that action; no extra UX friction
- Store token hash in DB; invalidate immediately after successful use
- Reject token reuse; return generic error

### 4.12 Password Reset & Change Security

**MFA-protected resets:** If the user has MFA enabled, require the MFA code during password reset. The email link alone must not be a "God-mode" bypass—both email token and MFA must be satisfied.

**Notification overload:** When a password is changed (reset or change-password), send **both** an email and a **Socket.IO notification to all active sessions** (e.g. emit `auth:password_changed` to user's Socket.IO room). Ensures the user is aware of the change even if they have multiple tabs/devices; helps detect unauthorized resets.

**24-hour cooling period:** After a password reset, set `password_reset_at = now`; enforce a **24-hour cooling period** during which the user cannot change their email or perform financial/admin actions. Reduces impact of account takeover; gives legitimate user time to reclaim account if reset was malicious.

### 4.11 Input Validation & Payload Limits

- **Strict Content-Type enforcement** – Accept only `application/json` for API requests; reject others; prevents some injection attacks
- **Strict JSON schema** with max payload sizes for all auth routes; reject unknown fields
- Validate: email format, password strength, token format
- **Payload size limits:** Enforce max request body (e.g. 1–10 KB for auth routes) – blocks oversized or malformed requests; UX unaffected unless someone is attacking
- Reject malformed JSON, extra-large strings, and deep nesting
- **Generic error messages for auth failures:** Double-check everywhere – never leak "user exists"; use consistent "Invalid credentials" or "Invalid request" for login/register failures
- **Synthetic latency on auth failures:** Add random delay (200–500 ms) before returning failed login/register response; prevents timing attacks to infer username existence or validation failure point

---

## 5. Socket.IO Integration

### 5.1 Handshake Auth

Socket.IO receives session cookie automatically (same-origin, `withCredentials`):

```ts
// Client (BFF: no token)
const socket = io(url, {
  withCredentials: true,
  transports: ['websocket', 'polling'],
});
```

### 5.2 Server-Side Verification

```ts
// BFF: Vue sends session cookie; no token in handshake
io.use(async (socket, next) => {
  const sessionCookie =
    socket.handshake.headers.cookie?.match(/session=([^;]+)/)?.[1];
  if (!sessionCookie) return next(new Error('Unauthorized'));
  const session = await getSessionFromCookie(sessionCookie); // BFF resolves session → user
  if (!session) return next(new Error('Unauthorized'));
  socket.data.userId = session.userId;
  socket.data.role = session.role;
  next();
});
```

- Replace `user_${random}` with real `userId` from session
- **BFF pattern:** Socket receives session cookie via `withCredentials`; BFF resolves cookie to user—no JWT in frontend
- **Per-event authorization claims check:** Don't just trust handshake; re-check `userId`/`role` or required claims on each event handler – prevents privilege escalation via crafted events

### 5.3 Token Refresh for Long Sessions

- **BFF pattern:** Session cookie drives auth; BFF validates it on each Socket.IO event/API call. No client-side token refresh—Vue never has tokens to refresh.
- BFF resolves session cookie to user; if session expired, return 401 and client redirects to login
- Socket stays connected as long as session cookie is valid; BFF handles session extension server-side

**Socket.IO refresh anti-abuse (server-side):** Rate-limit refresh flows per user; **throttle socket reconnects per IP** – prevents abuse without affecting normal users; log suspicious patterns.

### 5.4 Channel Membership & Event Security

- **Verify channel membership for every socket action** – server-side enforcement; invisible to UX
- Before `joinChannel`, verify user has access to that channel (DB lookup)
- Before `message`, `leaveChannel`, or any channel-scoped event, verify user is in channel and not muted/banned
- Add `channels` table with membership; gate all channel ops
- **Replay detection:** Require nonce on sensitive events; reject duplicate events with same nonce; prevents replay attacks
- **Event-level rate limits:** Per user and per channel; prevents spam/DoS without UX impact

**Heartbeat re-auth (Fort Knox):** Every 30 minutes, emit `server:reauth`. Client must respond with BFF-verified session within 10 seconds or connection is dropped.

**Message entropy check (Fort Knox):** Server-side Shannon entropy check on chat messages. High-frequency, low-entropy or repetitive messages trigger session quarantine.

**In-session step-up for high-value events:** For sensitive Socket.IO events (e.g. `deleteChannel`, `adminAction`, `transferOwnership`), perform a **step-up check** before executing. Require MFA or re-auth confirmation; reject until satisfied. JWT validity alone is insufficient. **Cooling period:** If `password_reset_at` is within last 24h, block these actions.

---

## 6. Frontend Components

### 6.1 Auth Store (Pinia)

```ts
// stores/auth.ts (BFF: no tokens in frontend)
- user: User | null
- isAuthenticated: boolean
- login(credentials)
- logout()
- fetchUser()
// No accessToken, no refreshAccessToken - BFF handles all token logic
```

### 6.2 API Client Interceptor

- **BFF pattern:** Use `credentials: 'include'` on all requests—session cookie is sent automatically
- **No `Authorization: Bearer` headers**—Vue never sees or sends JWTs; XSS cannot exfiltrate tokens
- **Honey-token (Fort Knox):** Read `__Host-Echo-Verify` cookie; compute hash; send in `X-Echo-Verify` header on every request
- On 401: BFF session invalid; redirect to login
- All API calls go to BFF; BFF translates session cookie to auth for internal services

### 6.3 Socket Auth

- **With credentials:** Socket connects with `withCredentials: true`; session cookie sent automatically
- **No token in handshake**—BFF validates session cookie server-side and resolves to user/JWT for Socket.IO middleware
- BFF handles token lifecycle; Vue never touches JWTs

### 6.4 Route guards (History API shell)

The SPA does **not** use Vue Router. Auth gating lives in the layout / boot orchestrators:

- Unauthenticated users on protected paths → redirect to `/login` (or native login overlay on iOS)
- Authenticated users on guest-only paths (`/login`, `/register`, …) → redirect into the app shell
- Session validity is determined by BFF `/me` and cookie presence, not client-stored JWTs

### 6.5 UI Screens

- `/login` – **Passkey-first:** "Sign in with Passkey"; fallback: email + password, "Forgot password?" link
- `/register` – **Passkey-first:** "Sign up with Passkey" (Face ID / Touch ID / security key); fallback: email + password; password strength meter
- `/forgot-password` – Email input, success message
- `/reset-password?token=...` – New password form
- `/verify-email?token=...` – Verification confirmation
- MFA setup flow (QR code, backup codes)
- MFA challenge (6-digit code) during login

---

## 7. Passkey-First Registration (WebAuthn)

Allow users to register and log in with **passkeys**—biometric (Face ID, Touch ID) or hardware keys (YubiKey)—via the WebAuthn API. No password required for passkey-only accounts.

### 7.1 Flow: Passkey Registration

1. User enters **email** on register screen
2. Client requests `POST /auth/passkey/register/options` with email
3. Server generates WebAuthn challenge; returns `PublicKeyCredentialCreationOptions` (rp, user, challenge, pubKeyCredParams)
4. Client calls `navigator.credentials.create()`; user completes biometric/hardware prompt
5. Client sends attestation to `POST /auth/passkey/register/verify`
6. Server verifies attestation; creates user (no `password_hash`); stores credential in `webauthn_credentials`
7. Issue access + refresh tokens; redirect to app

### 7.2 Flow: Passkey Login

1. User enters email (or use discoverable credentials / conditional UI if supported)
2. Client requests `POST /auth/passkey/login/options` with email
3. Server returns `PublicKeyCredentialRequestOptions` (challenge, allowCredentials for that user)
4. Client calls `navigator.credentials.get()`; user completes biometric/hardware prompt
5. Client sends assertion to `POST /auth/passkey/login/verify`
6. Server verifies assertion; updates `counter`; issues tokens

### 7.3 Backend

- Use **@simplewebauthn/server** (or `simplewebauthn`) – Fastify-compatible, handles challenge generation and verification
- **Relying Party:** Set `rpId` to your domain (e.g. `echo.example.com`); must match origin
- **Challenge:** Store in Redis/session with short TTL (e.g. 5 min); verify once
- **Counter:** Reject if assertion counter ≤ stored counter (replay protection)

### 7.4 UX

- **Passkey-first on register:** Prominent "Sign up with Passkey" / "Use Face ID" / "Use security key"
- **Fallback:** "Or sign up with email and password" for users without passkey support
- **Multiple credentials:** Allow user to add more passkeys later (e.g. second device, hardware key)
- **Passwordless optional:** Passkey-only account; or passkey + password for recovery

### 7.5 Safety

- Verify `origin` and `rpId` match
- Reject attestation if `challenge` not found or already used
- Rate-limit passkey endpoints (e.g. 10 / 15 min per IP)
- Log `passkey_register_success`, `passkey_login_success`, `passkey_login_fail` for audit

---

## 8. Optional: OAuth / Social Login

### 8.1 Providers

- **Google** – Broad support
- **GitHub** – Developer audience
- **Discord** – Aligns with Echo’s use case

### 8.2 Flow

1. Redirect to provider’s OAuth consent
2. Provider redirects back with `code`
3. Backend exchanges `code` for tokens, fetches profile
4. Create or link user, issue access + refresh tokens

### 8.3 Safety

- Validate `state` parameter to prevent CSRF
- Use PKCE if no backend secret (e.g. mobile)
- Store provider ID; allow linking multiple providers to one account
- Require email verification if email is new

---

## 9. Multi-Factor Authentication (MFA)

### 9.1 TOTP (Authenticator Apps)

- Use `otplib` or `speakeasy` for TOTP
- Generate secret, show QR code, user scans with app
- Require verification of one code before marking MFA enabled
- **Salt + hash TOTP secrets individually** – extra protection if DB is leaked; user experience unchanged

### 9.2 Step-Up Auth & Adaptive MFA

- **Force MFA challenge on sensitive changes** – email change, password change; no extra login friction, just step-up auth when needed
- **MFA on password reset:** If user has MFA, require MFA code at reset—email token alone is not enough
- **Adaptive MFA triggers:** Require MFA for logins from new countries/devices; skip for usual patterns – UX-friendly
- Require valid MFA before applying sensitive changes

### 9.3 Backup Codes

- Generate 8–10 **single-use**, **short-lived** codes on MFA setup (e.g. 90-day expiration)
- **Encrypted backup codes** – encrypt before storing; extra protection if DB is leaked; still single-use and transparent to user
- Store encrypted/hashed in DB; present to user once
- Each use revokes that code immediately
- **Revoke all backup codes on password reset** – ensures old backup codes can't bypass a new password
- **Per-code rate-limiting:** Max 3 backup-code attempts per 15 min per user to mitigate brute-force

### 9.4 Recovery

- Require password + backup code or support email to disable MFA
- Log MFA disable for audit

---

## 10. Security Monitoring & Logging

### 10.1 Audit Events

**Enhanced logging with minimal PII:** Log security events; avoid email/name in logs; use opaque IDs. **Anonymize IPs in logs but keep salted hashes** (e.g. HMAC-SHA256 with secret key) for anomaly detection – protects privacy while retaining security monitoring. **Hash or encode sensitive audit log fields** – still log for monitoring but protects PII if logs are compromised.

- `login_success` / `login_fail` (user ID, IP hash, user agent)
- `passkey_register_success` / `passkey_login_success` / `passkey_login_fail`
- `logout`
- `mfa_challenge_success` / `mfa_challenge_fail`
- `password_reset_requested` / `password_reset_completed` (include notification sent to sessions)
- `refresh_token_family_revoked` (potential theft)
- `account_locked`
- `token_revocation_check` (blocklist hit for stolen token)
- `socket_refresh_rate_limit_exceeded`
- `session_risk_flagged` (IP/UA change mid-session)
- `step_up_required` / `step_up_success` / `step_up_fail` (high-value event or flagged session)

### 10.2 Adaptive / Continuous Risk Scoring

**Contextual validation mid-session:** If the user's IP suddenly shifts (e.g. London → Tokyo) or the User-Agent changes mid-session, **silently flag the session in Redis** (e.g. `session:${userId}:risk_flagged`). Do not block immediately.

**Mandatory MFA on next action:** The next Socket.IO event or API call should check the flag. If set, require a **mandatory MFA challenge** before processing the request—even if the JWT is technically valid. Only clear the flag after successful MFA. Protects against session hijack or token theft used from a different location/device.

**In-session checks:** Compare IP/User-Agent per request against the session baseline (stored at login or first request). Flag on significant change (geo jump, UA mismatch). Use Redis for fast lookup; TTL aligned with session.

### 10.3 Anomaly Detection & Alerts

**Detect unusual patterns passively** – log and alert; don't block unless suspicious threshold crossed:

- Multiple failed logins (spike or sustained)
- Rapid token refreshes
- Unusual IP/device changes (e.g. refresh from different device+user-agent)
- **Repeated refresh token reuse from different IPs** – flag compromise early, silently
- **Login anomaly detection** – passive alert on unusual geolocation or device fingerprint; no UX impact unless threshold crossed
- Repeated token revocation blocklist hits
- Anomalous Socket.IO reconnect patterns

Consider **device fingerprinting for anomaly detection** – log fingerprint hashes; use for correlation; don't block unless threshold crossed. Alert admins or trigger silent MFA challenge on high-risk events.

**SIEM / log aggregation:** Integrate with SIEM or log aggregation; watch for patterns like brute-force, token abuse, or unexpected spikes.

### 10.4 Retention

- Keep login_events for 90+ days
- Comply with privacy policies for PII in logs

---

## 11. Implementation Phases

### Phase 1: Core Auth (Weeks 1–2)

1. Add `JWT_SECRET`, refresh secret, cookie config
2. Implement `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`
3. Add `users` columns and `refresh_tokens` table
4. Fastify JWT + cookie plugins; auth decorator
5. Socket handshake auth; replace `user_${random}`
6. Frontend: login/register screens, auth store, API interceptor, route guards

### Phase 2: Safety Hardening (Week 3)

1. Rate limiting on auth routes
2. Progressive throttling or CAPTCHA (no hard lockout)
3. Input validation (JSON schema)
4. Secure cookie configuration (SameSite=Lax)
5. Channel membership checks for Socket.IO
6. Socket handshake: JWT + refresh cookie fallback

### Phase 3: Recovery & Verification (Week 4)

1. Forgot / reset password
2. Email verification
3. `login_events` table and audit logging

### Phase 4: Passkeys & MFA (Optional, Weeks 5–6)

1. Passkey-first registration and login (WebAuthn)
2. TOTP setup and verify
3. Backup codes
4. Google/GitHub OAuth (optional)

---

## 12. Checklist Before Production

- [ ] BFF pattern: Vue never sees JWT; session cookie only; `credentials: 'include'`, no `Authorization` headers
- [ ] `REFRESH_TOKEN_SECRET`, `PASSWORD_PEPPER` strong, unique; secrets management in place
- [ ] **TLS 1.3** enforced; **HSTS** enabled; **certificate pinning** for mobile clients if applicable
- [ ] HTTPS enforced; Secure cookie flag set; SameSite=Lax (not Strict)
- [ ] Strict CORS + origin enforcement on auth endpoints (no wildcards)
- [ ] Payload size limits and strict input validation on auth routes
- [ ] Rate limiting on all auth endpoints
- [ ] Progressive throttling or CAPTCHA (no hard lockout)
- [ ] Refresh token: 45-day no-activity hard logout; rotation and family revocation tested
- [ ] Access token blocklist in Redis with EXPIRE/TTL = remaining token life (O(1), no bloat)
- [ ] Channel access checks on Socket.IO
- [ ] Socket.IO refresh anti-abuse measures
- [ ] Audit logging for security events (minimal PII)
- [ ] Password policy: min length + blocklist (no complexity checklist); strength meter; pepper
- [ ] Backup codes expire and are rate-limited
- [ ] Error messages do not leak user existence (generic auth failures everywhere)
- [ ] Step-up MFA on sensitive changes (email/password)
- [ ] MFA required on password reset when user has MFA enabled
- [ ] On password change: email + Socket.IO notification to all active sessions
- [ ] 24-hour cooling period after password reset (block email change, financial/admin actions)
- [ ] Refresh token grace period (10–30 s) for multi-tab race condition
- [ ] Database cleanup job (expired tokens, logs >90 days)
- [ ] Socket.IO: JWT + refresh cookie fallback (server validates session without client re-auth shuffle)
- [ ] JWT `aud` claim verified; HMAC for refresh token verification
- [ ] Reject deprecated TLS at app level; strict Content-Type enforcement
- [ ] Per-event auth check and replay detection on Socket.IO; event-level rate limits
- [ ] In-session step-up for high-value Socket.IO events (deleteChannel, adminAction)
- [ ] Adaptive risk scoring: flag session in Redis on IP/UA change; mandatory MFA on next action
- [ ] Backup codes revoked on password reset; encrypted storage
- [ ] Password reuse prevention; session limits (optional)
- [ ] Passkey registration and login (WebAuthn) – rpId, challenge TTL, counter validation
- [ ] **Fort Knox:** Ed25519 JWT signing; HSM/KMS (no raw key in memory); TDE for sensitive tables
- [ ] **Fort Knox:** Honey-token cookie + verify header; `security_version` for instant revocation
- [ ] **Fort Knox:** Idempotent refresh; synthetic latency on auth failures; heartbeat re-auth on Socket.IO
- [ ] **Fort Knox:** Canary accounts; ASN/data-center blocking for `/auth/*`
- [ ] `.env` never committed; `.env.example` documents all vars

---

## 13. Fort Knox Hardening (Edge Cases & Absolute Certainty)

_Addresses partial compromise, infrastructure-level attacks, and sophisticated session hijacking._

### 13.1 Infrastructure & Cryptographic Rigor

- **Ed25519 (EdDSA):** Use instead of RS256 for JWT signing. Keys are 32 bytes, signatures are faster, and mathematically more resilient to side-channel attacks.
- **HSM/KMS:** Do not store `JWT_PRIVATE_KEY` as a raw string. Use Cloud KMS (AWS/GCP/Azure) to sign tokens. The private key should never exist in the BFF's application memory—only the "request to sign" goes to KMS.
- **TDE (Transparent Data Encryption):** Ensure PostgreSQL uses TDE for `webauthn_credentials` and `users` tables. A physical disk or snapshot leak is useless without the master key.

### 13.2 Advanced Session Shielding

**Honey-token cookie:** Set a second cookie `__Host-Echo-Verify` that is **not** HttpOnly (accessible to JS). Have the Vue app compute a hash of this cookie and send it in a custom header (e.g. `X-Echo-Verify`). BFF validates the hash matches. If an attacker proxies requests (SSRF or XSS), they cannot easily read both the JS-accessible cookie and the HttpOnly session cookie simultaneously to recreate the valid header/cookie pair.

**TLS Channel Binding (RFC 8471):** If the environment supports it, use Token Binding to cryptographically bind the session cookie to the specific TLS connection. Makes "cookie carrying" (copy-pasting a cookie to another machine) impossible.

### 13.3 Panic Button & Nuclear Revocation

**Global sequence ID (`security_version`):** Add to `users` table; include in JWT claims. When the user clicks "Logout all devices," increment this number. BFF compares `token.version === user.security_version`. Instant global revocation without checking a Redis blocklist on every request.

**Nuclear option route:** Create an internal (VPN-only) endpoint that can invalidate all sessions created within a specific time window (e.g. "Invalidate all sessions created between 2:00 PM and 3:00 PM today") for coordinated credential stuffing or compromise response.

### 13.4 Resilience: Multi-Tab & Network Flaps

**Idempotent refresh:** Beyond the grace period, make `/auth/refresh` idempotent for a given `family_id`. If multiple tabs hit refresh at the same millisecond, the server recognizes the collision and returns the **exact same** new token set to all—rather than flagging it as a theft attempt.

**Synthetic latency on failures:** For all failed auth attempts, add a random delay between 200–500 ms before responding. Prevents timing attacks to determine if a username exists or where validation failed.

### 13.5 Socket.IO Hardening

**Heartbeat re-auth:** Every 30 minutes, emit `server:reauth` over the socket. If the client does not respond with a BFF-verified session within 10 seconds, drop the connection.

**Message entropy check:** For chat messages, implement a server-side **Shannon entropy** check. If a socket emits high-frequency, low-entropy (random junk) or highly repetitive messages, auto-quarantine the session.

### 13.6 Observability as a Security Layer

**Canary (honeypot) accounts:** Create accounts with obvious passwords (e.g. `admin@echo.com`). Any login attempt triggers an immediate PagerDuty/Slack alert to engineering.

**ASN/Data center blocking:** Use a firewall (Cloudflare, Caddy `remote_ip` matchers, etc.) to block traffic to `/auth/*` from known VPN/Tor/data-center IP ranges—unless the user opts into "High Privacy Mode." Most automated attacks originate from DigitalOcean/AWS IPs, not residential ISPs.

---

## 14. References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [CWE-287: Improper Authentication](https://cwe.mitre.org/data/definitions/287.html)
- [JWT Best Practices (RFC 8725)](https://datatracker.ietf.org/doc/html/rfc8725)
- [RFC 8471: Token Binding](https://datatracker.ietf.org/doc/html/rfc8471)
- [Argon2 (Password Hashing Competition winner)](https://github.com/p-hash/phc-winner-argon2)
- [NIST SP 800-63B: Memorized Secrets](https://pages.nist.gov/800-63-3/sp800-63b.html) – length over complexity
- [WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/) / [@simplewebauthn/server](https://github.com/MasterKale/SimpleWebAuthn)
