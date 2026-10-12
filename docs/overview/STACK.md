# Tech stack

Core technologies and infrastructure choices for Echo.

## Scale strategy

Echo optimizes for a **single Bun API process** first: one primary realtime tier,
in-memory Socket.IO adapter, co-located assumptions. Multi-instance Socket.IO
(`NATS_URL` adapter), shared rate limits, and cross-replica presence are
**deferred** until roughly **~50k average concurrent users**. Until then, prefer
vertical scale, query/index tuning, and observability over horizontal complexity.
See [realtime-scaling.md](../infra/realtime-scaling.md).

## Frontend — Vue 3

- **Vue 3 + Vite** — SPA and PWA under `clients/web/`
- **Pinia** — client state
- **Tailwind CSS v4** — utility-first styling (~90%); SCSS for animations / complex states
- **TypeScript**
- **Socket.IO client** — chat, presence, notifications
- **History API navigation** (no Vue Router) — paths such as `/explore`,
  `/channels/@me`, `/channels/<serverId>/<channelId>`, plus settings query params.
  Proxies must SPA-fallback to `index.html`.

### Frontend performance

Lazy-load heavy views, WebP assets, virtualized chat lists, system fonts with fallback.

## Native clients

First-party native apps (not a WebView shell):

| Platform    | Entry                                                      |
| ----------- | ---------------------------------------------------------- |
| iOS / macOS | [`clients/apple/README.md`](../../clients/apple/README.md) |

Passkeys / Universal Links: [ios-passkeys.md](../operations/ios-passkeys.md).

## Backend — API & realtime

- **Bun + Fastify** — REST API (`server/backend/`)
- **Socket.IO** — primary realtime transport. Default: in-memory adapter (one process).
  Optional multi-instance: set **`NATS_URL`** for the Socket.IO NATS adapter.
- **media sidecar** — signed GET delivery for uploads (`server/media/`). See
  [media-cdn.md](../operations/media-cdn.md).

## Database

- **PostgreSQL** — durable store (`ECHO_BACKEND_STORAGE=postgres` + `DATABASE_URL`)
- Optional **in-memory** store for local experiments (`ECHO_BACKEND_STORAGE=memory`) — not for production

## Auth & identity

Session-oriented auth with refresh tokens; optional Discord/Google OAuth when configured.
Public entity IDs are **decimal snowflakes** (see [ADR 002](../adr/002-echo-public-snowflake-ids.md));
`auth_users.id` stays UUID-shaped.

## Voice & video

- **LiveKit** SFU for server voice/video
- TURN / ICE: [livekit-turn.md](../infra/livekit-turn.md)
- Production checklist: [livekit-production.md](../operations/livekit-production.md)
- Optional voice E2EE: [voice-e2ee-livekit.md](../operations/voice-e2ee-livekit.md)

## Object storage

S3-compatible storage when **`ECHO_S3_*`** is set (uploads, media, backups).

## Tooling

| Concern                   | Choice                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Package manager / runtime | **Bun 1.4.2+** (workspaces, `bun.lock`)                    |
| Tests                     | Vitest (web), `bun test` / workspace scripts (backend)     |
| Format                    | Prettier (`bun run format`)                                |
| Lint                      | ESLint + Stylelint (web)                                   |
| CI                        | GitHub Actions (public); GitLab mirror for internal `main` |

## Example deployment (maintainers’ reference)

Operators typically terminate TLS at a reverse proxy (Caddy/nginx), run the API
under systemd/PM2, and point DNS at that host. See
[linux-vps-deployment.md](../operations/linux-vps-deployment.md) and
[PRODUCTION_SECURITY_CHECKLIST.md](../operations/PRODUCTION_SECURITY_CHECKLIST.md).
