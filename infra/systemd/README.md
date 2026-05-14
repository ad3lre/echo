# systemd: safe blue-green deploy

This host’s production cutover is implemented by `npm run deploy:up` (see [docs/operations/blue-green-deployment.md](../../docs/operations/blue-green-deployment.md)). The live site is only switched after the **idle** clone builds, the API starts, and `/api/v1/health` succeeds; if anything fails first, the **active** slot keeps serving.

## One-time

1. Two full clones, e.g. `echo` (blue) and `echo-green` (green), shared `.env` via symlink.
2. `ECHO_DEPLOY_ROOT` holds `state.json` and Caddy’s generated fragment, e.g. `/opt/echo-deploy`.
3. `npm run deploy:init` with `ECHO_DEPLOY_RELEASE_BLUE` / `ECHO_DEPLOY_RELEASE_GREEN` / `ECHO_DEPLOY_ROOT` set.
4. In the **site** block of `/etc/caddy/Caddyfile`, import the generated file before the SPA `handle` (path is in the fragment’s header comment), e.g.  
   `import /opt/echo-deploy/proxy/echo-generated-routes.caddyfile`  
   and set the same release’s `root` to `.../frontend/dist` as the comments in that file show.
5. `sudo systemctl reload caddy`.

If you set **`ECHO_DEPLOY_PUBLIC_ROOT_SYMLINK`** (e.g. `/opt/echo-active`), deploy keeps that symlink pointed at the active release so Caddy can use `root * …/echo-active/frontend/dist` without editing paths on each cutover.

## Automate `deploy:up`

1. Copy `echo-deploy-up.env.example` to `$ECHO_DEPLOY_ROOT/systemd.env` and fix `PATH` to the Node that should run under systemd.
2. `sudo cp echo-deploy-up.service echo-deploy-up.timer /etc/systemd/system/`
3. Edit the `EnvironmentFile` path in the service if your `ECHO_DEPLOY_ROOT` is not `.../echo-deploy-meta`.
4. `sudo systemctl daemon-reload`
5. Test: `sudo systemctl start echo-deploy-up.service` and `journalctl -u echo-deploy-up -e`

`git pull` in the idle slot needs credentials **non-interactively** (no `ssh-add` in systemd). Use a **deploy key** without a passphrase, or an **HTTPS** remote with a token in a root-only file, or run the timer only after unlocking the agent (advanced).

6. Optional timer: `sudo systemctl enable --now echo-deploy-up.timer`
