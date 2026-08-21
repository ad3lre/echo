# Client Charter — Realtime Socket, Transport, and Inbound (Rows 3–5)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): `useSocket.ts` is still the right thin lifecycle shell, but rows 3–5 are not fully model-compliant. This file records the current code path and the compliant target; it does not mark realtime ingest as complete.

## Current code path

- Vue lifecycle glue: [`useSocket.ts`](../../clients/web/src/features/layout/useSocket.ts)
- Transport lifecycle: [`echoSocketRealtimeWiring.ts`](../../clients/web/src/features/layout/realtime/echoSocketRealtimeWiring.ts), [`echoSocketComposableEffects.ts`](../../clients/web/src/features/layout/realtime/echoSocketComposableEffects.ts), [`echoSocketSessionLifecycle.ts`](../../clients/web/src/features/layout/realtime/echoSocketSessionLifecycle.ts), [`socketIoSessionWire.ts`](../../clients/web/src/features/layout/realtime/socketIoSessionWire.ts), [`socketConnectOrchestrator.ts`](../../clients/web/src/features/layout/realtime/socketConnectOrchestrator.ts)
- Host assembly: [`appEchoRealtimeHost.ts`](../../clients/web/src/features/layout/realtime/appEchoRealtimeHost.ts), [`useAppLayoutRealtimeHostWiring.ts`](../../clients/web/src/features/layout/composables/realtime/useAppLayoutRealtimeHostWiring.ts), [`useAppLayoutRealtimeSocketBinding.ts`](../../clients/web/src/features/layout/composables/realtime/useAppLayoutRealtimeSocketBinding.ts)
- Current violating ingest owners: [`echoRealtimeChatIngest.ts`](../../clients/web/src/features/chat/ingest/echoRealtimeChatIngest.ts), [`channelMessageAuthority.ts`](../../clients/web/src/features/chat/domain/channelMessageAuthority.ts), [`echoRealtimeMessageStoreBridge.ts`](../../clients/web/src/features/chat/ingest/echoRealtimeMessageStoreBridge.ts), `echoRealtimeUiTransactions.ts` (orchestration; UI tx rollbacks)

## Why the current ingest split is still a violation

- `echoRealtimeChatIngest.ts` coordinates host ports, optimistic rollback, and typing side effects.
- `channelMessageAuthority.ts` and `echoRealtimeMessageStoreBridge.ts` preserve duplicate message authority through raw-message plus index dual-write.
- `echoRealtimeUiTransactions.ts` keeps UI rollback orchestration in a model-like layer.

## Charter target

- transport and listener attachment stay in `services/realtime`
- controller/orchestration code owns execution order and rollback wiring
- one model/domain authority owns message truth, merge, dedupe, and reconciliation

## Regression guard that still matters

- [`socketInbound.attachDetachParity.test.ts`](../../clients/web/src/services/realtime/__tests__/socketInbound.attachDetachParity.test.ts)

For the broader charter context, see [overview/agents.md](../overview/agents.md) and [client-layer-violations.md](./client-layer-violations.md).
