# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Changed

- **Documentation:** README quick start, TOC, and expanded CI badges; STACK mobile strategy updated (Tauri ships on desktop, Android, and iOS); root doc link and markdown fixes; ADR index; `releases/ios.md`; deduplicated `domain-map.md`; tree generator excludes runtime `logs/` paths.

---

## [1.0.0] — 2026-05-14

Initial open-source release under AGPL-3.0-only.

### Added

**Core platform**

- Real-time chat with servers, channels, and 1:1 / group DMs (Socket.IO + Fastify)
- RBAC: roles, permission overwrites, `@everyone`, Administrator and Moderator seeds per server
- Snowflake IDs for message ordering with deterministic tie-breaking (no `created_at` for feed sort)
- Server-scoped message search (Postgres ILIKE + trigram index, membership-filtered, 60 req/min rate limit)
- Message reactions, pins, read cursors, edits, soft-deletes, and idempotency tokens
- E2EE envelope support on message payloads (device-owned key pairs, wire validation)
- CSAM scan service integration hook
- Attachment uploads via presigned S3 PUT (`ECHO_S3_*` when configured)

**Auth**

- Email/password with TOTP 2FA (AES-256-GCM encrypted secrets at rest)
- SMS OTP with HMAC replay protection
- Google OAuth and Discord OAuth (link/unlink, shadow merge)
- Passkey (WebAuthn) registration and login
- Desktop OAuth bridge handoff (Tauri shell)
- Recovery codes, session revocation, and production config gates

**Voice and video**

- LiveKit SFU integration: join tokens, server mute/deafen, track flags, speaking indicators
- Voice activities (YouTube, Krunker, Smash Karts, and more)
- Voice sidecar for metrics and pipeline
- In-repo production checklist and Prometheus/Grafana rules for LiveKit

**Native clients (Tauri)**

- Windows, macOS, and Linux desktop shell with frameless titlebar and system tray
- Android shell with Tauri; iOS project and simulator scripts
- PWA manifest with installable icons and minimal service worker

**Discord tooling**

- Discord import: structure ETL (channels, roles, `@everyone` overwrites, optional per-channel messages)
- Discord bridge (inbound mirror) and bot export sidecar
- Discord shadow-merge for import authors

**Observability and ops**

- Prometheus metrics: `echo_rest_http_*`, `echo_dm_open_total`, `hooks_livekit`, `echo_livekit`
- OpenTelemetry Node SDK (auto-instrumentation when `OTEL_EXPORTER_OTLP_ENDPOINT` is set)
- Starter Grafana dashboard (`monitoring/grafana/echo-overview.json`)
- Alert and recording rules (`monitoring/prometheus/rules/`)
- Structured logs with `X-Request-Id` correlation
- Runbooks: Postgres, NATS + Socket.IO, JWT/sockets, multi-replica drill
- `pm2` ecosystem config and VPS deploy scripts

**CI**

- GitHub Actions: format, backend (typecheck + contract + pipeline + RBAC + multi-node + uploads), frontend (Vitest), desktop, Android, and iOS builds, Cypress E2E smoke, CodeQL, secret scan, dependency review
- Custom AST guards: DAL isolation, snowflake feed order, single-reality, RBAC primitives, channel writes, no-SQL-in-routes
- OSS artifact check (no cursor/IDE dirs, no leaked secrets in tracked files)

**Frontend**

- Vue 3 + Vite SPA (Pinia, History API navigation, TypeScript)
- Theming system: AMOLED dark, Sunny light, Mac-glass variants; semantic CSS tokens; Stylelint + ESLint theme gates
- Tailwind CSS v4
- TipTap rich-text message composer (format v2)
- Markdown render with plain-bypass mode
- Twemoji emoji picker and custom server emoji
- Progressive Web App install support

### Operator notes

- **Node.js 22.13+** required (see `engines` in `package.json`).
- **`DATABASE_URL`** required in production; mock API routes are not registered outside development.
- **`ECHO_BACKEND_STORAGE=postgres`** for persistent data.
- Optional: `ECHO_S3_*` for object storage, `NATS_URL` for multi-node Socket.IO, `OTEL_EXPORTER_OTLP_ENDPOINT` for traces, `LIVEKIT_*` for voice/video.
- See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for local setup and [docs/reviews/STATUS_AND_PRODUCTION_READINESS.md](./docs/reviews/STATUS_AND_PRODUCTION_READINESS.md) for honest completion estimates.

### Known gaps (Horizon B)

- Cypress E2E smoke runs in CI; a full product E2E grid is not yet in place.
- Voice Layer 2 (noise suppression, Krisp integration) is not production-ready.
- Discord import: bulk member import and full history/attachments not yet implemented.
- Group DMs exist on the graph; UI polish is incomplete.
- Multi-node horizontal scaling (`NATS_URL`) is available but not the default investment until ~50k CCU.
- `otplib` is pinned at v12; v13 requires a migration (tracked).
