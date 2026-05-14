# LiveKit / voice — production checklist (Echo)

This document is the **operator entry point** for running Echo voice against a **production-grade** LiveKit stack: TLS for browsers and webhooks, TURN for restrictive NATs, secrets rotation, and observability. **Implementing** DNS, certificates, and cloud resources is **outside this repository**; Echo ships **docs, metrics, alerts, and example configs** here.

**Related:** [livekit-turn.md](../infra/livekit-turn.md) (ports, dev Compose), [livekit-observability.md](../infra/livekit-observability.md) (metrics, alert rules), example SFU YAML [`infra/livekit/livekit.production.example.yaml`](../../infra/livekit/livekit.production.example.yaml).

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

`liveKitServiceHttpUrl` in [`backend/src/services/livekit/livekitAdapter.ts`](../../backend/src/services/livekit/livekitAdapter.ts) maps `wss://` → `https://` for RoomService HTTP calls.

---

## 3. Webhook URL

- LiveKit must **POST** to a **public HTTPS** URL: `https://<your-echo-api-host>/api/v1/hooks/livekit`.
- The SFU (or its network) must resolve and reach this host; **`http://host.docker.internal`** is for local dev only.
- Path is **CSRF-exempt** ([`backend/src/auth/csrf.ts`](../../backend/src/auth/csrf.ts)); authentication is **JWT signature** verification in [`livekitWebhook.ts`](../../backend/src/api/routes/livekitWebhook.ts).
- Rotate **`LIVEKIT_API_SECRET`** together with LiveKit server config; signature mismatches appear as **4xx** on `route_group=hooks_livekit` in metrics.

---

## 4. TLS TURN and firewall

- Dev uses coturn on **UDP 3478** ([`docker-compose.yml`](../../docker-compose.yml)); production should use **TLS TURN** (e.g. **5349**) or a managed TURN / LiveKit Cloud relay.
- Open SFU **UDP port range** for WebRTC (see [livekit-turn.md](../infra/livekit-turn.md)).
- Align **username/credential** between coturn/LiveKit **`rtc.turn_servers`** and your secrets manager; LiveKit YAML does **not** expand `${ENV}` — render from templates in CI/CD.

---

## 5. Secrets rotation

1. Generate new API keypair on LiveKit (or add a second key, migrate clients, remove old key).
2. Update Echo `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` and LiveKit server **`keys:`** in lockstep.
3. Redeploy; verify webhook **2xx** and browser **`wss://`** connect.

---

## 6. Observability

- Scrape **`GET /api/v1/metrics`** (protect with `ECHO_METRICS_SCRAPE_TOKEN` and/or network policy).
- Prometheus rules: group **`echo_livekit`** in [`monitoring/prometheus/rules/echo-alerts.yml`](../../monitoring/prometheus/rules/echo-alerts.yml).
- Grafana: **Echo overview** dashboard includes LiveKit webhook and voice moderate panels ([`monitoring/grafana/echo-overview.json`](../../monitoring/grafana/echo-overview.json)).

---

## 7. Verification

1. From a browser, connect to a voice channel; confirm signaling uses **`wss://`** in DevTools.
2. In Prometheus/Grafana, confirm **`echo_livekit_webhook_event_total`** increases on join/leave.
3. Intentionally mis-sign a webhook (or use wrong secret in a staging env) and confirm **4xx** on `hooks_livekit` + alert tuning if needed.
