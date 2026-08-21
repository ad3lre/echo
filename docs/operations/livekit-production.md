# LiveKit / voice — production checklist (Echo)

This document is the **operator entry point** for running Echo voice against a **production-grade** LiveKit stack: TLS for browsers and webhooks, TURN for restrictive NATs, secrets rotation, and observability. **Implementing** DNS, certificates, and cloud resources is **outside this repository**; Echo ships **docs, metrics, alerts, and example configs** here.

**Related:** [livekit-turn.md](../infra/livekit-turn.md) (ports, dev Compose), [livekit-observability.md](../infra/livekit-observability.md) (metrics, alert rules), example SFU YAML [`server/ops/infra/livekit/livekit.production.example.yaml`](../../server/ops/infra/livekit/livekit.production.example.yaml).

---

## 1. Topology

| Piece                                     | Responsibility                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **LiveKit server** (Cloud or self-hosted) | WebRTC SFU; exposes WebSocket signaling and UDP/TCP media.                                                                                    |
| **Echo API**                              | Mints join JWTs (`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`), RoomService HTTP(S) calls, receives **webhooks** at `POST /api/v1/hooks/livekit`. |
| **Browser**                               | Connects with `livekit-client` using `LIVEKIT_PUBLIC_URL` (must be **`wss://`** in production).                                               |

Echo **does not** terminate WebRTC media; it only issues tokens and syncs DB state from webhooks.

---

## 2. Environment variables (Echo API)

| Variable                                 | Production requirement                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Must match the **keys** configured on the LiveKit server (`keys:` in server YAML or Cloud dashboard).                                       |
| `LIVEKIT_PUBLIC_URL`                     | **`wss://`** host reachable by users’ browsers (TLS). `ws://` is rejected at API startup when `NODE_ENV=production` and LiveKit is enabled. |
| `LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK`   | Usually `false`; UI uses client `ActiveSpeakersChanged` for low latency.                                                                    |

`liveKitServiceHttpUrl` in [`server/backend/src/services/livekit/livekitAdapter.ts`](../../server/backend/src/services/livekit/livekitAdapter.ts) maps `wss://` → `https://` for RoomService HTTP calls.

---

## 3. Webhook URL

- LiveKit must **POST** to a **public HTTPS** URL: `https://<your-echo-api-host>/api/v1/hooks/livekit`.
- The SFU (or its network) must resolve and reach this host; **`http://host.docker.internal`** is for local dev only.
- Path is **CSRF-exempt** ([`server/backend/src/auth/csrf.ts`](../../server/backend/src/auth/csrf.ts)); authentication is **JWT signature** verification in [`livekitWebhook.ts`](../../server/backend/src/api/routes/livekitWebhook.ts).
- Rotate **`LIVEKIT_API_SECRET`** together with LiveKit server config; signature mismatches appear as **4xx** on `route_group=hooks_livekit` in metrics.

---

## 4. TLS TURN, ICE, and firewall

- Dev uses coturn on **UDP 3478** ([`docker-compose.yml`](../../docker-compose.yml)); production should use **TLS TURN** (e.g. **5349**) or a managed TURN / LiveKit Cloud relay.
- Open SFU **UDP port range** for WebRTC: **57000–60000** on the SFU host and security group (see [livekit-turn.md](../infra/livekit-turn.md); dev Compose uses a smaller range).
- Set **`rtc.use_external_ip: true`** on cloud hosts (or a fixed **`rtc.node_ip`** public IPv4). Dev uses `127.0.0.1` / `lan:sync` — do not copy dev ICE settings to production.
- Align **username/credential** between coturn/LiveKit **`rtc.turn_servers`** and your secrets manager; LiveKit YAML does **not** expand `${ENV}` — render from templates in CI/CD.

| Port / setting   | Production                                                |
| ---------------- | --------------------------------------------------------- |
| Signaling        | **7880** (often behind TLS proxy → **443** / `wss://`)    |
| RTC TCP fallback | **7881**                                                  |
| TURN             | **5349** TLS (or provider relay) — not dev UDP 3478 alone |
| WebRTC media UDP | **57000–60000** (match `rtc.port_range_*` in SFU YAML)    |
| Echo API webhook | **HTTPS** only, reachable from SFU network                |

---

## 5. Secrets rotation

1. Generate new API keypair on LiveKit (or add a second key, migrate clients, remove old key).
2. Update Echo `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` and LiveKit server **`keys:`** in lockstep.
3. Redeploy; verify webhook **2xx** and browser **`wss://`** connect.

---

## 6. Observability

- Scrape **`GET /api/v1/metrics`** (protect with `ECHO_METRICS_SCRAPE_TOKEN` and/or network policy).
- Prometheus rules: group **`echo_livekit`** in [`server/ops/monitoring/prometheus/rules/echo-alerts.yml`](../../server/ops/monitoring/prometheus/rules/echo-alerts.yml).
- Grafana: **Echo overview** dashboard includes LiveKit webhook and voice moderate panels ([`server/ops/monitoring/grafana/echo-overview.json`](../../server/ops/monitoring/grafana/echo-overview.json)).

---

## 7. Verification

1. From a browser, connect to a voice channel; confirm signaling uses **`wss://`** in DevTools.
2. In Prometheus/Grafana, confirm **`echo_livekit_webhook_event_total`** increases on join/leave.
3. Intentionally mis-sign a webhook (or use wrong secret in a staging env) and confirm **4xx** on `hooks_livekit` + alert tuning if needed.
4. Run **`node server/ops/scripts/verify-livekit-production-env.mjs`** against production `.env` (checks `wss://`, documents firewall/TURN expectations).
5. **Reconnect vs token TTL:** With default `LIVEKIT_JOIN_TOKEN_TTL_SEC=300`, toggle network offline ~30s — expect SDK `Reconnecting`/`Reconnected` without re-mint. Offline **> 5 min** or `Disconnected` → guild client runs up to **8** full re-joins (fresh JWT each). Staging: set `LIVEKIT_JOIN_TOKEN_TTL_SEC=120` to exercise expiry sooner.

## 8. Production edge checklist (sign-off)

Use this table before declaring voice production-ready:

| Item                      | Pass when                                                                      |
| ------------------------- | ------------------------------------------------------------------------------ |
| `LIVEKIT_PUBLIC_URL`      | Starts with **`wss://`**; API startup rejects `ws://` in production            |
| SFU `rtc.use_external_ip` | **`true`** on cloud (or correct static `node_ip`)                              |
| SFU UDP range             | **`57000–60000`** opened on host + cloud SG/firewall                           |
| TURN                      | **TLS 5349** (or managed relay); credentials match rendered `rtc.turn_servers` |
| Webhook                   | **`https://…/api/v1/hooks/livekit`** reachable from SFU                        |
| Room timeouts             | `empty_timeout` / `departure_timeout` set in SFU YAML (see production example) |
| Image pin                 | `livekit-server` image digest pinned in deploy (not floating `latest`)         |
