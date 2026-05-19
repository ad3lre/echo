# Client Layer Violations (Architecture Charter)

Reference: [agents.md](../overview/agents.md).

**Status (2026-04-11):** Unresolved model/controller/client boundary issues remain in the frontend. This file is a hotspot map. It must not describe current `viewModel`, `services/realtime/`, or `services/orchestration/` placements as the **correct final owners** when those files still decide truth, merge sources, fallback, navigation, or UI rollback.

## 1. Realtime ingest and optimistic message flow

**Current code path:**

- [`useSocket.ts`](../../frontend/src/composables/useSocket.ts) — thin Vue lifecycle glue.
- [`echoSocketRealtimeWiring.ts`](../../frontend/src/services/realtime/echoSocketRealtimeWiring.ts), [`echoSocketSessionLifecycle.ts`](../../frontend/src/services/realtime/echoSocketSessionLifecycle.ts), [`socketConnectOrchestrator.ts`](../../frontend/src/services/realtime/socketConnectOrchestrator.ts), [`socketIoSessionWire.ts`](../../frontend/src/services/realtime/socketIoSessionWire.ts), [`echoSocketInboundListeners.ts`](../../frontend/src/services/realtime/echoSocketInboundListeners.ts) — transport wiring.
- **Merge / dual-write / UI rollback:** [`echoRealtimeChatIngest.ts`](../../frontend/src/services/realtime/echoRealtimeChatIngest.ts), [`channelMessageAuthority.ts`](../../frontend/src/services/realtime/channelMessageAuthority.ts), [`echoRealtimeMessageStoreBridge.ts`](../../frontend/src/services/realtime/echoRealtimeMessageStoreBridge.ts) under `services/realtime/`, plus [`echoRealtimeUiTransactions.ts`](../../frontend/src/services/orchestration/echoRealtimeUiTransactions.ts) under `services/orchestration/`.

**Why this is still a violation:**

- `echoRealtimeChatIngest.ts` coordinates host callbacks, optimistic rollback, and typing side effects.
- `channelMessageAuthority.ts` and `echoRealtimeMessageStoreBridge.ts` preserve duplicate message authority (raw `messages` ref plus channel index dual-write).
- `echoRealtimeUiTransactions.ts` registers UI transactions and rollbacks (controller-shaped).

**Charter target:**

- Transport lifecycle in `services/realtime/` (appropriate folder; behavior still too thick for “pure” transport).
- Execution order and rollback coordination in a dedicated controller/orchestration surface without owning message **truth** rules.
- One authority for message truth, with no second legacy raw-message authority.

## 2. Workspace hydrate, snapshot apply, and lifecycle

**Current code path:**

- [`echoWorkspaceSessionApply.ts`](../../frontend/src/features/layout/viewModel/echoWorkspaceSessionApply.ts) — snapshot version gating, roster merge hooks, presence writes, message index disposal, reset behavior.
- [`echoWorkspaceLifecycleViewModel.ts`](../../frontend/src/features/layout/viewModel/echoWorkspaceLifecycleViewModel.ts) and [`workspaceEchoHydrateFromApi.ts`](../../frontend/src/services/orchestration/workspaceEchoHydrateFromApi.ts) — hydrate timing, social refresh, bootstrap, logout reset, server-delete follow-up.
- Orchestration modules (no longer under `services/domain/`): [`workspaceRosterMerge.ts`](../../frontend/src/services/orchestration/workspaceRosterMerge.ts), [`workspaceAuthUserRoster.ts`](../../frontend/src/services/orchestration/workspaceAuthUserRoster.ts), [`workspaceFirstGuildBootstrapGuard.ts`](../../frontend/src/services/orchestration/workspaceFirstGuildBootstrapGuard.ts), [`workspaceServerDeletionNav.ts`](../../frontend/src/services/orchestration/workspaceServerDeletionNav.ts), [`workspaceShellResetOnLogout.ts`](../../frontend/src/services/orchestration/workspaceShellResetOnLogout.ts), [`workspaceSocialHydrate.ts`](../../frontend/src/services/orchestration/workspaceSocialHydrate.ts), [`workspaceSocketEventHandler.ts`](../../frontend/src/services/orchestration/workspaceSocketEventHandler.ts).

**Why this is still a violation:**

- Truth and merge rules still appear in view-model wrappers and in orchestration modules that mix transport, shell policy, and roster merging.
- Client-side multi-source merge (e.g. roster + local profile) remains on the workspace path.

**Charter target:**

- Snapshot normalization, identity, and invariants owned by a single domain authority on the server-accepted model side; client applies projections, not competing merges, where possible.
- Hydrate / logout / delete / bootstrap **execution flow** in controller-sized orchestration; keep orchestration from becoming the long-term “truth” layer.
- Thin composables and stores that bind or delegate only.

## 3. History and message authority

**Current code path:**

- [`channelMessageIndex.ts`](../../frontend/src/features/chat/viewModel/channelMessageIndex.ts) — ordered channel index.
- [`echoHistoryViewModel.ts`](../../frontend/src/features/chat/viewModel/echoHistoryViewModel.ts) — network I/O, timers, diagnostics, read-state persistence, pagination orchestration.
- [`stores/messageIndex.ts`](../../frontend/src/stores/messageIndex.ts) — re-export shim around the index API.

**Why this is still a violation:**

- History truth and workflow orchestration are split across view-model and realtime layers.
- `echoHistoryViewModel.ts` behaves as controller/service, not pure projection.

**Charter target:**

- One owner for ordering, dedupe, caps, and history invariants (domain/server contract); client applies.
- Controller/orchestration owns fetch timing, retries, and lifecycle.
- [`useEchoHistory.ts`](../../frontend/src/composables/useEchoHistory.ts) stays a thin binder.

## Clean seams worth keeping

- `useSocket.ts` as Vue lifecycle glue, as long as it does not absorb message truth or browser policy.
- URL navigation helpers for path parsing and navigation rules; do not move those rules into layout controller or message modules.
- View-only projection such as `activeChannelMessages.ts` and prop-driven `ExploreView.vue` stay thin and presentation-focused.

## Related docs

- [overview/agents.md](../overview/agents.md) — contributor charter.
- [client-charter-violations.md](./client-charter-violations.md) — compact file/table inventory.
