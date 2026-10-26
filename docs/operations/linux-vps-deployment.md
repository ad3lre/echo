# Linux VPS — deployment notes

Echo runs on a typical **glibc** Linux VPS with **Bun 1.4.2+** (see root `package.json` `engines`), **Docker Engine + Compose v2**, and optional **reverse-proxy TLS**. This page complements the root [`README.md`](../../README.md) for operators who are not on Docker Desktop (Windows/macOS).

## LiveKit webhooks and the host API

Dev config [`server/ops/infra/livekit/livekit.yaml`](../../server/ops/infra/livekit/livekit.yaml) posts webhooks to `http://host.docker.internal:3000/...`.

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

| Pattern                               | Postgres / NATS / Mailpit / dev SFU          | Echo API + SPA                                                                                              |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A — Compose for data, Bun on host** | `docker compose up -d` for services you need | `bun run build` then `bun run start` (backend) + serve the built SPA (`vite preview`, static files, or CDN) |
| **B — Managed services**              | Hosted Postgres, Redis, NATS, LiveKit Cloud  | Same Bun processes; set env vars to cloud URLs                                                              |

Minimum for a real deployment: **Postgres**, **`DATABASE_URL`**, **`NODE_ENV=production`**, **`HOST=0.0.0.0`**, explicit **`CORS_ORIGIN`**, **`ECHO_GUEST_BINDING_SECRET`** (unless **`ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION=false`** for a single-process host only), **`ECHO_METRICS_SCRAPE_TOKEN`**, media URL hardening (**`ECHO_MEDIA_URL_REQUIRE_HTTPS`** and/or **`ECHO_MEDIA_URL_ALLOWED_HOSTS`**), and **`REDIS_URL`** (unless you explicitly set **`ECHO_REQUIRE_REDIS_IN_PRODUCTION=false`** for a single-process host). See [`.env.example`](../../.env.example) and [`PRODUCTION_SECURITY_CHECKLIST.md`](./PRODUCTION_SECURITY_CHECKLIST.md). Optional operational tuning (registration, guest caps, rate buckets) can live in [`echo.instance.json`](../../echo.instance.example.json) — see [`instance-policy.md`](./instance-policy.md). Voice requires **LiveKit** env alignment; import tooling may need the **Discord bot** as a separate process.

## Production deploy (`bun run vps:prod`)

For production on a single checkout, use **`bun run vps:prod`** (see **VPS runner helper** below). It preverifies TypeScript, builds, stops the previous stack, and starts `bun run prod` (API on **:3000**, SPA preview on **:4173**). Optional **systemd** units: `server/ops/infra/systemd/echo-vps-prod.service` + timer (`server/ops/scripts/deploy/install-vps-prod-systemd.sh`).

## VPS runner helper (`bun run vps:*`)

This repo includes a small VPS-oriented runner: [`server/ops/scripts/vps-serve.mjs`](../../server/ops/scripts/vps-serve.mjs).

- **Detached one-shot (survives SSH disconnect):** `bun run vps:dev` or `bun run vps:prod`
  - Writes logs under `logs/vps/` and a pid file `logs/vps/echo-vps-<mode>.pid` (the stack process).
- **Git watch + auto-restart (background):** `bun run vps:dev:watch:bg` / `bun run vps:prod:watch:bg`
  - The watcher itself writes `logs/vps/echo-vps-<mode>.watch.pid`.
  - Watches/pulls `main` by default; skips pulling if `git status` is dirty or if `HEAD` is not `main` (check `logs/vps/<mode>.launcher.log`).
- **Stop:** `bun run vps:dev:stop` / `bun run vps:prod:stop`
- **Follow logs (new terminal window when possible):** `bun run vps:logs` (auto dev/prod), or `bun run vps:dev:logs` / `bun run vps:prod:logs`

### TypeScript preverify (prod)

Before **`bun run prod`** stops API/frontend ports or rebuilds, the repo runs **`bun run preverify:prod`** (`server/ops/scripts/preverify-prod-typecheck.mjs`): `vue-tsc` on the frontend workspace and `tsc` on backend + bot. If it fails, deploy aborts and the **currently running** stack stays up.

- **`bun run vps:prod`** runs the same check **before** spawning `bun run prod` (logged in `logs/vps/prod.launcher.log`).
- **`bun run vps:prod:watch`** pulls first, then preverifies, then restarts immediately (failed typecheck skips restart).
- **`preprod`** no longer runs `kill-port` on `:3000` / `:4173`; ports are freed only after a successful **`bun run build`**, in **`prod:serve`**.
- Emergency skip: **`VPS_SKIP_PROD_TYPECHECK=1`** (not recommended on production).

### Rolling redeploy (short downtime, single checkout)

**`bun run vps:prod:rolling`** keeps the live stack on **:3000 / :4173** while it:

1. Runs **`preverify:prod`**
2. Runs **`bun run build`** (no port kill)
3. Starts a **staging** stack on **:3001 / :4174** (override with `ECHO_STAGING_API_PORT` / `ECHO_STAGING_FRONTEND_PORT`)
4. Health-checks staging
5. Stops live + staging, then **`prod:serve`** on main ports

User-visible downtime is roughly the **cutover** (~seconds), not the full build. Logs: `logs/vps/prod.rolling.log`.

Manual staging only: **`bun run prod:staging:serve`** (optional `--api-port=3001 --frontend-port=4174`).

## Signed-commit verification for `--git-watch` deploys

`vps-serve.mjs --git-watch` pulls (`git pull --ff-only`) and restarts when `origin/<branch>` moves. Whoever can push to that branch can therefore ship code to production, so the launcher can verify the new tip first:

- `ECHO_DEPLOY_REQUIRE_SIGNED=1` — run `git verify-commit <new tip>` before pulling. On failure the launcher logs `git verify-commit FAILED … keeping current version running` to the launcher meta log and does **not** pull or restart.
- Unset / `0` (**current default**, because commits are not signed yet) — no verification, and a `WARNING: deploying … WITHOUT signature verification` line is logged on every pull.
- Trusted keys: git's normal config (`gpg.format=ssh` + `gpg.ssh.allowedSignersFile`, or the GPG keyring). `ECHO_DEPLOY_ALLOWED_SIGNERS=/path/allowed_signers` overrides the signers file for the launcher only.

Roll-out: sign commits (`git config commit.gpgsign true`), install the allowed-signers file on the VPS, confirm `git verify-commit origin/<branch>` passes, then set `ECHO_DEPLOY_REQUIRE_SIGNED=1` in the launcher's environment.

## Reverse proxy (recommended on a VPS)

Terminate **TLS** at **Caddy** (or **Traefik** / a cloud load balancer), and:

- **HTTP(S)** to the Fastify API on **`127.0.0.1:3000`** (REST + webhook routes).
- **WebSocket upgrade** for **Socket.IO** on the same origin (proxy `/socket.io*` to **:3000**).
- **SPA** via **`vite preview` on :4173** or static files from **`clients/web/dist`** (see `server/ops/scripts/deploy/templates/caddy-spa-security-headers.Caddyfile.snippet`).
- **WebSocket** for **LiveKit** signaling (`wss://`) when using self-hosted SFU or a public `LIVEKIT_PUBLIC_URL`.
- **Large request / body limits** if users upload attachments (align with your presign / proxy timeouts).
- **Static compression** for frontend assets (`.js`, `.css`, `.svg`, `.json`, `.webmanifest`): prefer Brotli with gzip fallback.

When serving `clients/web/dist` through Caddy, configure precompressed sidecars so the proxy serves
`*.br` / `*.gz` emitted by the frontend build:

- **Caddy**: `encode zstd gzip` plus `file_server { precompressed br gzip }`
- **Fastify static** (if you serve SPA from the API host): use `@fastify/compress` with precompressed assets enabled.

Verify on production URLs:

```bash
curl -I https://your-domain.example/assets/index-<hash>.js
curl -I https://your-domain.example/assets/index-<hash>.css
```

Expect `Content-Encoding: br` (or `gzip`) and `Vary: Accept-Encoding`.

Forward **`X-Forwarded-For`** and **`X-Forwarded-Proto`** when the backend enforces HTTPS; see [`../infra/realtime-scaling.md`](../infra/realtime-scaling.md).

## Bun toolchain and native modules

1. Install **Bun 1.4.2+** (matches [`README.md`](../../README.md), `.bun-version`, and `package.json` `engines` / `packageManager`).
2. From the **repository root**, run **`bun install --frozen-lockfile`** (or `bun install`) so workspaces and root **devDependencies** resolve correctly.
3. On **minimal** images (very slim Ubuntu/Debian) or if **`sharp`** install fails, install a compiler toolchain, for example on Debian/Ubuntu: `build-essential` (and `python3` if a package’s install script expects it). Prefer **glibc-based** hosts; **Alpine (musl)** can require extra care for prebuilt native modules. Password hashing uses **`Bun.password`** (no native `bcrypt` addon).
4. **Optional `re2`:** Listed as an optional backend dependency for future automod RE2 support. If the N-API binary does not load under Bun, install soft-fails; do not block deploy on it.
5. Skip Windows-only helpers on Linux (for example root `package.json` script **`lan:firewall`**, which invokes PowerShell). Use **`ufw`**, **nftables**, or cloud security groups for firewall rules.

## Quick verification on the server

After `bun install --frozen-lockfile` and `bun run build` (or at least `bun run --filter backend build`):

- `bun run start` (from repo root per `package.json`) runs the compiled backend if `server/backend/dist/` exists.
- With Compose up and API on the host, confirm LiveKit can POST webhooks (check API logs / `hooks_livekit` metrics once configured).

For full CI parity locally or on CI: `bun run verify:ship`.
