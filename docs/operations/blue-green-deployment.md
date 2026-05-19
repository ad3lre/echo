# Blue-green deployment (Echo VPS)

This document describes the **directory layout**, **Caddy** reverse-proxy pattern, **NATS / Socket.IO** caveat, and how **`npm run deploy`** / **`npm run deploy:up`** orchestrate a safe cutover on a **Linux** production host.

Orchestrator: [`scripts/deploy/echo-deploy.mjs`](../../scripts/deploy/echo-deploy.mjs).

## Goals

- **Stable tree** serving users from a dedicated release directory while you develop elsewhere (another clone or worktree).
- **Candidate build** in the idle slot, **health check**, then **flip** the edge proxy to the new upstream and **stop** the previous API process.
- **Rollback**: point the generated import snippet back at the previous slot’s port and reload Caddy (previous `dist/` and `node_modules` must still exist on disk).

## Directory layout (`ECHO_DEPLOY_ROOT`)

Default: `/opt/echo`. Override with env `ECHO_DEPLOY_ROOT`.

If your clones live **outside** that tree (for example under `$HOME/prod/`), set **`ECHO_DEPLOY_RELEASE_BLUE`** and **`ECHO_DEPLOY_RELEASE_GREEN`** to the **absolute paths** of each checkout. `state.json` and the generated Caddy fragment still use `ECHO_DEPLOY_ROOT` unless you override `ECHO_DEPLOY_PROXY_SNIPPET`.

```text
$ECHO_DEPLOY_ROOT/
  state.json                 # written by the deploy script (active slot, paths)
  proxy/
    echo-generated-routes.caddyfile   # regenerated each cutover (import from your Caddyfile)
  releases/
    blue/                    # full git checkout: package.json at root, backend/, frontend/, …
    green/                   # second full checkout
  logs/                      # optional; each slot may use releases/<slot>/logs/
```

Initialize once on the server:

```bash
sudo mkdir -p /opt/echo/releases
sudo chown -R "$USER:$USER" /opt/echo
# Two checkouts (same remote, different folders):
git clone <repo-url> /opt/echo/releases/blue
git clone <repo-url> /opt/echo/releases/green
# Production env (do not commit secrets): symlink or copy
ln -sf /opt/echo/secrets/.env /opt/echo/releases/blue/.env
ln -sf /opt/echo/secrets/.env /opt/echo/releases/green/.env
# From any full Echo checkout (same repo root as this package.json):
cd /opt/echo/releases/blue && ECHO_DEPLOY_ROOT=/opt/echo npm run deploy:init
```

**Example — clones under `$HOME/prod` instead of `/opt/echo/releases`:**

```bash
mkdir -p ~/prod && cd ~/prod
git clone <repo-url> echo-blue
git clone <repo-url> echo-green
# Shared secrets (adjust paths):
ln -sf ~/prod/secrets/.env ~/prod/echo-blue/.env
ln -sf ~/prod/secrets/.env ~/prod/echo-green/.env
export ECHO_DEPLOY_ROOT="$HOME/prod/echo-deploy-meta"   # state.json + proxy/ snippet
mkdir -p "$ECHO_DEPLOY_ROOT"
cd ~/prod/echo-blue && ECHO_DEPLOY_ROOT="$ECHO_DEPLOY_ROOT" \
  ECHO_DEPLOY_RELEASE_BLUE="$HOME/prod/echo-blue" \
  ECHO_DEPLOY_RELEASE_GREEN="$HOME/prod/echo-green" \
  npm run deploy:init
# Later, from either checkout:
cd ~/prod/echo-blue && ECHO_DEPLOY_ROOT="$HOME/prod/echo-deploy-meta" \
  ECHO_DEPLOY_RELEASE_BLUE="$HOME/prod/echo-blue" \
  ECHO_DEPLOY_RELEASE_GREEN="$HOME/prod/echo-green" \
  npm run deploy
```

`deploy:init` creates `state.json` and writes the first **Caddy route fragment** to `ECHO_DEPLOY_PROXY_SNIPPET` (default `$ECHO_DEPLOY_ROOT/proxy/echo-generated-routes.caddyfile`). **`import`** that file from your main Caddyfile (see below), then run **`npm run deploy`** when the **idle** slot is ready to build (same three env vars as in the example).

## Fixed ports per slot

Each slot listens on a **stable** loopback port so Caddy only flips the `reverse_proxy` dial target in the generated file:

| Slot  | Default API port | Env override             |
| ----- | ---------------- | ------------------------ |
| blue  | `3000`           | `ECHO_DEPLOY_PORT_BLUE`  |
| green | `3010`           | `ECHO_DEPLOY_PORT_GREEN` |

The **idle** slot is built, started on its port, health-checked, then the snippet points at that port. After cutover, the script stops the API on the **previous** active slot.

## Reverse proxy (Caddy)

Terminate **TLS** at **Caddy** (or a cloud load balancer in front of Caddy). You need:

1. **HTTP + WebSocket** to the Echo API (Socket.IO upgrade).
2. **Static SPA** from `frontend/dist` of the **same** release as the active API, or a CDN that you update in lockstep with the deploy script.

The deploy script writes **`ECHO_DEPLOY_PROXY_SNIPPET`** (default: `$ECHO_DEPLOY_ROOT/proxy/echo-generated-routes.caddyfile`) with `handle /api/*` and Socket.IO `reverse_proxy` blocks targeting `127.0.0.1:<active-port>`, plus comments showing the matching `root` for `frontend/dist`.

In your **site** block, **`import`** that path **before** your catch-all SPA `handle` (so `/api` and `/socket.io` match first). After each cutover the script overwrites the snippet and runs **`ECHO_DEPLOY_PROXY_RELOAD`** (default: `sudo systemctl reload caddy`). If Caddy is not under systemd, set `ECHO_DEPLOY_PROXY_RELOAD` to e.g. `caddy reload --config /etc/caddy/Caddyfile`.

See also [linux-vps-deployment.md](./linux-vps-deployment.md) for TLS, `X-Forwarded-*`, and compression.

### Social previews (Open Graph) for vanity invite URLs

Copied invite links look like `https://chat.example.com/{vanity}` (SPA). Crawlers need either prerendered HTML or a proxy rule so they do not receive the bare `index.html` shell.

Optional Caddy fragment (import **after** `/api/*` + `/socket.io`, **before** the SPA `try_files` catch-all): [`scripts/deploy/templates/caddy-echo-social-preview.caddyfile.snippet`](../../scripts/deploy/templates/caddy-echo-social-preview.caddyfile.snippet) — substitute `{{API_PORT}}`, then `import` it from your site block. It forwards known social crawlers on single-segment paths to `GET /api/v1/echo/invites/{segment}/share`, which returns OG meta + redirect.

## Commands (production)

Run on the **Linux** host from **any** directory (for example `~/prod/echo`); the script does **not** use your current working tree as a release slot unless you point **`ECHO_DEPLOY_RELEASE_BLUE` / `ECHO_DEPLOY_RELEASE_GREEN`** there (you still need **two** separate clones for safe blue-green). Set **`ECHO_DEPLOY_ROOT`** where `state.json` and `proxy/` should live (e.g. `/opt/echo`).

The deploy script auto-loads **`$ECHO_DEPLOY_ROOT/systemd.env`** when present, and also **`../echo-deploy-meta/systemd.env`** relative to the repo checkout (so `npm run deploy:up` from `echo/` picks up paths without `export` or `set -a`). Override with **`ECHO_DEPLOY_ENV_FILE`**.

| Command               | Behavior                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run deploy:init` | Create `state.json`, print paths and Caddy fragment location.                                                                                                                                                                                                                                         |
| `npm run deploy`      | Build **idle** slot (`npm ci` + `npm run build`), stop any prior idle-slot API pid, run **`scripts/kill-dev-ports.js`** with `ECHO_FREE_PORTS=<idle>` (same safety as `prod:serve`), start API on idle port, **`GET /api/v1/health`**, rewrite proxy snippet, reload Caddy, stop previous slot’s API. |
| `npm run deploy:up`   | Same as `deploy`, plus **`git pull --ff-only`** in the idle checkout first.                                                                                                                                                                                                                           |

Frontend in production is normally served by Caddy from `frontend/dist` after build; start **`vite preview`** only if you intentionally proxy to Node for static (not required for the MVP script, which focuses on **API** cutover + `dist` on disk for Caddy `root` / `file_server`).

### Environment variables

| Variable                          | Default                                       | Purpose                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECHO_DEPLOY_ROOT`                | `/opt/echo`                                   | Root for `state.json`, default `releases/<slot>/`, default `proxy/` snippet dir                                                                                                                   |
| `ECHO_DEPLOY_RELEASE_BLUE`        | _(unset)_                                     | If set, absolute path to the **blue** checkout (overrides `$ROOT/releases/blue`)                                                                                                                  |
| `ECHO_DEPLOY_RELEASE_GREEN`       | _(unset)_                                     | If set, absolute path to the **green** checkout (overrides `$ROOT/releases/green`)                                                                                                                |
| `ECHO_DEPLOY_PROXY_SNIPPET`       | `$ROOT/proxy/echo-generated-routes.caddyfile` | Regenerated `handle` + `reverse_proxy` fragment                                                                                                                                                   |
| `ECHO_DEPLOY_PROXY_RELOAD`        | `sudo systemctl reload caddy`                 | Shell command after snippet write                                                                                                                                                                 |
| `ECHO_DEPLOY_HEALTH_PATH`         | `/api/v1/health`                              | Health URL path                                                                                                                                                                                   |
| `ECHO_DEPLOY_HEALTH_TIMEOUT_MS`   | `120000`                                      | Max wait for health                                                                                                                                                                               |
| `ECHO_DEPLOY_PORT_BLUE`           | `3000`                                        | API port for blue                                                                                                                                                                                 |
| `ECHO_DEPLOY_PORT_GREEN`          | `3010`                                        | API port for green                                                                                                                                                                                |
| `ECHO_DEPLOY_ALLOW_NON_LINUX`     | unset                                         | Set to `1` to run build/health steps on non-Linux (not for real cutover)                                                                                                                          |
| `ECHO_DEPLOY_PUBLIC_ROOT_SYMLINK` | _(unset)_                                     | If set (absolute path), deploy maintains `ln -sfn <active-release> <symlink>` so Caddy can keep `root * <symlink>/frontend/dist`                                                                  |
| `ECHO_DEPLOY_SHARED_TWEMOJI`      | `$ECHO_DEPLOY_ROOT/shared/twemoji`            | Shared Twemoji WebP cache: deploy symlinks the **idle** checkout’s `frontend/public/twemoji` here so blue/green alternate builds reuse one fingerprint (avoids reconverting all SVGs each deploy) |

## Socket.IO, “live sessions”, and NATS

With the **default** single-process Socket.IO adapter, each API process holds in-memory room/socket state. During cutover, clients on the **old** process lose that TCP connection when the process stops; the **client should reconnect** to the new port (Echo’s client has resume-oriented behavior, but this is not literal zero-gap transport).

If you need **two API processes receiving traffic at the same time** with shared broadcasts (true overlap), configure **`NATS_URL`** and the shared Socket.IO adapter as described in [realtime-scaling.md](../infra/realtime-scaling.md).

## Rollback

1. Edit `state.json` `activeSlot` back to the previous slot **or** restore yesterday’s `echo-generated-routes.caddyfile` from backup.
2. `sudo systemctl reload caddy` (or your `ECHO_DEPLOY_PROXY_RELOAD` command).
3. Start the previous slot’s API on its port if it was stopped: `cd /opt/echo/releases/<slot>/backend && npm start` with `PORT` set to that slot’s port.

## Relation to `vps-serve.mjs`

[`scripts/vps-serve.mjs`](../../scripts/vps-serve.mjs) does **stop → git pull → start** in one tree; it is simpler but **interrupts** all users for that tree. Use **blue-green** (`deploy` / `deploy:up`) for production; keep `vps:*` for dev/staging if useful.
