# Our Tech Stack for Echo

This document outlines the core technologies and infrastructure choices for building Echo.

## Plan updates

Dated changes to the architecture plan (newest first):

- **2026-04-06 — Planned native clients:** Target **Flutter** for **mobile** (iOS / Android) and **Tauri** for **desktop** (Windows, macOS, Linux). The **Vue 3 + Vite** app remains the primary web client; these shells are for a later phase when we want store-distributed apps and OS-level integration. See [Future client shells (planned)](#future-client-shells-planned).
- **2026-04-01 — Single-node first, distributed at scale:** Echo **optimizes for a single Node API process** (one primary realtime tier, in-memory Socket.IO adapter, co-located assumptions). **Multi-instance** Socket.IO (`NATS_URL` adapter), shared rate limits, Redis-grade presence across replicas, and broader **distributed-system** work are **explicitly deferred** until the product reaches on the order of **~50,000 average concurrent users** (CCU-style simultaneous usage — exact definition TBD with ops). Until then, vertical scale, query/index tuning, and observability beat horizontal complexity. See `[docs/infra/realtime-scaling.md](../infra/realtime-scaling.md)` and `[STATUS_AND_PRODUCTION_READINESS.md](../reviews/STATUS_AND_PRODUCTION_READINESS.md)`.
- **2026-04-01 — Social graph + presence polish:** Pending friend requests are exposed at `**GET /api/v1/echo/friends/requests`** with `**POST .../friends/decline`** and `**POST .../friends/cancel**`; the client hydrates them in real mode. **Per-process** socket ref-counting avoids marking a user offline when one tab disconnects while another remains on the same API process; **stale presence sweep** emits `**presence:update`** for users moved to `offline` (see `[docs/infra/realtime-scaling.md](../infra/realtime-scaling.md)`).
- **2026-04-01 — Optional NATS for Socket.IO:** The backend can attach `**@mickl/socket.io-nats-adapter`** when `**NATS_URL`** is set (`attachSocketAdapterIfConfigured`in`backend/src/bootstrap/socket.ts`). This is **multi-instance WebSocket fan-out**, not the full deferred **JetStream / platform NATS** story. See `[docs/infra/realtime-scaling.md](../infra/realtime-scaling.md)`.
- **2026-03-27 — Safety + 1:1 DMs (Echo):** User **block/unblock** and **reports** live under `/api/v1/echo` (see contract doc). **Direct messages** use persisted DM channels (`POST /dm/open`, `GET /dm/threads`); opening or using a DM with a blocked peer is rejected server-side. Frontend: profile ⋯ menu (copy user ID, report, block/unblock) on expanded profile, DM side panel profile, and member popout.
- **2026-04-04 — SFU with LiveKit**: Group voice/video **Selective Forwarding Unit (SFU)** media forwarding is powered by **LiveKit**. The voice infrastructure is split into a stable transport substrate ([Layer 1](../infra/architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)) and an intelligent control layer ([Layer 2](../infra/architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)).
- **2026-03-24 — Realtime without NATS (start)**: The **initial** realtime stack is **Socket.IO only** on the Node backend. **NATS** and the **Socket.IO NATS adapter** are **out of scope for the start** and will be reconsidered when horizontal scaling or cross-service messaging needs them.

## Frontend – Vue 3

- **Vue 3 + Vite**: For a reactive user interface, fast development, and optimized bundling with tree-shaking.
- **Pinia**: Our chosen state management library for Vue 3, offering a simple and type-safe way to manage application state.
- **Tailwind CSS (JIT mode)**: A utility-first CSS framework enabling rapid UI development. We follow a **90/10 principle**: ~90% of styling (layouts, typography, colors, standard UI) is handled by Tailwind to ensure a minimal CSS payload and fast iteration.
- **SCSS (Sass)**: Used for the remaining ~10% of styling. Reserved for complex keyframe animations, highly custom pseudo-elements, bespoke interactive states, and organizing styles that are too unwieldy for pure utility classes.
- **TypeScript**: To ensure type safety, improve code maintainability, and catch errors early in the development cycle.
- **WebSocket client**: For real-time communication with the backend for chat messages, presence updates, and notifications.
- **In-app URLs (History API, no Vue Router):** The shell syncs in-app paths such as `/explore`, `/channels/@me`, `/channels/@me/c/<channelId>`, and `/channels/<serverId>/<channelId>`, plus optional `?settings=` and `?guild_settings=` / `?guild_section=` for modals. **Static hosting and reverse proxies** must serve `index.html` for those paths (SPA fallback) so deep links and reloads work; Vite dev server does this by default.

### Frontend Performance Tweaks:

- **Lazy-load all routes and components**: Improve initial load times by only loading necessary code when it's needed.
- **Inline critical CSS for above-the-fold content**: Render the most important UI elements quickly.
- **Use WebP images**: For optimized image delivery and faster loading.
- **System fonts with fallback**: Prioritize native system fonts for speed, with robust fallbacks.
- **Virtual lists for chat histories**: Efficiently render long lists of messages without performance degradation.

## Future client shells (planned)

These are **not** the current shipping stack; the live product is the **Vue 3 SPA** in `frontend/`. They are the intended direction for packaged clients.

- **Flutter (mobile)**: Planned for **iOS and Android** — native UX, push notifications, and background behavior where the web platform is limited. Would consume the same Echo **REST + Socket.IO + LiveKit** contracts as the web app.
- **Tauri (desktop)**: Shell under `src-tauri/` (`npm run tauri:dev` / `npm run tauri:build`). Platform merges: **Windows** [desktop-windows.md](../operations/desktop-windows.md), **Linux** [desktop-linux.md](../operations/desktop-linux.md), **macOS** [desktop-macos.md](../operations/desktop-macos.md) — `tauri.windows.conf.json`, `tauri.linux.conf.json`, `tauri.macos.conf.json`.

Related: the SPA can optionally show an Echo **screen-share settings** modal when `VITE_SCREEN_SHARE_CONFIG_MODAL=true` (e.g. desktop builds); default **browser** builds skip it and defer to the OS capture picker (`frontend/src/config/screenShareUi.ts`).

## Backend – Real-time & API

- **Node.js + Fastify**: A lightweight and high-performance HTTP server framework for building our RESTful APIs.
- **Socket.IO**: The primary library for real-time, bidirectional, event-based communication (chat, presence, notifications). **Default and target for the foreseeable product phase:** in-memory adapter (**one** API process) — see **Scale strategy** below. **Optional multi-instance:** set `**NATS_URL`** to attach the **Socket.IO NATS adapter** (see [Plan updates](#plan-updates) and `[realtime-scaling.md](../infra/realtime-scaling.md)`); treat this as **exception / pre-50k-CCU experiments** unless metrics justify it. **JetStream\*\* and broader NATS-based platform messaging remain a later phase.
- **REST API**: Developed using Fastify for handling core functionalities like user authentication, server management, channel creation, and user settings.

## Database

- **PostgreSQL**: A powerful, open-source object-relational database system used for storing relational data such as users, servers, channels, and chat messages.
- **NATS JetStream** (deferred): Planned for a later phase—**durable** event fan-out, async job queues, and richer platform messaging. **Basic NATS** for the **Socket.IO adapter** is already optional via `**NATS_URL`\*\* (see [Plan updates](#plan-updates)); JetStream-specific usage is not required for that adapter path.
- **MockDB (dev-only):** In-memory data (`backend/src/db/mockdb.ts`) when `**ECHO_BACKEND_STORAGE=memory`**. `**/api/v1/mock/\*`is registered only when`NODE_ENV`is not production and`ALLOW_MOCK_API=true`.** Production requires `**ECHO_BACKEND_STORAGE=postgres`** + `DATABASE_URL` and does not register mock routes. For a real workspace without the mock UI, use `npm run seed:dev` against a running API (see root `package.json`).

## Voice / Video

- **LiveKit Server (Layer 1)**: The core **Selective Forwarding Unit (SFU)** providing stable, predictable WebRTC media routing, simulcast/SVC, and congestion control. It acts as a dumb transport engine without product intelligence. See `[LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md](../infra/architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)`.
- **Echo Voice Intelligence Sidecar (Layer 2)**: A separate control and policy plane that guides user experience, calculates smoothed quality state, and issues minimal diff-based control actions to LiveKit. See `[ECHO_VOICE_INTELLIGENCE_LAYER.md](../infra/architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)`.
  - **NAT Traversal**: Handled via TURN/STUN integration in the Voice Node (Layer 1).
  - **Signaling**: Token minting and room access control occur in the Echo API, but LiveKit manages the WebRTC signaling connection.
- **Client-side mic processing (Echo SPA)**: Users can choose **Enhanced (Krisp)** via `@livekit/krisp-noise-filter` on the local mic track, **Standard (browser)** WebRTC echo/NS/AGC toggles, or **Minimal** (requested `echoCancellation` / `noiseSuppression` / `autoGainControl` off — **not** guaranteed raw; OS/drivers may still apply DSP). In Krisp mode, browser **noise suppression stays off** so Krisp is the only noise suppressor (avoids double processing). Krisp is subject to **LiveKit / Krisp licensing** for distribution and production use; see [LiveKit noise cancellation](https://docs.livekit.io/home/client/tracks/noise-cancellation/). If Krisp fails to load for a session, the client falls back to **browser** capture for that session only and does not overwrite the saved preference.

## Scale strategy (single node vs distributed)

- **Primary goal:** **Maximize efficiency and reliability on a single Node + Postgres deployment** (vertical scale, connection limits, DB indexes, caching at the edge, Prometheus/Grafana, runbooks).
- **Distributed / multi-node push:** Planned as a **major program** only after reaching on the order of **~50,000 average concurrent users** (CCU — simultaneous active users; refine with product/analytics). Below that threshold, prefer **one** realtime writer and avoid operational surface from split-brain presence, cross-node rate limits, and adapter staging.
- **NATS / multiple API replicas** remain **supported in code** for teams that need them early, but they are **not** the default optimization target until the threshold above.

## Hosting / Infrastructure

- **Frontend**: **Vercel** for hosting the Vue 3 application, leveraging its global CDN for instant load times and excellent performance.
- **Backend**: **Strato VPS** for initial hosting of the Node.js Fastify backend and PostgreSQL database. **Render** is a consideration for future migration to managed infrastructure.
- **NATS** (deferred): When adopted, candidates include **Synadia NGS**, **NATS Cloud**, or self-hosted NATS with JetStream—not required for the initial Socket.IO-only phase.

## Cross-Cutting Concerns

- **DevOps / CI/CD**: **GitLab CI** (see root `.gitlab-ci.yml`) for automated quality gates (e.g. Prettier on touched paths). Build/test scripts are **npm workspaces** (`frontend`, `backend`, `bot`).
  - **Frontend unit tests**: **Vitest** (`npm run test -w frontend`, `src/**/*.test.ts`).
  - **Backend integration / contract tests**: **ts-node** scripts under `backend/src/tests/` (e.g. `npm run test:echo:pipeline -w backend`); not a unified Jest suite.
  - **End-to-end (local)**: **Cypress** (`npm run test:e2e` from repo root with `dev:e2e` — memory backend + Vite on `:8080`; not required in CI today).
- **Authentication & Security**: **JWT (JSON Web Tokens)** for stateless authentication, combined with **bcrypt** for secure password hashing. We will enforce **HTTPS** across all communications, implement robust input validation, and use secure cookie handling.
- **Rate Limiting**: Implemented on the backend using in-memory counters or **PostgreSQL** to track and limit incoming requests per user or IP address. NATS-based options remain possible if we add NATS later.
- **File Storage**: **Cloudflare R2** for highly scalable, durable, and secure object storage of user-uploaded assets like avatars and attachments. S3-compatible API with no egress fees.
- **Logging**: **Pino** for efficient, structured JSON logging in the Node.js backend, enabling easy log aggregation and analysis.
- **Monitoring**: **Prometheus** for collecting time-series metrics from the backend services and **Grafana** for visualizing these metrics through dashboards and configuring alerts for proactive incident detection.

## Current Progress Snapshot (Auth)

### Done (Backend + first-party SPA)

- **Option A — BFF-style sessions**: HttpOnly `**echo_sid`** maps to **Redis** (or single-process memory fallback) for hot session state; `**echo_rt`** carries refresh token (hashed in Postgres). **Double-submit CSRF** on mutating `/api/v1/\*`(exempt login/register/guest/refresh/MFA/forgot/reset/passkey prefixes per`enforceApiCsrf`).
- **First-party Vue client** sends `**credentials: 'include'`** and does **not** store access JWTs in `localStorage`. `**AUTH_LEGACY_BEARER=true`\*\* re-enables Bearer + JWT handshake for tooling only.
- **Auth surface** (non-exhaustive): register/login/MFA/guest/refresh/logout/me/sessions/revoke, **forgot-password / reset-password** (TOTP step-up on reset when 2FA enabled), **WebAuthn** `POST /passkey/register|login/*`, Discord OAuth, phone/TOTP flows unchanged in spirit.
- **Schema**: `auth_password_reset_tokens`, `auth_login_events`, `auth_webauthn_credentials`; login/passkey/password-reset events recorded with short **SHA-256 digests** of IP and User-Agent.
- **Jobs**: `login_events` pruning on a timer (`ECHO_LOGIN_EVENTS_RETENTION_DAYS`, `ECHO_LOGIN_EVENTS_RETENTION_INTERVAL_MS`).
- **Access JWT**: still used for legacy/tooling paths; default access TTL shortened (e.g. `**JWT_EXPIRES_IN=15m`\*\*).
- **Socket.IO identity** (`resolveSocketIdentity`): prefers **cookie session** (`echo_sid` → Redis → refresh row); falls back to **JWT in handshake** only when `**authLegacyBearer`** is enabled. Client uses `**withCredentials: true`**. Stricter `**AUTH_REQUIRE_SOCKET_TOKEN**` behavior applies when configured; align cookie visibility with same-site / proxy deployment.
- **REST `requireAuth`**: resolves user from server session first; optional Bearer if legacy flag set.
