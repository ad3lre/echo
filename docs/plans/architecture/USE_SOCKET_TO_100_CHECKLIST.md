# `useSocket` boundary checklist (historical, not 100%)

Date: 2026-04-11

The shell goal is still correct: changing chat semantics should not require editing the `useSocket` lifecycle wrapper or raw transport wiring.

What is no longer claimed: the current realtime ingest split is **not** fully model-compliant.

## What remains true

- `frontend/src/composables/useSocket.ts` should stay Vue lifecycle glue only.
- `frontend/src/services/realtime/echoSocketRealtimeWiring.ts`, `echoSocketSessionLifecycle.ts`, `socketConnectOrchestrator.ts`, `socketIoSessionWire.ts`, and `echoSocketInboundListeners.ts` should stay transport-facing.
- Browser and platform side effects belong in orchestration modules such as `echoRealtimeBrowserEvents.ts`, `socketReloadGuard.ts`, and `echoRealtimePlatformSessionSync.ts`.

## Current boundary debt

- `frontend/src/services/realtime/echoRealtimeChatIngest.ts` still coordinates host callbacks, optimistic rollback, and typing side effects.
- `frontend/src/services/realtime/channelMessageAuthority.ts` and `frontend/src/services/realtime/echoRealtimeMessageStoreBridge.ts` still preserve duplicate message authority through dual-write.
- `frontend/src/services/orchestration/echoRealtimeUiTransactions.ts` holds UI rollback orchestration (moved out of `services/domain`).

## Charter target

- transport lifecycle in `services/realtime`
- execution order and rollback wiring in controller/orchestration code
- one model/domain authority for message truth, merge, dedupe, and reconciliation

For the broader audit, see [clientCharterRealtimePipelineAuthority.md](../../architecture/clientCharterRealtimePipelineAuthority.md) and [overview/agents.md](../../overview/agents.md).
