# Client Charter — Realtime Socket, Transport, and Inbound (Rows 3–5)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): `useSocket.ts` is still the right thin lifecycle shell, but rows 3–5 are not fully model-compliant. This file records the current code path and the compliant target; it does not mark realtime ingest as complete.

## Current code path

- Vue lifecycle glue: [`useSocket.ts`](../../frontend/src/composables/useSocket.ts)
- Transport lifecycle: [`echoSocketRealtimeWiring.ts`](../../frontend/src/services/realtime/echoSocketRealtimeWiring.ts), [`echoSocketComposableEffects.ts`](../../frontend/src/services/realtime/echoSocketComposableEffects.ts), [`echoSocketSessionLifecycle.ts`](../../frontend/src/services/realtime/echoSocketSessionLifecycle.ts), [`socketIoSessionWire.ts`](../../frontend/src/services/realtime/socketIoSessionWire.ts), [`socketConnectOrchestrator.ts`](../../frontend/src/services/realtime/socketConnectOrchestrator.ts)
- Host assembly: [`appEchoRealtimeHost.ts`](../../frontend/src/services/orchestration/appEchoRealtimeHost.ts), [`useAppLayoutRealtimeHostWiring.ts`](../../frontend/src/features/layout/composables/useAppLayoutRealtimeHostWiring.ts), [`useAppLayoutRealtimeSocketBinding.ts`](../../frontend/src/features/layout/composables/useAppLayoutRealtimeSocketBinding.ts)
- Current violating ingest owners: [`echoRealtimeChatIngest.ts`](../../frontend/src/services/realtime/echoRealtimeChatIngest.ts), [`channelMessageAuthority.ts`](../../frontend/src/services/realtime/channelMessageAuthority.ts), [`echoRealtimeMessageStoreBridge.ts`](../../frontend/src/services/realtime/echoRealtimeMessageStoreBridge.ts), [`echoRealtimeUiTransactions.ts`](../../frontend/src/services/orchestration/echoRealtimeUiTransactions.ts) (orchestration; UI tx rollbacks)

## Why the current ingest split is still a violation

- `echoRealtimeChatIngest.ts` coordinates host ports, optimistic rollback, and typing side effects.
- `channelMessageAuthority.ts` and `echoRealtimeMessageStoreBridge.ts` preserve duplicate message authority through raw-message plus index dual-write.
- `echoRealtimeUiTransactions.ts` keeps UI rollback orchestration in a model-like layer.

## Charter target

- transport and listener attachment stay in `services/realtime`
- controller/orchestration code owns execution order and rollback wiring
- one model/domain authority owns message truth, merge, dedupe, and reconciliation

## Regression guard that still matters

- [`socketInbound.attachDetachParity.test.ts`](../../frontend/src/services/realtime/__tests__/socketInbound.attachDetachParity.test.ts)

For the broader charter context, see [overview/agents.md](../overview/agents.md) and [client-layer-violations.md](./client-layer-violations.md).
