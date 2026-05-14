# Runbook: NATS + Socket.IO (Echo multi-replica)

**Audience:** Engineers operating Echo with **`NATS_URL`** set so Socket.IO uses the NATS adapter (`attachSocketAdapterIfConfigured` in `backend/src/bootstrap/socket.ts`).

## When this applies

- You run **more than one** API replica behind a load balancer **and** rely on cross-replica room/workspace fan-out.
- Without NATS (or with a broken adapter), broadcasts only reach sockets connected to the **same** Node process.

## Symptoms

- Users on different tabs / devices see **inconsistent** realtime updates (messages, typing, presence) while REST looks healthy.
- Logs show NATS connection errors, adapter failures, or repeated reconnects.
- After rolling one replica, clients connected to other replicas **stop** receiving events that should be global.

## Quick checks

1. Confirm **`NATS_URL`** is set **identically** (modulo ordering) on all API replicas and points at a reachable cluster.
2. From an ops shell, verify NATS **connectivity** (your org’s standard check: `nats` CLI, TCP probe, or health endpoint depending on deployment).
3. Review API logs around **`NATS connected, Socket.IO adapter attached`** vs **`NATS not configured`** — a mis-set env on **one** pod breaks fan-out for that pod’s clients only.

## Restart order (safe default)

1. Stabilize **NATS** (cluster healthy, routes stable).
2. Restart or roll **API** replicas **after** NATS is healthy so the adapter reconnects cleanly.
3. Validate with the steps in [`multi-replica-socketio.md`](./multi-replica-socketio.md) and the **Validation** section in [`realtime-scaling.md`](../realtime-scaling.md).

## Split-brain / partial cluster

- If only some NATS nodes are reachable, clients may partition. Treat as **infrastructure incident**: fix routing/firewall before chasing app code.
- Do not mix replicas with **some** having `NATS_URL` and **some** without — behavior will be inconsistent.

## Monitoring

- Watch **`echo_rest_http_requests_total`** and existing socket/workspace metrics during rolls; pair with NATS server metrics from your platform.
- Repo alert rules: [`monitoring/prometheus/rules/`](../../monitoring/prometheus/rules/) (see [`monitoring/README.md`](../../monitoring/README.md)).

## Related documentation

- Architecture: [`realtime-scaling.md`](../realtime-scaling.md).
- Multi-replica drill: [`multi-replica-socketio.md`](./multi-replica-socketio.md).
