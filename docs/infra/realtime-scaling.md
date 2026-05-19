# Realtime scaling (Socket.IO + NATS)

## Product strategy: single-node first

Echo **defaults to one API process** with the Socket.IO **in-memory** adapter. Architecture and performance work should **optimize for that shape** (vertical scale, Postgres tuning, sensible connection limits, observability).

**Distributed realtime** (multiple API replicas, `NATS_URL`, shared presence/rate-limit semantics across nodes) is a **deliberate program** we intend to invest in **only after** reaching on the order of **~50,000 average concurrent users** (CCU — simultaneous connected/active usage; exact KPI to align with analytics/ops). Until then, multi-node setups are **optional** for early adopters, not the main engineering target.

The sections below describe **how** to run multiple instances when you choose to — they do not change the **default** deployment goal above.

## When to enable NATS

Run **one Socket.IO server per API process** with the default in-memory adapter only if you have a **single** Node process handling WebSockets. For **multiple replicas** behind a load balancer, set `natsUrl` so the backend attaches `@mickl/socket.io-nats-adapter` (see `attachSocketAdapterIfConfigured` in `backend/src/bootstrap/socket.ts`). Without a shared adapter, room broadcasts and workspace events only reach sockets on the same instance.

## Deployment checklist

1. **NATS** — Run a reachable NATS cluster; set `natsUrl` in the API environment to match `connectNats` in `backend/src/db/nats.ts`.
2. **HTTP / WebSocket** — Ensure the load balancer supports WebSocket upgrades (`Upgrade`, `Connection`), reasonable idle timeouts, and forwards `X-Forwarded-Proto` when TLS terminates at the edge (see `registerHttpsEnforcementIfConfigured`).
3. **State** — Treat socket connection state and ephemeral presence as **non-authoritative**. Permissions, membership, and message persistence remain in Postgres; clients must tolerate reconnects and duplicate delivery guards where applicable.
4. **Presence** — The presence sweep job (`startPresenceSweepJob`) runs per process; each sweep may emit many `presence:update` events (capped per run) for users flipped to `offline`. With multiple API nodes, **each node** runs its own sweep against the same Postgres table (idempotent); duplicate emits are acceptable.
5. **Multi-tab disconnect** — The API tracks an **in-process** count of authenticated sockets per user (`presenceSocketRegistry`). The user is written `offline` only when the **last** socket for that user **across the entire cluster** disconnects (coordinated via `fetchSockets()` on the per-user room). Another tab on any node keeps the user online.
6. **Staging checklist (presence)** — With one API node: open two browser tabs as the same user, confirm a friend still sees you online after closing one tab. With two replicas (NATS on): smoke-test that `presence:update` still reaches clients after sweep or explicit status change; confirm that last-socket-offline works correctly even when sockets are split across nodes.

## Validation

In staging with **two API replicas** and NATS configured: open two clients on different replicas (e.g. force different pods via headers or DNS) and confirm workspace/channel events (e.g. `publishEchoWorkspaceEvent` fan-out) reach both.

**Structured drill:** Follow `[docs/operations/runbooks/multi-replica-socketio.md](../operations/runbooks/multi-replica-socketio.md)` for prerequisites, step-by-step checks, and **presence** expectations (including per-process socket registry caveats above).

**Monitoring during validation:** Ensure Prometheus scrapes `**GET /api/v1/metrics`\*_ (see `[monitoring/README.md](../../monitoring/README.md)`) and watch alert rules under `[monitoring/prometheus/rules/](../../monitoring/prometheus/rules/)` — e.g. socket `reject_unknown` spikes, `echo_message_failed_total` rate, and REST RED series (`echo*rest_http*_`) for 5xx or latency regressions during replica rolls.
