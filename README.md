# Echo

**Echo** is an open, privacy-minded platform for **communities**: real-time **chat**, **voice and video** (LiveKit), servers and channels, DMs, roles, and the workflows people expect from a modern team or social space—without treating your community as ad inventory.

You can **run it yourself** (self-host), **fork and extend** it (AGPL), or use it as the basis for a product you control end-to-end.

## Quick start

From the repository root (Node.js **22.13+**, Docker for Postgres):

```bash
npm ci
cp .env.example .env
npm run db:up
npm run dev
```

- API: **http://localhost:3000**
- Vite dev server: **http://localhost:8080**

Full setup, PR checks, and maintainer notes: **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)**.

## Contents

- [What Echo is](#what-echo-is)
- [Why Echo](#why-echo)
- [Open source](#open-source)
- [Project structure](#project-structure)
- [Stack (summary)](#stack-summary)
- [Getting started](#getting-started)
- [Native apps (Tauri)](#native-apps-tauri)
- [Contributing](#contributing)
- [Third-party assets](#third-party-assets)
- [License](#license)

## What Echo is

Echo is a **full-stack communication app**: a Vue 3 SPA, a Node.js (**Fastify**) API, **Socket.IO** for realtime, **PostgreSQL** for durable data, optional **NATS** for multi-process scaling, and **native clients** (Tauri) where you want an installed app. A separate **marketing** site (Astro) and optional **Discord bridge / import** tooling exist for migration and interoperability—not as the core identity of the product.

The codebase is organized for **operators and contributors**: typed shared contracts between client and server, documented API behavior under [`docs/contracts/`](./docs/contracts/), and runbooks under [`docs/operations/`](./docs/operations/).

## Why Echo

- **Privacy and consent by design** — built around clear boundaries for data, sessions, and what the server is allowed to assume about users.
- **You own your deployment** — no mandatory third-party control plane; configure auth, storage, voice, and edge the way your threat model requires.
- **Realtime-first** — chat and presence are first-class; voice/video follow a documented LiveKit path with production checklists in-repo.
- **Serious engineering guardrails** — contract tests, RBAC and snowflake guards in CI, observability hooks, and a single [production readiness rollup](./docs/reviews/STATUS_AND_PRODUCTION_READINESS.md) so progress is inspectable, not hand-wavy.
- **Installable where your users are** — **PWA** for the web and **Tauri** for desktop, Android, and iOS (see [`releases/`](./releases/README.md)).

## Open source

Echo is **open source** under the [**GNU Affero General Public License v3.0 only**](./LICENSE) (AGPL). Contributions, issues, and pull requests: [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), [`.github/SECURITY.md`](./.github/SECURITY.md). **Documentation index:** [docs/README.md](./docs/README.md).

**CI (GitHub Actions)** — badges target this fork’s default GitHub branch (`release/1.0.0`). Change `ad3lre/echo` and `branch=…` in the URLs if your owner/repo or branch name differs:

[![Echo format check](https://github.com/ad3lre/echo/actions/workflows/echo-format-ci.yml/badge.svg?branch=release/1.0.0)](https://github.com/ad3lre/echo/actions/workflows/echo-format-ci.yml)
[![Echo backend checks](https://github.com/ad3lre/echo/actions/workflows/echo-backend-ci.yml/badge.svg?branch=release/1.0.0)](https://github.com/ad3lre/echo/actions/workflows/echo-backend-ci.yml)
[![Echo frontend checks](https://github.com/ad3lre/echo/actions/workflows/echo-frontend-ci.yml/badge.svg?branch=release/1.0.0)](https://github.com/ad3lre/echo/actions/workflows/echo-frontend-ci.yml)
[![Echo E2E smoke](https://github.com/ad3lre/echo/actions/workflows/echo-e2e-ci.yml/badge.svg?branch=release/1.0.0)](https://github.com/ad3lre/echo/actions/workflows/echo-e2e-ci.yml)
[![CodeQL](https://github.com/ad3lre/echo/actions/workflows/codeql.yml/badge.svg?branch=release/1.0.0)](https://github.com/ad3lre/echo/actions/workflows/codeql.yml)

Release and signing workflows may need **repository secrets** on the canonical fork; forks still get format, backend, frontend, and E2E checks when relevant paths change.

## Project structure

- **`frontend/`** — Vue 3 + Vite SPA (Pinia, TypeScript). Client navigation uses the History API ([`frontend/src/features/layout/urlNavigation.ts`](./frontend/src/features/layout/urlNavigation.ts)), not vue-router.
- **`backend/`** — Fastify REST API, Socket.IO, Postgres integration, auth and Echo domain logic.
- **`shared/`** — Shared TypeScript types and constants across client and server.
- **`scripts/`** — Migrations, seeds, deploy helpers, asset pipelines.
- **`marketing/`** — Astro site for public pages.
- **`bot/`**, **`voice-sidecar/`**, **`src-tauri/`** — Optional Discord tooling, voice sidecar, and native shells.

## Stack (summary)

| Layer    | Choices                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Vue 3, Vite, Pinia, TypeScript (History API client navigation)                                                                                                  |
| Backend  | Node.js, Fastify, Socket.IO, TypeScript                                                                                                                         |
| Data     | PostgreSQL                                                                                                                                                      |
| Realtime | Optional **NATS** Socket.IO adapter when **`NATS_URL`** is set — see [realtime scaling](./docs/infra/realtime-scaling.md) and [STACK](./docs/overview/STACK.md) |
| Voice    | LiveKit (session + webhooks + client); ops in [`docs/operations/livekit-production.md`](./docs/operations/livekit-production.md)                                |
| Storage  | S3-compatible object storage when **`ECHO_S3_*`** is configured (optional)                                                                                      |

## Getting started

- **Install from the repo root** (`npm ci` or `npm install`). Root install is required (workspaces + devDependencies such as **`sharp`** for Twemoji assets). Installing only under `frontend/` is not enough for `npm run dev` / `npm run build`.
- **Node.js 22.13+** (see `package.json` `engines`). For `sharp`, see [sharp install](https://sharp.pixelplumbing.com/install).
- **Local stack:** `npm run db:up` then `npm run dev` (see `.env.example`). Postgres-like behavior: **`ECHO_BACKEND_STORAGE=postgres`** and **`DATABASE_URL`**.
- **Production-like local bundle:** `npm run prod` (full build + API on **:3000** + Vite preview on **:4173**). Skip rebuild: `npm run prod:serve`.
- **Backend only:** `npm run build -w backend` (or root `npm run build`) before `npm start` (`node dist/backend/src/index.js`).
- **Production:** `DATABASE_URL` required; **`/api/v1/mock`** is not registered in production.
- **VPS / bare metal:** [`docs/operations/linux-vps-deployment.md`](./docs/operations/linux-vps-deployment.md).
- **Seed dev data (API running):** `npm run seed:dev`.

### Progressive Web App

The SPA ships a [manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest), themed icons under `frontend/public/icons/` (regenerated on `npm run build -w frontend` via `scripts/generate-pwa-icons.mjs`), and a minimal [service worker](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) (`frontend/public/sw.js`). The worker registers in dev and production so Chrome can offer **Install Echo** on `npm run dev` (e.g. **http://localhost:8080**).

- **HTTPS:** production installability needs a secure context; terminate TLS at your proxy and forward **`X-Forwarded-Proto`** when HTTPS enforcement is on (see `registerHttpsEnforcementIfConfigured` and [realtime-scaling](./docs/infra/realtime-scaling.md)).
- **Verify:** Vite dev or `npm run build -w frontend && npm run preview -w frontend` → Chrome → **Install Echo**. Hard-reload once if the prompt is missing.
- **Icons only:** `npm run pwa:icons` from repo root.

## Native apps (Tauri)

Windows, macOS, Linux, Android, and iOS — **paths, commands, CI pointers** in [`releases/README.md`](./releases/README.md). Signing, stores, and CORS depth live under [`docs/operations/`](./docs/operations/).

## Contributing

We welcome contributions on **GitHub**. Start with [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md), then [CONTRIBUTING.md](./CONTRIBUTING.md).

## Third-party assets

Icons and emoji: [terms/en-US/ATTRIBUTIONS.md](./terms/en-US/ATTRIBUTIONS.md).

## License

**GNU Affero General Public License v3.0 only** — see [`LICENSE`](./LICENSE).

If you **modify** this program and **offer** it as a **network service**, the AGPL requires offering **Corresponding Source** to users of that service under the same license. Distributed **binaries** must also satisfy source-offer rules. See the [GNU AGPL howto](https://www.gnu.org/licenses/agpl-3.0.html) and [FSF FAQ (AGPL)](https://www.gnu.org/licenses/gpl-faq.en.html#AGPLv3).

**Downstream:** app stores and notarized bundles may add their own terms; packagers remain responsible for AGPL compliance.
