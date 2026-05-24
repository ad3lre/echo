# Linux VPS — deployment notes

Echo runs on a typical **glibc** Linux VPS with **Node 22.13+** (see root `package.json` `engines`), **Docker Engine + Compose v2**, and optional **reverse-proxy TLS**. This page complements the root [`README.md`](../../README.md) for operators who are not on Docker Desktop (Windows/macOS).

## LiveKit webhooks and the host API

Dev config [`infra/livekit/livekit.yaml`](../../infra/livekit/livekit.yaml) posts webhooks to `http://host.docker.internal:3000/...`.

- **Docker Desktop** injects `host.docker.internal` automatically.
- **Linux** does not, by default. The repo’s [`docker-compose.yml`](../../docker-compose.yml) adds:

  ```yaml
  extra_hosts:
    - 'host.docker.internal:host-gateway'
  ```

  on the **`livekit`** service so the SFU container can reach processes listening on the **host** (for example the Echo API on `:3000`).

**Requirements:** Docker Engine **20.10+** and Compose **v2.1+** for the `host-gateway` special IP. If your stack is older, upgrade Docker or replace the webhook URL with a concrete host IP that reaches the API.

**Production:** Do not rely on `host.docker.internal`. Use a **public HTTPS** webhook URL and TLS SFU; see [`livekit-production.md`](./livekit-production.md) and [`../infra/livekit-turn.md`](../infra/livekit-turn.md).

## Process and dependency layout

There is **no root Dockerfile** in this repo. Choose one of these patterns:

| Pattern                                | Postgres / NATS / Mailpit / dev SFU          | Echo API + SPA                                                                                          |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A — Compose for data, Node on host** | `docker compose up -d` for services you need | `npm run build` then `npm start` (backend) + serve the built SPA (`vite preview`, static files, or CDN) |
| **B — Managed services**               | Hosted Postgres, Redis, NATS, LiveKit Cloud  | Same Node processes; set env vars to cloud URLs                                                         |

Minimum for a real deployment: **Postgres**, **`DATABASE_URL`**, **`NODE_ENV=production`**, **`HOST=0.0.0.0`**, explicit **`CORS_ORIGIN`**, **`ECHO_GUEST_BINDING_SECRET`** (unless **`ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION=false`** for a single-process host only), **`ECHO_METRICS_SCRAPE_TOKEN`**, media URL hardening (**`ECHO_MEDIA_URL_REQUIRE_HTTPS`** and/or **`ECHO_MEDIA_URL_ALLOWED_HOSTS`**), and **`REDIS_URL`** (unless you explicitly set **`ECHO_REQUIRE_REDIS_IN_PRODUCTION=false`** for a single-process host). See [`.env.example`](../../.env.example) and [`PRODUCTION_SECURITY_CHECKLIST.md`](./PRODUCTION_SECURITY_CHECKLIST.md). Voice requires **LiveKit** env alignment; import tooling may need the **Discord bot** as a separate process.

## Blue-green production deploy (`npm run deploy*`)

For **zero-downtime-style** cutover (build idle slot, health check, flip Caddy upstream snippet, stop old API), see **[blue-green-deployment.md](./blue-green-deployment.md)** (`npm run deploy:init`, `npm run deploy`, `npm run deploy:up`). Example **systemd** units and a timer live under **[infra/systemd/README.md](../../infra/systemd/README.md)** (`scripts/deploy/install-systemd.sh`).

## VPS runner helper (`npm run vps:*`)

This repo includes a small VPS-oriented runner: [`scripts/vps-serve.mjs`](../../scripts/vps-serve.mjs).

- **Detached one-shot (survives SSH disconnect):** `npm run vps:dev` or `npm run vps:prod`
  - Writes logs under `logs/vps/` and a pid file `logs/vps/echo-vps-<mode>.pid` (the stack process).
- **Git watch + auto-restart (background):** `npm run vps:dev:watch:bg` / `npm run vps:prod:watch:bg`
  - The watcher itself writes `logs/vps/echo-vps-<mode>.watch.pid`.
  - Watches/pulls `main` by default; skips pulling if `git status` is dirty or if `HEAD` is not `main` (check `logs/vps/<mode>.launcher.log`).
- **Stop:** `npm run vps:dev:stop` / `npm run vps:prod:stop`
- **Follow logs (new terminal window when possible):** `npm run vps:logs` (auto dev/prod), or `npm run vps:dev:logs` / `npm run vps:prod:logs`

### TypeScript preverify (prod)

Before **`npm run prod`** stops API/frontend ports or rebuilds, the repo runs **`npm run preverify:prod`** (`scripts/preverify-prod-typecheck.mjs`): `vue-tsc` on the frontend workspace and `tsc` on backend + bot. If it fails, deploy aborts and the **currently running** stack stays up.

- **`npm run vps:prod`** runs the same check **before** spawning `npm run prod` (logged in `logs/vps/prod.launcher.log`).
- **`npm run vps:prod:watch`** pulls first, then preverifies, then restarts immediately (failed typecheck skips restart).
- **`preprod`** no longer runs `kill-port` on `:3000` / `:4173`; ports are freed only after a successful **`npm run build`**, in **`prod:serve`**.
- Emergency skip: **`VPS_SKIP_PROD_TYPECHECK=1`** (not recommended on production).

### Rolling redeploy (short downtime, single checkout)

**`npm run vps:prod:rolling`** keeps the live stack on **:3000 / :4173** while it:

1. Runs **`preverify:prod`**
2. Runs **`npm run build`** (no port kill)
3. Starts a **staging** stack on **:3001 / :4174** (override with `ECHO_STAGING_API_PORT` / `ECHO_STAGING_FRONTEND_PORT`)
4. Health-checks staging
5. Stops live + staging, then **`prod:serve`** on main ports

User-visible downtime is roughly the **cutover** (~seconds), not the full build. Logs: `logs/vps/prod.rolling.log`.

Manual staging only: **`npm run prod:staging:serve`** (optional `--api-port=3001 --frontend-port=4174`).

For dual checkouts + Caddy snippet flip, see **[blue-green-deployment.md](./blue-green-deployment.md)**.

## Reverse proxy (recommended on a VPS)

Terminate **TLS** at **Caddy** (or **Traefik** / a cloud load balancer), and:

- **HTTP(S)** to the Fastify API (REST + webhook routes).
- **WebSocket upgrade** for **Socket.IO** on the same origin or explicit `VITE_SOCKET_IO_URL` / proxy path your frontend uses.
- **WebSocket** for **LiveKit** signaling (`wss://`) when using self-hosted SFU or a public `LIVEKIT_PUBLIC_URL`.
- **Large request / body limits** if users upload attachments (align with your presign / proxy timeouts).
- **Static compression** for frontend assets (`.js`, `.css`, `.svg`, `.json`, `.webmanifest`): prefer Brotli with gzip fallback.

When serving `frontend/dist` through Caddy, configure precompressed sidecars so the proxy serves
`*.br` / `*.gz` emitted by the frontend build:

- **Caddy**: `encode zstd gzip` plus `file_server { precompressed br gzip }`
- **Fastify static** (if you serve SPA from Node): use `@fastify/compress` with precompressed assets enabled.

Verify on production URLs:

```bash
curl -I https://your-domain.example/assets/index-<hash>.js
curl -I https://your-domain.example/assets/index-<hash>.css
```

Expect `Content-Encoding: br` (or `gzip`) and `Vary: Accept-Encoding`.

Forward **`X-Forwarded-For`** and **`X-Forwarded-Proto`** when the backend enforces HTTPS; see [`../infra/realtime-scaling.md`](../infra/realtime-scaling.md).

## Node toolchain and native modules

1. Install **Node.js 22.13+** (matches [`README.md`](../../README.md) and `package.json` `engines`; needed for Astro 6 and ESLint in workspaces).
2. From the **repository root**, run **`npm ci`** (or `npm install`) so workspaces and root **devDependencies** resolve correctly.
3. On **minimal** images (very slim Ubuntu/Debian) or if **`bcrypt`** / **`sharp`** install fails, install a compiler toolchain, for example on Debian/Ubuntu: `build-essential` (and `python3` if a package’s install script expects it). Prefer **official Node binaries** or **glibc-based** images; **Alpine (musl)** can require extra care for prebuilt native modules.
4. **Automod RE2 (`matches_regex_re2`):** The backend pulls the optional native package **`re2`**. If **`npm ci`** ran **without** a C++ toolchain, npm **drops** `re2` silently and the API reports **`re2RegexAvailable: false`**. After installing **`build-essential`** and **`python3`**, reinstall or rebuild from the repo root, for example **`npm rebuild re2 --workspace=backend`**, or run **`npm ci`** again. Quick check: **`node -e "require('re2'); console.log('re2 ok')"`** (must print `re2 ok`).
5. Skip Windows-only helpers on Linux (for example root `package.json` script **`lan:firewall`**, which invokes PowerShell). Use **`ufw`**, **nftables**, or cloud security groups for firewall rules.

## Quick verification on the server

After `npm ci` and `npm run build` (or at least `npm run build -w backend`):

- `npm start` (from repo root per `package.json`) runs the compiled backend if `backend/dist/` exists.
- With Compose up and API on the host, confirm LiveKit can POST webhooks (check API logs / `hooks_livekit` metrics once configured).

For full CI parity locally or on CI: `npm run verify:ship`.
