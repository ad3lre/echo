# LiveKit voice (Layer 1) — progress

**Last updated:** 2026-04-06  
**Related plan:** `[../architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md](../architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)`  
**Voice intelligence (later):** `[../architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md](../architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)`

---

## At a glance

| Track                                          | What it means                                                                                                                                                                                                                                | Progress                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Layer 1 — local dev (P0)**                   | One LiveKit node, Echo API mints tokens, webhooks keep the DB roster in sync, Vue connects with audio/video/screenshare and speaking UI                                                                                                      | `████████████████████` **~99%**                                                  |
| **Layer 1 — transport polish (Phase 2)**       | Stats reliability, mute/deafen ↔ SFU, reconnect + tab teardown, server kick + track webhooks                                                                                                                                                 | `████████████████████` **shipped** (in-repo)                                     |
| **Layer 1 — moderation + dev TURN (Phase 3+)** | Server mute/deafen (DB + REST + `mutePublishedTrack`), workspace mute maps, `DELETE` channel → `deleteLiveKitRoom`, Compose **coturn** + `rtc.turn_servers`, voice metrics                                                                   | `████████████████████` **shipped** (in-repo)                                     |
| **Layer 1 — client hardening (2026-04)**       | Unified teardown (`onUnmounted` → `disconnect`), `voiceClientDiag` + gated traces, `livekitTrackAdapter`, connect staleness guards + stats tick mutex, `parseEchoLiveKitSessionResponse`, camera `switchActiveDevice('videoinput')` fallback | `████████████████████` **shipped** (in-repo)                                     |
| **Production hardening**                       | In-repo: operator checklist, example SFU YAML, `**hooks_livekit`** REST `route_group`, Prometheus `**echo_livekit`**alerts, Grafana panels, prod`**wss://**` startup guard. \*\*You still run hosted SFU, TLS TURN, DNS/certs outside git.   | `████████████████████` **100%** (repo; live infra is operator work)              |
| **Layer 2 — “smart voice”**                    | Intelligence, policies, adaptive behavior on top of stable transport (`[ECHO_VOICE_INTELLIGENCE_LAYER.md](../architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)`)                                                                                | `░░░░░░░░░░░░░░░░░░░░` **0%** (on purpose — not blocked by Layer 1 feature work) |

**Layer 2 status (dev):** **Paused.** Any sidecar wiring is **hard-disabled by default** and requires explicit enable flags to avoid affecting Layer 1 VC stability.

**Plain English:** Dev “pipes” are end-to-end, including **server-side mic enforcement** for moderation, **dev TURN** in Docker Compose, and **prometheus counters** for webhooks / `server/voice/moderate`. Speaking indicators stay **client-first** (`ActiveSpeakersChanged`); forwarding LiveKit `active_speakers_changed` to sockets is **off by default** (`LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK`). A **2026-04** pass tightened the **Vue LiveKit composable** (lifecycle, logging, adapter, API parse). **Production hardening (repo):** follow `[../operations/livekit-production.md](../operations/livekit-production.md)` — alerts, dashboards, `wss://` guard, and `server/ops/infra/livekit/livekit.production.example.yaml` are in-tree; **you** still provision hosted LiveKit, TLS TURN, DNS, and certs in your environment.

---

## Layer 1 vs Layer 2 — are we “ready for stage 2”?

**Names (avoid confusion):**

- **Layer 1** = this document: **transport-grade** LiveKit + Echo (tokens, webhooks, client room). Per `[LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md](../architecture/LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)`, Echo does not implement “intelligence” here.
- **Layer 2** = **Voice intelligence** only: `[ECHO_VOICE_INTELLIGENCE_LAYER.md](../architecture/ECHO_VOICE_INTELLIGENCE_LAYER.md)` (adaptive policy, quality interpretation, etc.). This is **not** the same as older internal labels “Phase 2 / Phase 3” **inside** Layer 1 (those transport milestones are already shipped).

**Readiness:**

| Question                                                                                  | Answer                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is **Layer 1 feature scope** (dev path) complete enough to **start Layer 2** design/code? | **Yes.** The dumb transport surface is in place; intelligence is explicitly Layer 2.                                                                                                                                         |
| Is **production** voice ready for paying users?                                           | **Repo is ready** (checklist, metrics, alerts). **Your deployment** must still run hosted SFU, `wss://`, TLS TURN, and HTTPS webhook URL — see `[../operations/livekit-production.md](../operations/livekit-production.md)`. |
| Did **VC polish** block Layer 2?                                                          | **No.** Layer 1 transport work is complete in-repo; optional `as any` / mock-gating cleanups in VC-adjacent UI remain **nice-to-have**.                                                                                      |

**Bottom line:** **Layer 1 (transport) is finished enough in-repo** to begin **Layer 2 (Voice Intelligence)** when product prioritizes it. **Operator** work (hosted SFU, TLS TURN, DNS/certs in **your** environment) proceeds on its own timeline; it is not a strict prerequisite for **starting** Layer 2 spikes, but it **is** required before **shipping** voice at competitor depth.

---

## Done so far (Layer 1)

### Core P0 (baseline)

- **Docker + dev workflow:** LiveKit + **coturn** run with Postgres when you use `npm run dev` (Compose `db:up` starts the stack). `npm run livekit:logs` tails the SFU.
- **LiveKit config:** Local `server/ops/infra/livekit/livekit.yaml` with dev keys, `**rtc.turn_servers`** → Compose service `**coturn`**, and a webhook URL that reaches the API on the host (`host.docker.internal`).
- **Backend — join session:** API route checks permissions and returns a **browser-safe LiveKit URL** plus a **short-lived join token** (publish **microphone** when not server-muted/deafened; **camera** and **screen_share** included unless opted out on mint).
- **Backend — webhooks:** Signature-verified events update `**echo_voice_participants`**, audit, and `**workspace_invalidated` for join/leave.
- **Backend — REST voice actions:** Join / leave / moderate paths log audit and broadcast so the UI stays consistent even outside webhooks.
- **Backend — workspace snapshot:** Voice channels include `**voiceParticipantIds`**, `**voiceServerMuteByUserId`**, `**voiceServerDeafenByUserId**`(from`server_muted`/`server_deafened`).
- **Security:** LiveKit webhook path is **exempt from CSRF** (external server cannot send your CSRF cookie).
- **Frontend:** `**livekit-client`** via `**useLiveKitVoiceRoom`** + `**useServerVoiceSession`** — session fetch, connect/disconnect, **video/screenshare** toggles, **remote track** map for tiles, **speaking** / audio level, device switching, output volume; `**provideSpeakingState`** in `**AppLayout.vue`**; real Echo `**handleVcModerate`** posts server mute/deafen/disconnect.
- **Tests:** Backend `**npm run test:echo:livekit`** covers room naming, token mint (when env set), parsing, webhook/DB reconciliation, **server mute/deafen** rows, and **join token grants when mic publish is blocked.

### Phase 2 (transport + control plane)

- **Client stats:** `**getSenderStats`** with `**getRTCStatsReport()`** fallback via `**livekitTrackAdapter`**; stats tick extracted + **re-entrancy guard**; no fake `**serverRegion` sentinel in metrics.
- **Mute / deafen:** `**vcMuted` / `vcDeafened`** → `**applyVcAudioState`** (mic + remote **audio subscription policy); handles new participants/tracks while deafened.
- **Reconnect:** `**RoomEvent.Reconnecting` / `Reconnected`** sync `**roomState`** and stats polling; `**Disconnected`** tears down via shared local reset + `**lkRoom` cleared (aligned with manual disconnect).
- **Tab teardown:** `**beforeunload`** + `**pagehide`** → `**disconnect()`**; `**onUnmounted`** also calls `**disconnect()**`so unmount cannot leave a live`**Room\*\*`.
- **Room service:** `**RoomServiceClient`** helpers in `**livekitAdapter.ts`** (`listRooms`, `listParticipants`, `**removeParticipant`**, `**mutePublishedTrack`**, `**deleteRoom**`, `**setLiveKitParticipantMicrophoneMuted\*\*`).
- **Moderation + SFU:** `**voice/moderate` **disconnect** removes the participant from the LiveKit room; **server mute/deafen** updates DB and syncs SFU mic mute.
- **Webhooks — tracks:** `**track_published` / `track_unpublished`** for **camera** and **screen_share** update `**has_published_camera`/`has_published_screen`** on `**echo_voice_participants`**, audit, `**workspace_invalidated`.
- **Webhooks — active speakers:** Logged + metric; **socket/workspace fan-out disabled by default** (set `**LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK=true`** to experiment). UI uses `**ActiveSpeakersChanged` on the client.

### Phase 3+ (shipped)

- **Schema:** `**echo_voice_participants.server_muted`**, `**server_deafened`** (`echoTables.ts`).
- **Channel delete:** `**DELETE /channels/:channelId`** best-effort `**deleteLiveKitRoom` for voice channels before DB delete.
- **Metrics:** `**echo_voice_moderate_total`**, `**echo_livekit_webhook_event_total`** (`echoMetrics.ts`).

### Client composable hardening (2026-04)

- `**voiceClientDiag**` (gated `**voiceClientTrace**` + dev/warn/error policy) replaces scattered `**console.***` in VC paths; `**[voiceClientTrace.ts](../../clients/web/src/observability/voiceClientTrace.ts)**`.
- `**clearLocalVoiceUiState**`, `**connectGeneration` / `connectAbortTarget**` abort stale `**connect()**` after `**await**`; `**Room.disconnect()**` handled as async-safe.
- `**clients/web/src/features/voice/livekit/livekitTrackAdapter.ts**`: sender/RTC stats + volume helpers; `**parseEchoLiveKitSessionResponse**` on `**postEchoVoiceLivekitSession**`.
- **ChannelPanel** defaults `**liveKitState`** to `**idle`** when omitted; `**switchCamera`** prefers `**switchActiveDevice('videoinput')`\*\* with toggle fallback.

### Production hardening (in-repo)

- `**[../operations/livekit-production.md](../operations/livekit-production.md)**` — operator checklist (`wss://`, HTTPS webhook, TLS TURN, secrets, firewall, verification).
- `**[../../infra/livekit/livekit.production.example.yaml](../../server/ops/infra/livekit/livekit.production.example.yaml)**` — commented template for production SFU + webhook URL shape.
- **REST metrics:** `hooks_livekit` route group for `POST /api/v1/hooks/livekit` (`echoHttpObservability.ts`).
- **Prometheus:** group `echo_livekit` in `server/ops/monitoring/prometheus/rules/echo-alerts.yml` (`EchoLivekitWebhook4xxSustained`, `EchoLivekitWebhookUnknownEventsSpike`, `EchoVoiceModerateForbiddenDominatesOk`).
- **Grafana:** LiveKit / voice panels on `server/ops/monitoring/grafana/echo-overview.json`.
- **Config:** production startup **fails** if LiveKit is enabled and `LIVEKIT_PUBLIC_URL` starts with `ws://` (`config.ts`).

---

## What you still need to do (near term)

1. **Install deps** — `npm install` at repo root / workspaces; `livekit-server-sdk` (backend), `livekit-client` (frontend).
2. **Set `.env` for local voice** — `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_PUBLIC_URL` (see `.env.example`); must match `**server/ops/infra/livekit/livekit.yaml`** keys unless both change together. **TURN** user/pass in YAML must match `**docker-compose.yml`** `coturn` `**--user=`** (LiveKit does not read `.env` for TURN — copy values manually or use a templating step for prod).
3. **Manual check** — Two browsers: join VC, confirm audio/video/screen, mute/deafen, **server mute** from a moderator, reconnect (toggle network), moderator **disconnect** removes user from SFU and DB.
4. **If the API is not on port 3000** — Update the webhook URL inside `**server/ops/infra/livekit/livekit.yaml` accordingly.
5. **CI** — `npm run test:echo:livekit` needs `**PG_TEST_URL` or `DATABASE_URL`** for DB sections; `**LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`** optional for JWT portions. `**npm run test:e2e`** uses mock stack (no LiveKit); see `clients/web/cypress/e2e/smoke.cy.ts`.

---

## Later / not started (by design or roadmap)

| Item                           | Notes                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Production TLS TURN**        | **Operator:** deploy TLS coturn or provider TURN; dev **3478** UDP is not sufficient — `[../infra/livekit-turn.md](../infra/livekit-turn.md)`, `[../operations/livekit-production.md](../operations/livekit-production.md)`. |
| **Production LiveKit**         | **Operator:** separate host, `**wss://`, keys, firewall — checklist in `[../operations/livekit-production.md](../operations/livekit-production.md)`.                                                                         |
| **Observability**              | **In-repo:** Grafana panels + `**echo_livekit`** Prometheus rules; **operator: scrape `/api/v1/metrics`, wire alerts — `[../infra/livekit-observability.md](../infra/livekit-observability.md)`.                             |
| **Layer 2 voice intelligence** | Adaptive policy, quality scoring, etc. — `**ECHO_VOICE_INTELLIGENCE_LAYER.md`.                                                                                                                                               |

---

## Quick file map

| Area                                   | Where                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Compose + health + coturn              | `docker-compose.yml`                                                                                             |
| LiveKit server config (dev)            | `server/ops/infra/livekit/livekit.yaml`                                                                          |
| TURN / prod notes                      | `docs/infra/livekit-turn.md`                                                                                     |
| Production checklist                   | `docs/operations/livekit-production.md`                                                                          |
| Example SFU YAML (prod template)       | `server/ops/infra/livekit/livekit.production.example.yaml`                                                       |
| Metrics / alerts                       | `docs/infra/livekit-observability.md`, `server/ops/monitoring/prometheus/rules/echo-alerts.yml` (`echo_livekit`) |
| Token + room + **RoomService**         | `server/backend/src/services/livekit/livekitAdapter.ts`                                                          |
| Session + voice REST                   | `server/backend/src/api/routes/echo/voice.ts`                                                                    |
| Webhooks                               | `server/backend/src/api/routes/livekitWebhook.ts`                                                                |
| CSRF exemption                         | `server/backend/src/auth/csrf.ts`                                                                                |
| Config flags                           | `server/backend/src/config.ts`                                                                                   |
| Voice participant schema + track flags | `server/backend/src/db/echoTables.ts` (`echo_voice_participants`)                                                |
| Workspace roster + moderation maps     | `server/backend/src/domain/echoStore/channels/categoriesWorkspace.ts`                                            |
| Voice domain moderation                | `server/backend/src/domain/echoStore/voice/voice.ts`                                                             |
| Frontend session API                   | `clients/web/src/api/echo/voice.ts`                                                                              |
| Room composable                        | `clients/web/src/features/voice/useLiveKitVoiceRoom.ts`                                                          |
| Track / stats adapter                  | `clients/web/src/features/voice/livekit/livekitTrackAdapter.ts`                                                  |
| VC diagnostics                         | `clients/web/src/observability/voiceClientTrace.ts` (`voiceClientTrace`, `voiceClientDiag`)                      |
| Session + layout wiring                | `clients/web/src/features/layout/composables/voice/useServerVoiceSession.ts`                                     |
| Voice orchestration                    | `clients/web/src/features/voice/voiceService.ts`                                                                 |
| Socket event kind (optional)           | `contracts/types/socket.ts` (`voice_active_speakers`)                                                            |

---

_Update this file when production SFU ships or Layer 2 starts; roll **[STATUS_AND_PRODUCTION_READINESS.md](../reviews/STATUS_AND_PRODUCTION_READINESS.md)** from here._
