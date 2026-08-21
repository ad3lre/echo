# Echo Voice Intelligence Layer (Layer 2) — Architecture Plan

**Status:** Plan (not implemented) — **paused until Layer 1 production edge SLOs are met**
**Date:** 2026-04-04 (updated: three-job sidecar, three health states, diff rate limits, L0–L3 authority, backoff, recovery asymmetry)
**Prerequisite reading:** `[LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md](./LIVEKIT_VC_INFRASTRUCTURE_LAYER_1.md)` (Layer 1 - Voice Substrate), `[STACK.md](../../overview/STACK.md)` (Voice / Video, Scale strategy), `[STATUS_AND_PRODUCTION_READINESS.md](../../reviews/STATUS_AND_PRODUCTION_READINESS.md)` (Pillar 12 — Voice / SFU at 8%).

**Gate (do not enable Layer 2 in production yet):** Ship **`wss://`**, **TLS TURN**, pinned SFU image, UDP **57000–60000**, and stable webhook/reconcile metrics first ([`../operations/livekit-production.md`](../../operations/livekit-production.md)). Keep `VOICE_SIDECAR_ENABLED=false` (default) and avoid adaptive policy loops until those checks pass.

---

## 0. Design intent

**Do not build a second SFU.** LiveKit already owns packet routing, congestion control, bitrate adaptation, and simulcast/SVC behavior. Echo must **not** compete with that. The Voice Intelligence Layer is a **control and policy plane** that _guides_ experience (priorities, subscription hints, room-level policy, stable degradation signals)—not a replacement media engine.

**Strict boundary:**

| Layer                 | Owns                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LiveKit (Layer 1)** | Transport, real-time media delivery, SFU forwarding, built-in adaptation. **Source of truth** for low-level transport behavior.                                               |
| **Echo (Layer 2)**    | Policy, prioritization, experience rules, smoothed state, diff-based control actions. **Never** continuous micromanagement of low-level media every few hundred milliseconds. |

If Echo’s _intent_ conflicts with LiveKit’s adaptation, **adjust policy** (fewer or gentler control actions), do not fight the SFU aggressively.

LiveKit stays behind a service adapter so it can be swapped later without rewriting Echo product logic.

**Hard constraint:** Voice infrastructure runs on its own process / node, fully separated from the Echo API + Socket.IO tier, so media traffic cannot starve chat, REST, or presence.

---

## 0.1 VC infra design principles (LiveKit-aligned)

These rules constrain implementation; violating them tends to cause oscillating quality and fights with LiveKit’s own CC.

1. **No second SFU** — Echo adds a **control layer**, not alternate congestion or forwarding logic.
2. **Separate decision logic from media transport** — Policy + prioritization + experience rules only on the Echo side; LiveKit handles media pipes.
3. **No hard optimization loops at sub-second cadence** — Avoid recalculating and pushing full configs every few hundred ms. Prefer **meaningful events** (join, leave, active-speaker change, congestion spike) plus **slow, smoothed** adjustments.
4. **Stable model, not raw telemetry** — Maintain **smoothed** per-user quality, a **stable** room congestion summary, and a **persistent** priority model. Do **not** drive decisions from instantaneous noisy stats alone.
5. **Diff-based control** — Compute **desired** state, compare to **last applied** state, send **minimal deltas** to LiveKit APIs. Reduces jitter and SFU churn.
6. **Stability over perfect optimization** — Users notice consistency and lack of sudden jumps more than “optimal” allocation. Avoid frequent quality switching when marginal gains are unclear.
7. **Hysteresis everywhere** — **Sustained** improvement before upgrading; **immediate but bounded** downgrade on clear degradation (prevents flip-flop).
8. **Explicit, deterministic priority rules** — e.g. active speaker > listeners; screen share > passive audio; important roles (e.g. stage/mod) > regular users when product defines them; AFK/low-engagement lower priority. Document and test these rules.
9. **Hybrid control** — **Events** for immediacy; **slow periodic reconciliation** (seconds-scale, not sub-second) to fix drift and enforce consistency. Neither mode alone is enough.
10. **Start simple** — **Three operational states**, simple congestion detection, **few** control actions (L1-first); evolve without new tier enums. Over-engineering early is hard to debug in real time.
11. **LiveKit wins transport conflicts** — When in doubt, defer to LiveKit’s adaptation; narrow Echo’s policy surface.
12. **Stable degradation** — Under stress: graceful reduction, no rapid oscillation; **voice intelligibility** beats maximizing bitrate.

### 0.2 Sacred invariant (non-negotiable)

The core correctness of this design is:

`**desired state` ↔ `last applied state` → `diff` → minimal LiveKit actions\*\*

That pipeline is what keeps the system **debuggable, stable, replayable, and predictable under load**. Any change that bypasses diffing, batches full reconfiguration every tick, or hides state transitions loses those properties—treat that as an architecture regression.

---

## 1. Current state (what exists today)

Echo already has scaffolding for voice state management — none of it touches actual media transport yet.

### Backend

| Component                       | Location                                             | What it does                                                                                                  |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `echo_voice_participants` table | `server/backend/src/db/echoTables.ts`                | Tracks who is in which voice channel (server, channel, user, joined_at).                                      |
| `voice.ts` domain               | `server/backend/src/domain/echoStore/voice/voice.ts` | Join (permission + user-limit + ban checks), leave, list participants, moderation (disconnect / move).        |
| `echoVoice.ts` routes           | `server/backend/src/api/routes/echo/voice.ts`        | REST: `POST .../voice/join`, `POST .../voice/leave`, `GET .../voice/participants`, `POST .../voice/moderate`. |

### Frontend

| Component                | Location                                                                                                                     | What it does                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `voice.ts` API client    | `clients/web/src/api/echo/voice.ts`                                                                                          | Fetch wrappers for join / leave / participants / moderate.                     |
| `voice.ts` orchestration | `clients/web/src/features/voice/voiceService.ts`                                                                             | `createVoiceService` — calls REST join/leave, triggers workspace hydration.    |
| `voiceRouting.ts`        | `clients/web/src/features/voice/voiceRouting.ts`                                                                             | Socket adapter emit stubs (`voice:join`, `voice:leave`).                       |
| Layout composables       | `useServerVoiceSession.ts`, `useAppLayoutVoiceRouting.ts`, `useChannelPanelVoiceState.ts`, `useChannelPanelVoiceSettings.ts` | UI state: current VC channel, side chat, bitrate settings, role-preview guard. |

### Shared types

`contracts/types/channel.ts` — `Channel.type: 'text' | 'voice'`, voice permission keys (`connect`, `speak`, `video`, `muteMembers`, `deafenMembers`, `moveMembers`, `useVoiceActivity`, `prioritySpeaker`, `stream`), `bitrateBps`, `userLimit`.

### What is missing

Everything below the REST/socket "who is in the room" layer: **actual WebRTC media, SFU forwarding, codec negotiation, bandwidth sensing, quality adaptation, TURN/STUN, client-side media capture, and the intelligence layer** described in this document.

---

## 2. Deployment topology

### 2.1 Process isolation — voice runs on its own node

```
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│  Echo API Node                  │   │  Voice Node (separate process)   │
│  ─────────────────────          │   │  ──────────────────────          │
│  Fastify REST + Socket.IO       │   │  LiveKit Server (or cluster)     │
│  Postgres pool                  │   │  Echo Voice Intelligence Sidecar │
│  Chat / RBAC / presence / DMs   │   │  ─────────────────────────────   │
│  Prometheus /metrics            │   │  3 jobs: State / Policy / Diff   │
│                                 │   │  + adapter, metrics (support)    │
│  ┌───────────────────────┐      │   │  Prometheus scrape               │
│  │ Voice Signaling API   │◄─────┼───┤                                  │
│  │ (token mint, state)   │      │   │                                  │
│  └───────────────────────┘      │   └──────────────────────────────────┘
└─────────────────────────────────┘
         ▲                                          ▲
         │ REST/WS (chat, presence, auth)           │ WebRTC media (UDP/TCP)
         │                                          │
    ┌────┴──────────────────────────────────────────┴────┐
    │                   Browser / Client                  │
    │  LiveKit client SDK  +  Echo voice composables      │
    └─────────────────────────────────────────────────────┘
```

### 2.2 Why separate

| Concern                 | Rationale                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resource isolation**  | WebRTC media forwarding is CPU- and bandwidth-intensive. Co-locating it with the Echo API would risk latency spikes on REST, Socket.IO, and DB query hot paths. |
| **Independent scaling** | The API tier scales on connection count + DB queries; the voice tier scales on concurrent media streams. Different cost curves, different bottleneck profiles.  |
| **Failure domains**     | A voice node OOM or network saturation must not take down chat. A chat deploy must not drop active calls.                                                       |
| **Security surface**    | Media ports (UDP range) are exposed on the voice node only; the API node exposes only HTTP/WS.                                                                  |

### 2.3 Boundary enforcement

To keep the separation clean:

1. **No shared process memory.** The Echo API and LiveKit/sidecar never run in the same OS process.
2. **Communication is over HTTP + authenticated tokens only.** The Echo API mints a short-lived LiveKit join token (signed with a shared secret); the client presents it to the voice node. The voice sidecar calls back to the Echo API for room metadata or permission checks via internal REST (or reads a shared Postgres view if latency matters).
3. **Database access.** The voice sidecar may read `echo_voice_participants`, `echo_channels`, and `echo_server_members` (read replicas are fine) but **never writes** to Echo domain tables — writes flow through Echo API REST calls or are limited to voice-specific tables (e.g. `echo_voice_quality_log`).
4. **Deployability.** Each tier has its own Dockerfile / service definition, health check, and Prometheus scrape target. CI builds and tests them independently.
5. **Config boundary.** The Echo API needs: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (pointing at the voice node). The voice node needs: its own LiveKit config, `ECHO_API_INTERNAL_URL` (for callbacks), and the same `LIVEKIT_API_KEY`/`SECRET`.

### 2.4 Single-node vs multi-node LiveKit

| Phase       | Topology                                                                                                                                                                    | When                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Phase 1** | Single LiveKit instance on one VPS (or container). Enough for low hundreds of concurrent voice users.                                                                       | MVP / early production.                                                                      |
| **Phase 2** | LiveKit multi-node with built-in node selection + region awareness. Echo's intelligence sidecar runs per-node or as a centralized service reading LiveKit's room state API. | When voice concurrency regularly exceeds single-node headroom or geographic latency matters. |

LiveKit handles node-to-node media routing internally when clustered; Echo's Voice Intelligence Layer operates at the **room** level regardless of how many LiveKit nodes back it.

---

## 3. Echo Voice Intelligence Layer — service design

Echo implements a **policy / control** stack only. It does **not** re-implement SFU congestion, encoder-side simulcast decisions, or per-packet routing—that remains LiveKit’s domain.

### 3.1 Sidecar: exactly three jobs (anti–“second SFU control plane”)

If the sidecar grows unchecked, it becomes **five peer responsibilities** (room model + policy + orchestration + adapter + metrics/decisions)—that is how teams accidentally build a **second SFU control plane**.

**Conceptual split (same process is OK at first; boundaries must be enforced in code):**

| Job                      | Responsibility                                                                                                                                                                         | What it must **not** do                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **1 — State builder**    | Ingest LiveKit webhooks/events; maintain **room snapshot** (participants, tracks, speakers); run **smoothers** on raw signals; store `**lastApplied`\*\* control snapshot for diffing. | No “what should we do?” product policy. No LiveKit writes. |
| **2 — Policy evaluator** | **Pure logic:** from snapshot → `**desired` state\*\* (subscriptions, caps, flags). Deterministic inputs → deterministic outputs.                                                      | No I/O, no timers, no SDK calls.                           |
| **3 — Diff emitter**     | `desired` vs `lastApplied` → **minimal delta**; **rate-limit** emits; call adapter; verify or accept LiveKit outcome; update `lastApplied`.                                            | No re-building the whole room model here.                  |

**Support (not equal peers):** LiveKit adapter, Prometheus, structured logs, config. They must **not** accumulate “system behavior management” logic—that is drift.

**Creep alarm:** If any module starts **managing overall system behavior** (implicit orchestration loops, ad-hoc SDK calls outside the diff emitter, policy hidden in metrics paths), it has already drifted—refactor back into the three jobs.

```
┌─────────────────────────────────────────────────────────────┐
│  Sidecar                                                     │
│  ┌──────────────────┐   ┌──────────────────┐   ┌───────────┐ │
│  │ 1 State builder  │ → │ 2 Policy eval    │ → │ 3 Diff    │ │
│  │ webhooks, snap,  │   │ pure: desired    │   │ rate-limit│ │
│  │ smoothers,       │   │                  │   │ backoff   │ │
│  │ lastApplied      │   │                  │   │ → adapter │ │
│  └──────────────────┘   └──────────────────┘   └─────┬─────┘ │
│         ▲ support: metrics, logs, config, LiveKit adapter ◄─┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Job 1 — State builder

**Inputs:** LiveKit webhooks (`participant_*`, `track_*`, `active_speakers_changed`, quality-related events), optional client quality summaries on data channel.

**Outputs:** Immutable **room snapshot** per tick/event, including:

- Participant identity, published track SIDs, active-speaker flags (event-driven).
- **Smoothed** scalar features per participant (EWMA / windowed—not exposed as extra “tiers”).
- **Operational health** per participant and room: one of `**Healthy` | `Degraded` | `Critical`\*\* (see §3.5)—derived from smoothers + hysteresis, never from a single sample.
- `**lastApplied`:\*\* last control state Echo believes LiveKit accepted (for diffing).

**Cadence by signal type (do not use one timer for everything):**

| Signal / concern                                 | Cadence                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Speaker / join / leave / track publish**       | **Event-driven only** — no periodic poll for these.                                                            |
| **Quality smoothing**                            | **10–15s** evaluation window merge into smoothers (not sub-second).                                            |
| **Topology vs LiveKit** (participant list drift) | **30–60s** reconciliation pull from LiveKit `ListParticipants` / room API if needed.                           |
| **Congestion spike**                             | **Event** when smoothed room state crosses into `Degraded`/`Critical` with hysteresis—not a fast polling loop. |

### 3.3 Job 2 — Policy evaluator (pure)

**Input:** Room snapshot + product rules (priority weights, role hints).

**Output:** `DesiredParticipantControl` (same shape as before: subscription hints, rare mute flags—**no** SDK calls).

**Publish-side:** Prefer **no** continuous publish-bitrate targets in policy output; LiveKit owns encoder/CC. Exceptions belong behind **L3** authority (§3.7) only.

### 3.4 Job 3 — Diff emitter

**Pipeline:** `desired` vs `lastApplied` → `delta`. If empty, stop.

**Diff rate limiting (required):** Even valid diffs can **burst** and destabilize LiveKit. Cap **control actions per room per time window**:

| Room / system operational state | Max control actions (count of SDK mutations e.g. subscription updates)                                                                                              | Window  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Healthy**                     | **1**                                                                                                                                                               | **10s** |
| **Degraded**                    | **1**                                                                                                                                                               | **5s**  |
| **Critical**                    | **Immediate** response allowed but still **one bounded batch** per event (e.g. single `applySubscriptionPolicy` with multiple hints in one call)—no unbounded loops |         |

If an event would produce more than one logical change, **coalesce** into the smallest number of API calls. Queue overflow: drop lower-priority deltas (never drop safety-critical L3 if product defines it).

**Disagreement / backoff (LiveKit wins transport):** If Echo applies a delta and **observed LiveKit/participant state** (on next snapshot) still disagrees with `desired` after apply—treat as **neutralized by SFU**. After **N** consecutive failed reconciliations for the same intent (e.g. N=3), **back off**: stop re-issuing the same diff for a **cooldown** (e.g. 60s), **lower authority** to L1/L0 for that dimension, and **log** `voice.control_backoff`. Do not burn control cycles fighting LiveKit.

### 3.5 Operational health states — **three only** (anti–tier explosion)

**Problem:** Named tiers like Excellent / Good / Fair / Poor multiply in production into per-user, per-device, per-room, per-role, per-network exceptions → **unreadable control spaghetti**.

**Rule:** Echo exposes **exactly three operational states** for policy and UI:

| State            | Meaning (after smoothing + hysteresis)                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `**Healthy`\*\*  | Normal operation; default subscription hints; strictest diff rate limit.                                    |
| `**Degraded`\*\* | Elevated loss/latency or room stress; bias to lower layers / pause non-essential video; looser diff limit.  |
| `**Critical**`   | Severe sustained issues; intelligibility-first; allow bounded immediate batch; still no per-packet control. |

**Nuance** (per-user exceptions, device class, role, room caps) lives in **internal numeric weights and ordering** inside the policy evaluator—not new named tiers. If someone asks for a fourth tier in PR review, the answer is **no**—encode as weight or priority rule.

Room-level state uses the **same three labels** (or derive room from worst participant + aggregate smoothers—still three labels out).

### 3.6 Priority weights (deterministic, testable)

Same as before: active speaker > screen share > recent speaker > explicit role boost (RBAC/product) > listener > AFK. Implement as **ordered weights**, not new health states.

### 3.7 Control authority levels (prevent slow aggression creep)

Not all actions are equal. Classify every control the diff emitter can apply:

| Level  | Name          | Examples                                                     | When allowed                                              |
| ------ | ------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| **L0** | Observational | Metrics, logs, snapshot updates                              | Always; **no** LiveKit mutation                           |
| **L1** | Soft hints    | Subscription preferences, default max layer hints            | Healthy+; subject to diff rate limit                      |
| **L2** | Strong hints  | Video suppression, layer caps for non-speakers               | Degraded+; rate limited                                   |
| **L3** | Emergency     | Hard mute, full video-off for room, product-defined evacuate | Critical + explicit product/ops gate; still bounded batch |

Policy evaluator **tags** each desired delta with max authority. Diff emitter **refuses** to escalate (e.g. no L3 from Healthy without a defined spike rule). This stops the policy engine from **slowly becoming more aggressive** over time without review.

### 3.8 Echo must NEVER (anti-regression contract)

Future changes must not reintroduce a second SFU. **Echo must NEVER:**

- Adjust **per-packet** behavior or micro-time-scale forwarding.
- **Override encoder** behavior **continuously** (repeated publish codec/bitrate tweaks every few seconds).
- **Force bitrate changes repeatedly** in a loop; at most rare, authority-gated, rate-limited L3-style caps.
- Act on **single-sample** metrics (no instant tier/health flip from one RTT sample).
- **Fight LiveKit congestion control** (if conflict persists, backoff §3.4; narrow policy, don’t hammer APIs).

Code review checklist: any PR touching voice control must confirm none of the above.

### 3.9 LiveKit adapter (support)

Thin translation layer; **only** the diff emitter calls mutation methods. All LiveKit SDK imports live here — **nothing else in Echo imports LiveKit directly.**

```typescript
interface VoiceSfuAdapter {
  createRoom(roomId: string, opts: RoomOptions): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  mintJoinToken(
    roomId: string,
    userId: string,
    permissions: TokenPermissions,
  ): string;
  applySubscriptionPolicy(
    roomId: string,
    updates: SubscriptionPolicyDelta[],
  ): Promise<void>;
  muteTrack(roomId: string, trackSid: string): Promise<void>;
  unmuteTrack(roomId: string, trackSid: string): Promise<void>;
  listParticipants(roomId: string): Promise<ParticipantInfo[]>;
  getRoomStats(roomId: string): Promise<RoomStats>;
  handleWebhook(body: unknown, authHeader: string): WebhookEvent;
}
```

If LiveKit is replaced (e.g. custom Rust SFU per `[STACK.md](../../overview/STACK.md)`), only this adapter changes—**Echo product logic stays on `DesiredParticipantControl` + diff semantics**, not LiveKit types.

### 3.10 Desired state shape (illustrative)

```typescript
interface DesiredParticipantControl {
  participantId: string;
  subscriptionHints: {
    trackSid: string;
    maxVideoQuality: 'high' | 'medium' | 'low' | 'off';
  }[];
  muteRemoteVideo?: { trackSid: string; muted: boolean }[];
  /** L1–L3 tag per field group — enforced in diff emitter */
  maxAuthority?: 'L1' | 'L2' | 'L3';
}
```

### 3.11 Pseudocode (three jobs + rate limit + backoff)

```
onLiveKitEvent(room, event):
  snapshot = StateBuilder.applyEvent(room, event)
  desired = PolicyEvaluator.desiredFromSnapshot(snapshot)
  DiffEmitter.maybeEmit(room, desired, snapshot.lastApplied)  // enforces rate limit + backoff

onQualitySmoothingTick(room):  // 10–15s driver, not sub-second
  snapshot = StateBuilder.refreshSmoothers(room)
  desired = PolicyEvaluator.desiredFromSnapshot(snapshot)
  DiffEmitter.maybeEmit(room, desired, snapshot.lastApplied)

onTopologyReconcileTick(room):  // 30–60s
  snapshot = StateBuilder.reconcileWithLiveKit(room)
  desired = PolicyEvaluator.desiredFromSnapshot(snapshot)
  DiffEmitter.maybeEmit(room, desired, snapshot.lastApplied)
```

`DiffEmitter.maybeEmit`: compute `delta`; if empty return; if rate limit blocks, queue or coalesce; apply via adapter; on verify failure increment backoff counter; on success update `lastApplied` and clear backoff for that intent.

---

## 4. Data flow — joining a voice channel

```mermaid
sequenceDiagram
  participant Client
  participant EchoAPI as Echo API Node
  participant DB as Postgres
  participant VoiceNode as Voice Node + LiveKit
  participant Sidecar as Intelligence Sidecar

  Client->>EchoAPI: POST /servers/:sid/channels/:cid/voice/join (with session cookie)
  EchoAPI->>DB: permission checks (RBAC, ban, user limit)
  DB-->>EchoAPI: ok
  EchoAPI->>DB: INSERT echo_voice_participants
  EchoAPI->>EchoAPI: mintJoinToken(roomId, userId, perms)
  EchoAPI-->>Client: 200 { livekitToken, livekitUrl }

  Client->>VoiceNode: Connect with LiveKit token (WebRTC)
  VoiceNode-->>Sidecar: webhook: participant_joined
  Sidecar->>Sidecar: Update room model; smooth quality signals (no per-ms churn)
  Sidecar->>Sidecar: Compute desired control; diff vs last applied
  Sidecar->>VoiceNode: Apply minimal subscription/policy deltas (LiveKit SDK)

  Note over Sidecar,VoiceNode: Events → State builder → Policy → Diff (rate-limited).<br/>Quality smooth 10–15s; topology reconcile 30–60s—no single rigid timer.

  Client->>EchoAPI: POST /servers/:sid/voice/leave
  EchoAPI->>DB: DELETE echo_voice_participants
  Client->>VoiceNode: disconnect WebRTC
  VoiceNode-->>Sidecar: webhook: participant_left
  Sidecar->>Sidecar: remove from room state
```

---

## 5. Failure handling and degradation behavior

### 5.1 Failure modes

| Failure                        | Detection                                                                  | Response                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LiveKit node crash**         | Health check failure; LiveKit's own reconnect for clustered setups         | Clients auto-reconnect (LiveKit SDK handles ICE restart). If single-node, voice is down — Echo API marks participants as disconnected after a grace period; client shows "reconnecting" UI.                                                  |
| **Intelligence sidecar crash** | Process supervisor / health endpoint                                       | Quality decisions freeze at last-known-good state (LiveKit continues forwarding at current settings). Restart sidecar; it rebuilds room state from LiveKit `ListParticipants` + `ListRooms`. No data loss — sidecar is stateless on restart. |
| **Echo API unreachable**       | Sidecar callback timeout                                                   | Sidecar operates in **degraded mode**: no new permission checks, no room metadata refresh. Existing sessions continue. New joins are blocked (client cannot get a token).                                                                    |
| **Network partition (client)** | LiveKit ICE failure / DTLS timeout                                         | LiveKit SDK auto-reconnects with ICE restart. If reconnect fails within 30s, client shows "disconnected" and stops publishing. On reconnect, sidecar **refreshes smoothers** (no instant health-state jump from one sample).                 |
| **Sustained congestion**       | Smoothed room → `**Degraded`** / `**Critical`\*\* (three-state model §3.5) | **Stable degradation:** one bounded step per rate-limit window; then wait. Prefer LiveKit audio path; log `voice.room_degraded`.                                                                                                             |

### 5.2 Stable degradation cascade (experience-first)

Design for **stable degradation**, not perfect quality. Steps are **policy hints** (mostly receive-side / subscription) applied as **diffs**, with **cooldowns** between steps so LiveKit’s CC is not thrashed.

Suggested order (each step waits for hysteresis / cooldown before the next):

1. **Lower remote video layers** for non-speakers and lowest-priority participants (subscription policy).
2. **Pause non-essential remote video** (listeners, AFK)—keep **audio intelligible**.
3. **Audio-only for non-speakers** (pause their inbound video entirely) if video still stresses the room.
4. **Room banner / UI signal** only if product wants transparency—“quality reduced”—avoid flickering banners.

**Avoid** aggressive ladders of publish-side bitrate changes; treat those as **last resort** and **infrequent**, validated against LiveKit behavior.

**Recovery must be slower than degradation (yo-yo prevention):**

- **Degrade:** allow **one step** on clear signal (still subject to diff rate limits §3.4)—fast enough to protect the room.
- **Recover:** each upgrade step requires a **sustained stability window** **2–3× longer** than the degradation cooldown for that room state (e.g. if degrade cooldown is 5s, require ~15s sustained `Healthy`-leaning smoothers before stepping video quality back up). Never symmetric timers.

Prefer consistency over “optimal” bitrate.

### 5.3 Client-side indicators

Map UI to the **three operational states** only (§3.5)—do not add parallel tier enums in the client.

| Signal (example)        | Maps to           | Client behavior                                          |
| ----------------------- | ----------------- | -------------------------------------------------------- |
| `health: degraded`      | **Degraded**      | Yellow dot / “Reduced quality” (stable copy, no flicker) |
| `health: critical`      | **Critical**      | Red dot; intelligibility-first messaging                 |
| `room_health: degraded` | Room **Degraded** | Banner: “Voice quality reduced” — **debounced**          |
| `reconnecting: true`    | —                 | Overlay: “Reconnecting…”                                 |

---

## 6. Simulcast and SVC strategy

### 6.1 Division of responsibility

**LiveKit** configures publishers, simulcast/SVC encoding, and **adapts** within those encodings. **Echo** does **not** replace that stack.

Echo’s control plane may:

- Express **receive-side** preferences (max layer per subscription, pause remote video), **diffed** and **infrequently** updated.
- Align **room defaults** with LiveKit-recommended presets for client publish settings.

Echo should **not** continuously override encoder or SFU congestion behavior in competition with LiveKit.

### 6.2 Illustrative layer intent (after smoothing + priority)

When subscription policy selects a max layer, tie it to `**Healthy` / `Degraded` / `Critical`** + **priority weights\*\*—not instant metrics or extra tier names:

| Max layer intent | Typical viewer context                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| `high`           | `**Healthy`\*\* + publisher is active speaker or screen share (high weight) |
| `medium`         | `**Healthy`** listener or `**Degraded\*\*` + recent speaker                 |
| `low`            | `**Degraded**` non-speaker or `**Critical**` recovering path                |
| `off`            | `**Critical**` or idle low-weight under stress                              |

Exact resolutions and bitrates follow **LiveKit’s** simulcast/SVC configuration, not Echo-defined physics.

### 6.3 SVC readiness

If codecs use SVC, map policy intents to the **same** abstraction (`maxVideoQuality` or equivalent) in the adapter—callers stay unaware of simulcast vs SVC.

---

## 7. Observability

### 7.1 Metrics (Prometheus)

| Metric                                | Type      | Labels                                    | Purpose                                                  |
| ------------------------------------- | --------- | ----------------------------------------- | -------------------------------------------------------- |
| `echo_voice_rooms_active`             | Gauge     | —                                         | Currently active voice rooms                             |
| `echo_voice_participants_total`       | Counter   | `action` (join/leave)                     | Participant lifecycle                                    |
| `echo_voice_participant_health`       | Gauge     | `state` (`healthy`/`degraded`/`critical`) | **Three operational states only** — no extra tier labels |
| `echo_voice_control_deltas_total`     | Counter   | `kind`, `authority` (L1/L2/L3)            | Diff-based LiveKit mutations applied                     |
| `echo_voice_health_transitions_total` | Counter   | `from`, `to`                              | Operational state changes (should be **low frequency**)  |
| `echo_voice_control_backoff_total`    | Counter   | `reason`                                  | Backoff after repeated disagreement with LiveKit (§3.4)  |
| `echo_voice_room_degraded_total`      | Counter   | —                                         | Room-wide degradation events                             |
| `echo_voice_token_mint_total`         | Counter   | `outcome` (success/error)                 | Token minting on Echo API                                |
| `echo_voice_sfu_latency_seconds`      | Histogram | `operation`                               | Round-trip time for LiveKit SDK calls                    |

### 7.2 Logging

- Sidecar logs **operational health** transitions (`Healthy`/`Degraded`/`Critical`), **diffs applied** (with authority L1–L3), **rate-limit drops**, and **backoff** events—not every raw metric sample. Include `roomId`, `userId`, `correlationId`.
- Token minting on the Echo API logs `roomId`, `userId`, and token TTL.

### 7.3 Alerting (examples for `server/ops/monitoring/prometheus/rules/`)

- `echo_voice_room_degraded_total` increasing faster than 1/min → potential network issue.
- `echo_voice_health_transitions_total` spike rate high per participant → **hysteresis** or rate limits broken; review policy vs §3.4–3.5.
- `echo_voice_control_backoff_total` rising → Echo fighting LiveKit; **narrow policy** (§3.8).
- `echo_voice_sfu_latency_seconds` p99 > 2s → LiveKit node may be overloaded.
- `echo_voice_rooms_active` near configured max → capacity planning trigger.

---

## 8. Echo API changes required

### 8.1 New endpoint: token exchange

```
POST /servers/:serverId/channels/:channelId/voice/join
```

Current behavior: returns 204 (just updates participant table).
New behavior: returns **200** with `{ livekitToken: string, livekitUrl: string }` so the client can connect to the voice node. The existing RBAC / ban / user-limit checks remain; token minting is added after the DB write.

### 8.2 New endpoint: voice quality status (optional, for admin UI)

```
GET /servers/:serverId/voice/status
```

Returns per-room summary (participant count, `**Healthy`/`Degraded`/`Critical**` counts only). Requires `MANAGE_GUILD` or owner.

### 8.3 Webhook receiver (internal)

```
POST /internal/voice/webhook
```

Receives LiveKit webhooks (signed with `LIVEKIT_API_SECRET`). Updates `echo_voice_participants` if a user drops without calling leave. Not exposed externally.

### 8.4 Config env vars

| Variable                                 | Required                 | Description                                                               |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `LIVEKIT_API_KEY`                        | Yes (when voice enabled) | LiveKit API key for token signing                                         |
| `LIVEKIT_API_SECRET`                     | Yes                      | LiveKit API secret                                                        |
| `LIVEKIT_URL`                            | Yes                      | WebSocket URL to the LiveKit server (e.g. `wss://voice.echo.example.com`) |
| `ECHO_VOICE_ENABLED`                     | No (default false)       | Feature flag; when false, join returns 503                                |
| `ECHO_VOICE_MAX_ROOMS`                   | No                       | Optional cap on concurrent rooms                                          |
| `ECHO_VOICE_QUALITY_SMOOTH_MS`           | No (default 12000)       | State builder: quality smoother tick (**10–15s** band).                   |
| `ECHO_VOICE_TOPOLOGY_RECONCILE_MS`       | No (default 45000)       | State builder: LiveKit list drift reconcile (**30–60s** band).            |
| `ECHO_VOICE_DIFF_MAX_PER_WINDOW`         | No (default 1)           | Max control mutations per room per rate-limit window (§3.4).              |
| `ECHO_VOICE_DIFF_WINDOW_HEALTHY_MS`      | No (default 10000)       | Window when room **Healthy**.                                             |
| `ECHO_VOICE_DIFF_WINDOW_DEGRADED_MS`     | No (default 5000)        | Window when room **Degraded**.                                            |
| `ECHO_VOICE_CONTROL_BACKOFF_AFTER_N`     | No (default 3)           | Consecutive neutralized applies before backoff (§3.4).                    |
| `ECHO_VOICE_CONTROL_BACKOFF_COOLDOWN_MS` | No (default 60000)       | Cooldown after backoff.                                                   |
| `ECHO_VOICE_RECOVER_STABILITY_MULT`      | No (default 3)           | Recovery stability window = degradation cooldown × this (§5.2).           |

---

## 9. Frontend integration

### 9.1 SDK choice

Use `**livekit-client`** (official LiveKit JS SDK). Import it **only\*\* from a dedicated module (`clients/web/src/services/voice/livekitAdapter.ts`) so the rest of the app never references LiveKit types directly.

### 9.2 Module structure

```
clients/web/src/services/voice/
  livekitAdapter.ts       — wraps livekit-client Room/Participant/Track
  voiceConnectionManager.ts — connect/disconnect lifecycle, reconnect handling
  qualityMonitor.ts       — reads local RTCPeerConnection.getStats(), reports to sidecar
  types.ts                — Echo-owned types (VoiceConnectionState, **OperationalHealth** three-state only, etc.)
```

Existing composables (`useServerVoiceSession`, `useChannelPanelVoiceState`, `useAppLayoutVoiceRouting`) continue to own **UI state** but delegate media lifecycle to the service layer above.

### 9.3 Client-side quality reporting

On a **slow** interval (e.g. **10–15s**, not 5s in a tight loop), `qualityMonitor.ts` may sample `RTCPeerConnection.getStats()` and send a **summary** via LiveKit’s reliable data channel. Prefer **aggregated** samples (min/avg over the window) to reduce noise.

```json
{
  "type": "echo:quality_report",
  "rttP50": 45,
  "lossMax": 0.2,
  "jitterP50": 8,
  "bwEstimate": 1200000
}
```

The sidecar **merges** these into **smoothers** alongside LiveKit signals—**never** promotes **Healthy** from a single sample.

---

## 10. Implementation phasing (start simple)

| Phase                              | Scope                                                                                                                                                                                                                                                | Depends on                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **P0 — Skeleton**                  | Deploy LiveKit (single node). Adapter + token mint. Client audio with **LiveKit-only** adaptation—**no** Echo control loop.                                                                                                                          | LiveKit provisioned; `livekit-client` in frontend. |
| **P1 — Events + diff**             | Sidecar: webhooks, room model, **lastApplied** snapshot. **Event-driven** subscription/policy deltas only (join, leave, speaker). **No** sub-second ticks.                                                                                           | P0.                                                |
| **P2 — Smoothing + multi-cadence** | **Three operational states** only; state builder + pure policy + diff emitter with **rate limits** + **backoff**. Quality smooth **10–15s**, topology **30–60s**. L0–L3 authority. §3.8 checklist in CI/review. Recovery slower than degrade (§5.2). | P1.                                                |
| **P3 — Scale + polish**            | Multi-node LiveKit, HA sidecar, optional role-based priority, admin visibility, alerting. Add complexity only with production data.                                                                                                                  | P2.                                                |

**Rule:** Do not skip to “full optimization” before P1–P2 prove stable under load.

---

## 11. Complexity notes and boundary enforcement checklist

### 11.1 What makes this hard

Running voice on a separate node introduces **distributed-system concerns** that the rest of Echo (single-node-first API) deliberately avoids:

- **State synchronization:** `echo_voice_participants` in Postgres is the source of truth, but the LiveKit node has its own participant state. These can drift (e.g. client disconnects without calling leave). The webhook receiver and a periodic reconciliation sweep handle this.
- **Token trust boundary:** The Echo API signs tokens; the voice node validates them. Clock skew, key rotation, and token TTL all need operational discipline.
- **Observability split:** Metrics and logs come from two separate processes. Correlation requires shared `roomId` / `userId` fields and a unified Grafana dashboard.
- **Deployment ordering:** The voice node must be reachable before the Echo API starts minting tokens. Health checks and feature flags (`ECHO_VOICE_ENABLED`) protect against partial deploys.
- **Network topology:** The voice node needs UDP ingress (WebRTC media ports); the Echo API does not. Firewall rules, TURN fallback, and CORS are separate concerns per node.

### 11.2 Boundary enforcement rules

1. **No LiveKit imports outside the adapter.** Backend: only `server/backend/src/voice/livekitAdapter.ts` imports `livekit-server-sdk`. Frontend: only `clients/web/src/services/voice/livekitAdapter.ts` imports `livekit-client`. Enforce with an ESLint `no-restricted-imports` rule.
2. **No Echo domain writes from the sidecar.** The sidecar reads Postgres (or calls Echo internal API) but never mutates `echo_servers`, `echo_channels`, `echo_roles`, etc. Voice-specific tables (`echo_voice_quality_log`, future) are the exception.
3. **No media-path code in the Echo API process.** Token minting and participant bookkeeping only. WebRTC and codecs live in LiveKit + clients; the sidecar runs **policy and diffed control calls**, not a second SFU or sub-second bitrate loop.
4. **Feature-flagged.** `ECHO_VOICE_ENABLED=false` (default) means the join endpoint returns 503 and the frontend hides the "join voice" button. No LiveKit deps are loaded at runtime when disabled.
5. **Independent CI.** Voice sidecar and LiveKit adapter have their own test suite (`test:echo:voice`), separate from the main backend CI pipeline, so voice work does not block chat/RBAC/DM velocity.
6. **Shared secret rotation.** `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` rotation must not require a full redeploy. Support reading from a file or secret manager path, not just env vars (future).
7. **Three-job sidecar in code.** Enforce module boundaries: State builder, Policy evaluator (pure), Diff emitter. Lint or architecture tests that forbid SDK calls outside diff emitter + adapter.

---

## 12. Final assessment

**What this design gets right**

- No SFU replacement; LiveKit keeps transport + CC + simulcast/SVC adaptation.
- No sub-second control loop; hybrid **events** + **multi-cadence** reconciliation.
- **Diff-based** control with explicit **rate limiting** and **backoff** when LiveKit neutralizes intent.
- **Separation of concerns** (three jobs + support) and **failure isolation** (voice node).
- **Sacred invariant** (§0.2): desired vs last applied → minimal actions—keep it intact in every iteration.

**What still needs discipline in implementation**

- **Control surface limits** — resist new APIs, tiers, and timers without updating §3.8 and authority levels.
- **Three operational states only** — nuance = **weights**, not new enums.
- **Authority levels (L0–L3)** — prevents slow creep toward aggressive control.
- **Recovery asymmetry** — degrade fast (bounded), recover slow (2–3× stability window).
- **Explicit no-control zones** — §3.8 is the anti-regression contract for future PRs.

---

## 13. Open questions

| #   | Question                                                                                                                                              | Impact                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | **LiveKit Cloud vs self-hosted?** Cloud simplifies ops but adds vendor lock-in and cost. Self-hosted gives full control but requires TURN/STUN infra. | Topology, cost model, ops burden.                           |
| 2   | **Video in V1?** If voice-only initially, the simulcast / SVC strategy simplifies dramatically (audio-only rooms).                                    | Scope of P0/P1.                                             |
| 3   | **Sidecar language?** TypeScript (share types) is enough—control plane is **event + slow sweep**, not microsecond loops.                              | Dev velocity vs ops preference.                             |
| 4   | **Client vs server signals?** `getStats()` is noisy; use **smoothers** and LiveKit quality events; never single-sample decisions.                     | Stability of **three-state** health model.                  |
| 5   | **TURN provisioning?** Self-hosted coturn vs LiveKit's built-in TURN vs Cloudflare TURN?                                                              | Ops complexity, cost, reliability for restrictive networks. |

---

_This document is a plan — not implemented code. Validate assumptions against LiveKit’s current SDK version and deployment docs before starting P0. **LiveKit remains the source of truth for transport and congestion;** Echo’s layer is policy, smoothing, priorities, and minimal diffed control actions._
