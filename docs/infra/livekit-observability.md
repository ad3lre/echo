# LiveKit / voice — metrics and alerts

**Operator checklist (deploy, `wss://`, HTTPS webhook, TLS TURN):** [`../operations/livekit-production.md`](../operations/livekit-production.md).

Echo exposes **Prometheus** metrics via `**GET /api/v1/metrics`\*\* (optional bearer `ECHO_METRICS_SCRAPE_TOKEN` — see backend config). Restrict at the reverse proxy in production.

## Counters to watch

| Metric                                      | Labels             | Use                                                                                                                                                                                 |
| ------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**echo_voice_moderate_total**`             | `action`, `result` | Volume and failure modes for `**POST …/voice/moderate**` (`result`: `ok`, `forbidden`, `not_found`, `invalid_body`, `invalid_action`, etc.).                                        |
| `**echo_livekit_webhook_event_total**`      | `event`            | Webhook branches: `participant_joined`, `participant_left`, `track_published`, `track_unpublished`, `active_speakers_changed`, `track_ignored`, `room_unparseable`, `no_handler`, … |
| `**echo_voice_reconcile_deleted_total**`    | `reason`           | Rows removed when DB roster disagrees with LiveKit (`boot`, `periodic`, `socket_follow_up`, …).                                                                                     |
| `**echo_voice_client_qos_latency_ms**`      | (histogram)        | Browser RTC RTT samples (POST …/voice/qos-sample, ~30s throttle per client).                                                                                                        |
| `**echo_voice_client_qos_jitter_ms**`       | (histogram)        | Inbound jitter (ms) from client samples.                                                                                                                                            |
| `**echo_voice_client_qos_packet_loss_pct**` | (histogram)        | Packet loss % from client samples.                                                                                                                                                  |
| `**echo_voice_client_qos_samples_total**`   | —                  | Accepted QoS sample POST count.                                                                                                                                                     |

Low-cardinality labels only — do not add raw room names or user ids.

**REST `route_group`:** `POST /api/v1/hooks/livekit` is labeled **`hooks_livekit`** in `echo_rest_http_requests_total` / duration histograms (see `echoRestRouteGroup` in `backend/src/bootstrap/echoHttpObservability.ts`). Use it for webhook-specific alerts and dashboards.

## Prometheus alert rules (in-repo)

Rules live in [`monitoring/prometheus/rules/echo-alerts.yml`](../../monitoring/prometheus/rules/echo-alerts.yml) under group **`echo_livekit`**:

| Alert                                   | Intent                                                            | Tune                                                      |
| --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `EchoLivekitWebhook4xxSustained`        | Sustained 4xx on `hooks_livekit` (signature mismatch, bad config) | Raise threshold or `for` if public scanners add noise     |
| `EchoLivekitWebhookUnknownEventsSpike`  | Spike in `no_handler` or `room_unparseable` webhook events        | LiveKit version upgrade or room naming drift              |
| `EchoVoiceModerateForbiddenDominatesOk` | `forbidden` rate ≫ `ok` on moderation                             | May be normal for strict servers; adjust ratio or silence |

**Deployment checklist** (topology, `wss://`, HTTPS webhook, TLS TURN): [`../operations/livekit-production.md`](../operations/livekit-production.md).

## Alert ideas (legacy notes)

- **Webhook auth:** HTTP **401** rate on `**/api/v1/hooks/livekit`\*\* (signature failures) — possible secret drift or attack traffic.
- `**no_handler` spike:\*\* LiveKit upgraded or misconfigured events — review server logs for `event=…`.
- **Moderation `forbidden` vs `ok`:** Sudden shift may indicate RBAC or client bugs.

## Logs

Structured logs on the webhook route include `**event`**, **room name**, and **participant identity\*\* (trim in log processors if PII-sensitive).

## CI

Database-backed checks: `**npm run test:echo:livekit`** with `**PG_TEST_URL`or`DATABASE_URL**`. JWT grant checks run when `**LIVEKIT_API_KEY**`/`**LIVEKIT_API_SECRET**` are set. E2E mock stack (`**npm run test:e2e\*\*`) does not exercise LiveKit.
