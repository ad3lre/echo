# Client Charter Fix Checklist

Charter reference: [agents.md](../overview/agents.md).

This file is a change log of work landed in the sweep. It is not a blanket claim that every landing spot is fully model-compliant. If a move only relocated the problem into `services/domain` or a `viewModel`, that debt stays open.

## Landed changes

- [x] Moved Discord import UI flow out of [`AddServerModal.vue`](../../clients/web/src/features/server-settings/components/AddServerModal.vue); the flow module [`addServerDiscordImportMe.ts`](../../clients/web/src/features/layout/addServerDiscordImportMe.ts) lives in orchestration and still encodes UI phase / wait-step names (see [overview/agents.md](../overview/agents.md) for remaining workflow-surface guidance).
- [x] Moved optimistic local server-graph mutations out of [`workspaceServerActions.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceServerActions.ts) into [`workspaceLocalServerGraphApply.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceLocalServerGraphApply.ts) so the command layer stays wiring-focused.
- [x] Added Echo HTTP trust-boundary parsing in [`api/echo/messages.ts`](../../clients/web/src/api/echo/messages.ts) for message envelopes instead of treating arbitrary JSON as already-semantic data.
- [x] Split layout composition root into phased wiring (`wireAppLayout*`) + PR2 context assembly (`buildAppLayoutAssemblyDeps`, `assembleAppLayoutControllerContext`) with parity regression tests.
- [x] Locked presentation trees against direct workspace-merge or Echo HTTP authority with [`vueEchoWorkspaceApplyForbidden.test.ts`](../../clients/web/src/vueEchoWorkspaceApplyForbidden.test.ts), [`vueEchoHttpSurface.contract.test.ts`](../../clients/web/src/vueEchoHttpSurface.contract.test.ts), and [`layoutComposableWorkspaceMergeForbidden.test.ts`](../../clients/web/src/features/layout/composables/controller/layoutComposableWorkspaceMergeForbidden.test.ts).
- [x] Locked realtime and voice transport boundaries with [`socketInbound.attachDetachParity.test.ts`](../../clients/web/src/services/realtime/__tests__/socketInbound.attachDetachParity.test.ts) and [`voiceLivekitTransportBoundary.test.ts`](../../clients/web/src/services/orchestration/voiceLivekitTransportBoundary.test.ts).
- [x] Verified the charter-focused frontend test set and a full frontend build on 2026-04-11.
- [x] Moved DM thread registry merge rules out of [`useAppLayoutEchoDmState.ts`](../../clients/web/src/features/layout/composables/dm/useAppLayoutEchoDmState.ts) into [`echoDmThreadRegistry.ts`](../../clients/web/src/features/dm/echoDmThreadRegistry.ts): API/realtime thread identity, activity monotonicity, snapshot pruning, group icon fallback, and active-call participant cleanup now have a domain reducer with focused tests.

## Still open after the sweep

- `clients/web/src/features/layout/addServerDiscordImportMe.ts` (workflow / phase naming)
- Realtime message authority: `clients/web/src/features/chat/ingest/echoRealtimeChatIngest.ts`, `clients/web/src/features/chat/domain/channelMessageAuthority.ts`, `clients/web/src/features/chat/ingest/echoRealtimeMessageStoreBridge.ts`, `clients/web/src/services/orchestration/echoRealtimeUiTransactions.ts`
- Workspace apply and hydrate: `clients/web/src/features/layout/viewModel/echoWorkspaceSessionApply.ts`, `clients/web/src/features/layout/viewModel/echoWorkspaceLifecycleViewModel.ts`, `clients/web/src/features/layout/echoWorkspace/workspaceEchoHydrateFromApi.ts`, related `workspace*.ts` under `services/orchestration/`
