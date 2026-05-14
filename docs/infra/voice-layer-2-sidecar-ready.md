# Voice (Layer 2) — sidecar skeleton & wiring notes

This repo now includes a minimal **Layer 2 sidecar skeleton** at `voice-sidecar/`.

## Status (important)

**Layer 2 is paused in dev for now.** The system is intentionally **hard-disabled by default** so VC remains stable on **Layer 1** only.

## What “ready” means (scope)

- The sidecar is a **separate process** with:
  - `GET /health`
  - `GET /metrics` (Prometheus)
  - `POST /ingest/livekit-webhook` (accepts a JSON envelope)
- The internal code is split into the **three jobs** from `ECHO_VOICE_INTELLIGENCE_LAYER.md`:
  - **State builder**: ingests events into a room snapshot
  - **Policy evaluator**: pure `snapshot -> desired`
  - **Diff emitter**: computes `desired vs lastApplied -> diff` (stubbed, no LiveKit mutations yet)

## Optional backend → sidecar forward (dev)

The Echo API can forward verified LiveKit webhook envelopes to the sidecar **without changing Layer 1 semantics** (it’s a “forward-only” bridge).

- **Hard gate (off by default)**: `VOICE_SIDECAR_ENABLED=true`
- **Env**: `VOICE_SIDECAR_FORWARD_URL=http://127.0.0.1:3050/ingest/livekit-webhook`
- **Behavior**:
  - Forward happens **after** signature verification and initial logging
  - Failures are **non-fatal** for the webhook route (they’re traced and ignored)

## Why this wiring is Layer-1-safe

- Layer 1 still owns and processes the webhook normally (DB roster sync, workspace invalidation).
- The sidecar receives a copy to build state and (later) compute diffs.
- No “intelligence” is added to the webhook handler; it remains forwarding-only.

## How to run locally

From repo root:

```bash
npm install
npm run dev -w voice-sidecar
```

Then set:

- `VOICE_SIDECAR_FORWARD_URL=http://127.0.0.1:3050/ingest/livekit-webhook`

and run the backend as usual.
