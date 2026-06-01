# Our Tech Stack for Echo

This document outlines the core technologies and infrastructure choices for building Echo.

**Last reviewed:** 2026-06-01

## Plan updates

Dated changes to the architecture plan (newest first):

- **2026-06-01 — Documentation refresh:** Native clients section updated — **Tauri** ships on desktop (Windows, macOS, Linux), **Android**, and **iOS**; Flutter is not in the tree. GitHub Actions is the authoritative CI; GitLab CI is a Prettier mirror only. Example hosting notes moved under [Example deployment](#example-deployment-maintainers-reference).
- **2026-04-06 — Native clients (Tauri):** Packaged clients use **Tauri** shells around the Vue 3 SPA — desktop and mobile. See [Native client shells (Tauri)](#native-client-shells-tauri).
- **2026-04-01 — Single-node first, distributed at scale:** Echo **optimizes for a single Node API process** (one primary realtime tier, in-memory Socket.IO adapter, co-located assumptions). **Multi-instance** Socket.IO (`NATS_URL` adapter), shared rate limits, Redis-grade presence across replicas, and broader **distributed-system** work are **explicitly deferred** until the product reaches on the order of **~50,000 average concurrent users** (CCU-style simultaneous usage — exact definition TBD with ops). Until then, vertical scale, query/index tuning, and observability beat horizontal complexity. See [realtime-scaling.md](../infra/realtime-scaling.md) and [STATUS_AND_PRODUCTION_READINESS.md](../reviews/STATUS_AND_PRODUCTION_READINESS.md).
- **2026-04-01 — Social graph + presence polish:** Pending friend requests are exposed at **GET /api/v1/echo/friends/requests** with **POST …/friends/decline** and **POST …/friends/cancel**; the client hydrates them in real mode. **Per-process** socket ref-counting avoids marking a user offline when one tab disconnects while another remains on the same API process; **stale presence sweep** emits **presence:update** for users moved to `offline` (see [realtime-scaling.md](../infra/realtime-scaling.md)).
- **2026-04-01 — Optional NATS for Socket.IO:** The backend can attach **@mickl/socket.io-nats-adapter** when **NATS_URL** is set (`attachSocketAdapterIfConfigured` in `backend/src/bootstrap/socket.ts`). This is **multi-instance WebSocket fan-out**, not the full deferred **JetStream / platform NATS** story. See [realtime-scaling.md](../infra/realtime-scaling.md).
- **2026-03-27 — Safety + 1:1 DMs (Echo):** User **block/unblock** and **reports** live under `/api/v1/echo` (see contract doc). **Direct messages** use persisted DM channels (`POST /dm/open`, `GET /dm/threads`); opening or using a DM with a blocked peer is rejected server-side. Frontend: profile ⋯ menu (copy user ID, report, block/unblock) on expanded profile, DM side panel profile, and member popout.
- **2026-04-04 — SFU with LiveKit:** Group voice/video **Selective Forwarding Unit (SFU)** media forwarding is powered by **LiveKit**. The voice infrastructure is split into a stable transport substrate ([Layer 1](../infra/architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)) and an intelligent control layer ([Layer 2](../infra/architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)).
- **2026-03-24 — Realtime without NATS (start):** The **initial** realtime stack is **Socket.IO only** on the Node backend. **NATS** and the **Socket.IO NATS adapter** were out of scope for the start and are reconsidered when horizontal scaling or cross-service messaging needs them.

## Frontend – Vue 3

- **Vue 3 + Vite:** Reactive UI, fast development, and optimized bundling with tree-shaking.
- **Pinia:** State management for Vue 3 — simple and type-safe.
- **Tailwind CSS v4:** Utility-first styling. We follow a **90/10 principle**: ~90% of styling (layouts, typography, colors, standard UI) via Tailwind; the rest in SCSS for animations, pseudo-elements, and complex states.
- **SCSS (Sass):** Reserved for keyframe animations, bespoke interactive states, and styles too unwieldy for pure utility classes.
- **TypeScript:** Type safety and early error detection across the SPA.
- **WebSocket client:** Real-time chat, presence, and notifications via Socket.IO.
- **In-app URLs (History API, no Vue Router):** The shell syncs paths such as `/explore`, `/channels/@me`, `/channels/@me/c/<channelId>`, and `/channels/<serverId>/<channelId>`, plus optional `?settings=` and `?guild_settings=` / `?guild_section=` for modals. **Static hosting and reverse proxies** must serve `index.html` for those paths (SPA fallback) so deep links and reloads work; Vite dev server does this by default.

### Frontend performance

- **Lazy-load views and heavy components** where practical.
- **WebP images** for optimized delivery.
- **System fonts with fallback** for fast first paint.
- **Virtual lists** for long chat histories.

## Native client shells (Tauri)

The **Vue 3 SPA** in `frontend/` is the shared UI for web and native builds. **Tauri** wraps it for installed apps:

| Platform | Entry                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Windows  | [desktop-windows.md](../operations/desktop-windows.md) — `tauri.windows.conf.json` |
| macOS    | [desktop-macos.md](../operations/desktop-macos.md) — `tauri.macos.conf.json`       |
| Linux    | [desktop-linux.md](../operations/desktop-linux.md) — `tauri.linux.conf.json`       |
| Android  | [android-tauri.md](../operations/android-tauri.md) — `tauri.android.conf.json`     |
| iOS      | [ios-tauri.md](../operations/ios-tauri.md) — `tauri.ios.conf.json`                 |

Build from repo root: `npm run tauri:dev` / platform-specific scripts in `package.json`. Release artifact paths: [`releases/README.md`](../../releases/README.md).

Related: the SPA can optionally show an Echo **screen-share settings** modal when `VITE_SCREEN_SHARE_CONFIG_MODAL=true` (e.g. desktop builds); default **browser** builds skip it and defer to the OS capture picker (`frontend/src/config/screenShareUi.ts`).

## Backend – Real-time & API

- **Node.js + Fastify:** High-performance HTTP server for REST APIs.
- **Socket.IO:** Primary realtime transport (chat, presence, notifications). **Default:** in-memory adapter (**one** API process) — see **Scale strategy** below. **Optional multi-instance:** set **NATS_URL** to attach the **Socket.IO NATS adapter** (see [Plan updates](#plan-updates) and [realtime-scaling.md](../infra/realtime-scaling.md)); treat as **exception / pre-50k-CCU experiments** unless metrics justify it. **JetStream** and broader NATS-based platform messaging remain a later phase.
- **REST API:** User authentication, server management, channel creation, settings, and Echo domain routes.

## Database

- **PostgreSQL:** Users, servers, channels, messages, auth, and Echo graph data.
- **NATS JetStream** (deferred): Durable event fan-out, async job queues, and richer platform messaging. **Basic NATS** for the **Socket.IO adapter** is optional via **NATS_URL** (see [Plan updates](#plan-updates)); JetStream is not required for that adapter path.
- **MockDB (dev-only):** In-memory data (`backend/src/db/mockdb.ts`) when **ECHO_BACKEND_STORAGE=memory**. **`/api/v1/mock/*`** is registered only when `NODE_ENV` is not production and `ALLOW_MOCK_API=true`. Production requires **ECHO_BACKEND_STORAGE=postgres** + `DATABASE_URL` and does not register mock routes. For a real workspace without the mock UI, use `npm run seed:dev` against a running API (see root `package.json`).

## Voice / Video

- **LiveKit Server (Layer 1):** Core **SFU** for WebRTC media routing, simulcast/SVC, and congestion control. See [LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md](../infra/architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md).
- **Echo Voice Intelligence Sidecar (Layer 2):** Control and policy plane for UX quality and minimal diff-based actions to LiveKit. See [ECHO_VOICE_INTELLIGENCE_LAYER.md](../infra/architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md).
  - **NAT traversal:** TURN/STUN in the voice stack (Layer 1).
  - **Signaling:** Token minting and room access control in the Echo API; LiveKit manages WebRTC signaling.
- **Client-side mic processing:** **Enhanced (Krisp)** via `@livekit/krisp-noise-filter`, **Standard (browser)** WebRTC NS/AGC toggles, or **Minimal** (requested DSP off — not guaranteed raw). Krisp mode keeps browser noise suppression off to avoid double processing. See [LiveKit noise cancellation](https://docs.livekit.io/home/client/tracks/noise-cancellation/). Krisp licensing applies for production distribution.

## Scale strategy (single node vs distributed)

- **Primary goal:** Maximize efficiency on a **single Node + Postgres** deployment (vertical scale, connection limits, DB indexes, edge caching, Prometheus/Grafana, runbooks).
- **Distributed / multi-node:** A **major program** only after on the order of **~50,000 average concurrent users** (CCU). Below that threshold, prefer **one** realtime writer.
- **NATS / multiple API replicas** remain **supported in code** for teams that need them early, but are **not** the default optimization target until the threshold above.

## Example deployment (maintainers' reference)

Self-hosters run Echo on **their own** VPS, cloud VM, or bare metal — see [linux-vps-deployment.md](../operations/linux-vps-deployment.md). The maintainers' reference deployment (documented in `.env.example` comments as **chat-echo.com**) uses, among other choices:

- **SPA:** static hosting behind a reverse proxy (CDN optional).
- **API + Postgres:** VPS or managed Postgres.
- **Object storage:** S3-compatible bucket (e.g. Cloudflare R2) when **`ECHO_S3_*`** is set.
- **Voice:** self-hosted or managed LiveKit + TURN.

Your fork should point `VITE_*`, `CORS_ORIGIN`, and related settings at **your** hosts — you are not required to mirror this layout.

## Cross-cutting concerns

- **DevOps / CI/CD:** **GitHub Actions** (`.github/workflows/`) is the **authoritative** CI for the public repository. Root `.gitlab-ci.yml` is a **Prettier-only mirror** for private GitLab remotes. Build/test scripts are **npm workspaces** (`frontend`, `backend`, `bot`, …).
  - **Frontend unit tests:** **Vitest** (`npm run test -w frontend`).
  - **Backend integration / contract tests:** scripts under `backend/src/tests/` (e.g. `npm run test:echo:pipeline -w backend`).
  - **End-to-end:** **Cypress** smoke (`npm run test:e2e`) runs in [echo-e2e-ci.yml](../../.github/workflows/echo-e2e-ci.yml) on relevant PRs; not a full product E2E grid.
- **Authentication & security:** Cookie sessions (Option A BFF), bcrypt password hashing, HTTPS enforcement in production, input validation, CSRF on mutating routes.
- **Rate limiting:** In-memory counters and/or **PostgreSQL** per user or IP; NATS-based options possible later.
- **File storage:** S3-compatible presigned PUT when **`ECHO_S3_*`** is configured (`ECHO_S3_BUCKET`, region, keys).
- **Logging:** **Pino** structured JSON logs with request correlation.
- **Monitoring:** **Prometheus** metrics at `GET /api/v1/metrics`; starter **Grafana** dashboard in `monitoring/grafana/`.

## Current progress snapshot (Auth)

### Done (backend + first-party SPA)

- **Option A — BFF-style sessions:** HttpOnly **`echo_sid`** maps to **Redis** (or single-process memory fallback); **`echo_rt`** carries refresh token (hashed in Postgres). **Double-submit CSRF** on mutating `/api/v1/*` (exempt login/register/guest/refresh/MFA/forgot/reset/passkey prefixes per `enforceApiCsrf`).
- **First-party Vue client** sends **`credentials: 'include'`** and does **not** store access JWTs in `localStorage`. **`AUTH_LEGACY_BEARER=true`** re-enables Bearer + JWT handshake for tooling only.
- **Auth surface** (non-exhaustive): register/login/MFA/guest/refresh/logout/me/sessions/revoke, forgot/reset password (TOTP step-up on reset when 2FA enabled), **WebAuthn** passkeys, Discord OAuth, phone/TOTP flows.
- **Schema:** `auth_password_reset_tokens`, `auth_login_events`, `auth_webauthn_credentials`; login events with short **SHA-256 digests** of IP and User-Agent.
- **Jobs:** `login_events` pruning (`ECHO_LOGIN_EVENTS_RETENTION_DAYS`, `ECHO_LOGIN_EVENTS_RETENTION_INTERVAL_MS`).
- **Access JWT:** legacy/tooling paths only; default access TTL shortened (e.g. **`JWT_EXPIRES_IN=15m`**).
- **Socket.IO identity** (`resolveSocketIdentity`): prefers **cookie session** (`echo_sid` → Redis → refresh row); falls back to **JWT in handshake** only when **`authLegacyBearer`** is enabled. Client uses **`withCredentials: true`**. Align cookie visibility with same-site / proxy deployment.
- **REST `requireAuth`:** resolves user from server session first; optional Bearer if legacy flag set.
