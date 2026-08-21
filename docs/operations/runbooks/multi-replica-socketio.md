# Runbook: Multi-replica Socket.IO staging drill (Echo)

**Audience:** SREs and backend engineers validating **Horizon B**-style deployments: **two or more** Echo API replicas, **`NATS_URL`** set, load balancer in front of HTTP/WebSocket.

**Prerequisites**

- `NATS_URL` configured on **every** API replica; NATS cluster healthy (see [`nats-socketio.md`](./nats-socketio.md)).
- Load balancer supports **WebSocket** upgrade and forwards **`X-Forwarded-Proto`** when TLS terminates at the edge ([`realtime-scaling.md`](../../infra/realtime-scaling.md)).
- Prometheus (or equivalent) scraping **`GET /api/v1/metrics`** per replica or via a single service target — see [`server/ops/monitoring/README.md`](../../../server/ops/monitoring/README.md).

## Two-replica staging drill

1. Deploy **two** API replicas with identical env (especially `DATABASE_URL`, `NATS_URL`, JWT secrets).
2. Open **Client A** and **Client B** as two different users in a shared server/channel (or use two browsers / incognito).
3. Force **different replicas** if your platform allows (node selector, direct pod port-forward, or header-based routing). At minimum, verify **both** replicas register connections (connection logs, or LB access logs).
4. From Client A, **send a message** in a channel Client B is viewing. Confirm Client B receives the update in realtime.
5. From Client A, trigger a **workspace-scoped** event (e.g. channel list change if applicable). Confirm Client B receives it.
6. **Roll restart** one replica; confirm surviving connections on the other replica continue to work and new connections succeed.

## Presence — expected behavior

- Presence is backed by **Postgres** and periodic sweeps; with multiple replicas, sweeps run **per process** against the same table (idempotent).
- **Known gap:** per-process **`presenceSocketRegistry`** means “last socket offline” is tracked **per Node process**. A user with one tab on replica A and one on replica B may stay **online** until **both** sides disconnect or TTL/heartbeat logic catches up. This is documented in [`realtime-scaling.md`](../../infra/realtime-scaling.md) §Deployment checklist — do not treat as a single bug without reading that section.

## Alerts to watch during the drill

Load repo rules from [`server/ops/monitoring/prometheus/rules/`](../../../server/ops/monitoring/prometheus/rules). Pay particular attention during rolls to:

- **`EchoSocketRejectUnknownSpike`** / socket branch rates (`echo_socket_message_branch_total`).
- **`EchoMessageFailedRateHigh`** (`echo_message_failed_total`).
- REST **`echo_rest_http_requests_total`** 5xx rate by `route_group` and **`echo_rest_http_request_duration_seconds`** p95 (Grafana starter: [`server/ops/monitoring/grafana/echo-overview.json`](../../../server/ops/monitoring/grafana/echo-overview.json)).

## Validation cross-check

Complete the checklist in [`realtime-scaling.md`](../../infra/realtime-scaling.md) §Validation in the same session as this drill.

## Related runbooks

- [`nats-socketio.md`](./nats-socketio.md) — adapter down, restart order.
- [`jwt-socket-auth.md`](./jwt-socket-auth.md) — handshake auth failures under `AUTH_REQUIRE_SOCKET_TOKEN` / production.
