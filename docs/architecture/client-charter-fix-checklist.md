# Client Charter Fix Checklist

Charter reference: [agents.md](../overview/agents.md).

This file is a change log of work landed in the sweep. It is not a blanket claim that every landing spot is fully model-compliant. If a move only relocated the problem into `services/domain` or a `viewModel`, that debt stays open.

## Landed changes

- [x] Moved Discord import UI flow out of [`AddServerModal.vue`](../../frontend/src/components/AddServerModal.vue); the flow module [`addServerDiscordImportMe.ts`](../../frontend/src/services/orchestration/addServerDiscordImportMe.ts) lives in orchestration and still encodes UI phase / wait-step names (see [overview/agents.md](../overview/agents.md) for remaining workflow-surface guidance).
- [x] Moved optimistic local server-graph mutations out of [`workspaceServerActions.ts`](../../frontend/src/composables/workspace/workspaceServerActions.ts) into [`workspaceLocalServerGraphApply.ts`](../../frontend/src/services/domain/workspaceLocalServerGraphApply.ts) so the command layer stays wiring-focused.
- [x] Added Echo HTTP trust-boundary parsing in [`api/echo/messages.ts`](../../frontend/src/api/echo/messages.ts) for message envelopes instead of treating arbitrary JSON as already-semantic data.
- [x] Locked the layout composition-root boundary with [`useAppLayoutController.thinSurface.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.thinSurface.test.ts) and [`useAppLayoutController.wiringOrder.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.wiringOrder.test.ts).
- [x] Locked presentation trees against direct workspace-merge or Echo HTTP authority with [`vueEchoWorkspaceApplyForbidden.test.ts`](../../frontend/src/vueEchoWorkspaceApplyForbidden.test.ts), [`vueEchoHttpSurface.contract.test.ts`](../../frontend/src/vueEchoHttpSurface.contract.test.ts), and [`layoutComposableWorkspaceMergeForbidden.test.ts`](../../frontend/src/features/layout/composables/layoutComposableWorkspaceMergeForbidden.test.ts).
- [x] Locked realtime and voice transport boundaries with [`socketInbound.attachDetachParity.test.ts`](../../frontend/src/services/realtime/__tests__/socketInbound.attachDetachParity.test.ts) and [`voiceLivekitTransportBoundary.test.ts`](../../frontend/src/services/orchestration/voiceLivekitTransportBoundary.test.ts).
- [x] Verified the charter-focused frontend test set and a full frontend build on 2026-04-11.
- [x] Moved DM thread registry merge rules out of [`useAppLayoutEchoDmState.ts`](../../frontend/src/services/orchestration/useAppLayoutEchoDmState.ts) into [`echoDmThreadRegistry.ts`](../../frontend/src/services/domain/echoDmThreadRegistry.ts): API/realtime thread identity, activity monotonicity, snapshot pruning, group icon fallback, and active-call participant cleanup now have a domain reducer with focused tests.

## Still open after the sweep

- `frontend/src/services/orchestration/addServerDiscordImportMe.ts` (workflow / phase naming)
- Realtime message authority: `frontend/src/services/realtime/echoRealtimeChatIngest.ts`, `frontend/src/services/realtime/channelMessageAuthority.ts`, `frontend/src/services/realtime/echoRealtimeMessageStoreBridge.ts`, `frontend/src/services/orchestration/echoRealtimeUiTransactions.ts`
- Workspace apply and hydrate: `frontend/src/features/layout/viewModel/echoWorkspaceSessionApply.ts`, `frontend/src/features/layout/viewModel/echoWorkspaceLifecycleViewModel.ts`, `frontend/src/services/orchestration/workspaceEchoHydrateFromApi.ts`, related `workspace*.ts` under `services/orchestration/`
