# LiveKit TURN (dev Compose)

This stack runs **coturn** next to **livekit** so browsers behind strict NAT can use relay candidates.

## What is configured

- **docker-compose.yml** — `coturn` service (image `coturn/coturn:4.10.0-r1-alpine@sha256:9b5db8e011848c903ebbeaa9b88e77f2dc4438db10e0891971e11ac354b84fce`), long-term credentials user `echo`, password `echo_turn_dev_secret`, UDP/TCP **3478**.
- **server/ops/infra/livekit/livekit.yaml** — `rtc.turn_servers` points at host `coturn` (Docker DNS), same port and credentials.
- **`livekit.extra_hosts`** — `host.docker.internal:host-gateway` so dev webhooks in `livekit.yaml` can reach the Echo API on the **Linux host** (Docker Desktop provides this name without `extra_hosts`). See [`../operations/linux-vps-deployment.md`](../operations/linux-vps-deployment.md).

LiveKit does not expand environment variables inside YAML; if you change the coturn secret, update **both** files. For production, keep a **single source of truth** for TURN credentials (e.g. secrets manager) and render `**livekit.yaml`\*_ / coturn args from templates in your deploy pipeline — Echo does not read `LIVEKIT*TURN*_` into LiveKit automatically.

## Firewall / ports

- **3478** UDP (and TCP for some clients) — TURN signaling.
- **57000–57100** UDP — WebRTC media in **local Compose** (LiveKit `rtc.port_range_*`). (Echo avoids **50000–50100** by default because Windows Hyper-V / excluded UDP ranges often overlap that band and Docker cannot bind.)
- **57000–60000** UDP — **production** SFU range in [`livekit.production.example.yaml`](../../server/ops/infra/livekit/livekit.production.example.yaml); open the full range on VPS/cloud firewalls.

On a VPS or cloud host, open these in the security group / firewall. Docker Desktop on Windows maps published ports to localhost.

## Production

- Prefer **TLS TURN** (e.g. 5349) with real certificates and a public hostname, or LiveKit Cloud / managed TURN.
- Set `**LIVEKIT_PUBLIC_URL`** to `**wss://…\*\*`for browsers; keep the Echo backend’s API host aligned with the HTTP(S) API LiveKit exposes for RoomService (see`liveKitServiceHttpUrl` in the backend LiveKit adapter).
- The LiveKit **webhook** URL must be **HTTPS** and reachable from wherever the SFU runs (not `http://host.docker.internal`).

**Full production checklist (topology, secrets, observability):** [`../operations/livekit-production.md`](../operations/livekit-production.md). Example SFU YAML: [`../../infra/livekit/livekit.production.example.yaml`](../../server/ops/infra/livekit/livekit.production.example.yaml).

## Verify

1. `docker compose up -d coturn livekit`
2. Join a voice channel from a browser; in WebRTC internals, confirm **relay** candidates appear when symmetric NAT is simulated.

## Active speakers

LiveKit can emit `active_speakers_changed` webhooks. Echo logs them and increments metrics; **socket/workspace fan-out** of `voice_active_speakers` is **disabled by default**. Set `**LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK=true`** only if you are experimenting with server-driven hints. Production UI should rely on `**ActiveSpeakersChanged\*\*` in the browser for low latency.

## Observability

See `[livekit-observability.md](./livekit-observability.md)` for Prometheus metric names and alert ideas.
