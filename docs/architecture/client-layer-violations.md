# Client Layer Violations (Architecture Charter)

Reference: [agents.md](../overview/agents.md).

**Status (2026-04-11):** Unresolved model/controller/client boundary issues remain in the frontend. This file is a hotspot map. It must not describe current `viewModel`, `services/realtime/`, or `services/orchestration/` placements as the **correct final owners** when those files still decide truth, merge sources, fallback, navigation, or UI rollback.

## 1. Realtime ingest and optimistic message flow

**Current code path:**

- [`useSocket.ts`](../../clients/web/src/features/layout/useSocket.ts) — thin Vue lifecycle glue.
- [`echoSocketRealtimeWiring.ts`](../../clients/web/src/features/layout/realtime/echoSocketRealtimeWiring.ts), [`echoSocketSessionLifecycle.ts`](../../clients/web/src/features/layout/realtime/echoSocketSessionLifecycle.ts), [`socketConnectOrchestrator.ts`](../../clients/web/src/features/layout/realtime/socketConnectOrchestrator.ts), [`socketIoSessionWire.ts`](../../clients/web/src/features/layout/realtime/socketIoSessionWire.ts), [`echoSocketInboundListeners.ts`](../../clients/web/src/features/layout/realtime/echoSocketInboundListeners.ts) — transport wiring.
- **Merge / dual-write / UI rollback:** [`echoRealtimeChatIngest.ts`](../../clients/web/src/features/chat/ingest/echoRealtimeChatIngest.ts), [`channelMessageAuthority.ts`](../../clients/web/src/features/chat/domain/channelMessageAuthority.ts), [`echoRealtimeMessageStoreBridge.ts`](../../clients/web/src/features/chat/ingest/echoRealtimeMessageStoreBridge.ts) under `services/realtime/`, plus `echoRealtimeUiTransactions.ts` under `services/orchestration/`.

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

- `echoWorkspaceSessionApply.ts` — snapshot version gating, roster merge hooks, presence writes, message index disposal, reset behavior.
- `echoWorkspaceLifecycleViewModel.ts` and [`workspaceEchoHydrateFromApi.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceEchoHydrateFromApi.ts) — hydrate timing, social refresh, bootstrap, logout reset, server-delete follow-up.
- Orchestration modules (no longer under `services/domain/`): [`workspaceRosterMerge.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceRosterMerge.ts), [`workspaceAuthUserRoster.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceAuthUserRoster.ts), [`workspaceFirstGuildBootstrapGuard.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceFirstGuildBootstrapGuard.ts), [`workspaceServerDeletionNav.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceServerDeletionNav.ts), [`workspaceShellResetOnLogout.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceShellResetOnLogout.ts), [`workspaceSocialHydrate.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceSocialHydrate.ts), [`workspaceSocketEventHandler.ts`](../../clients/web/src/features/layout/realtime/workspaceSocketEventHandler.ts).

**Why this is still a violation:**

- Truth and merge rules still appear in view-model wrappers and in orchestration modules that mix transport, shell policy, and roster merging.
- Client-side multi-source merge (e.g. roster + local profile) remains on the workspace path.

**Charter target:**

- Snapshot normalization, identity, and invariants owned by a single domain authority on the server-accepted model side; client applies projections, not competing merges, where possible.
- Hydrate / logout / delete / bootstrap **execution flow** in controller-sized orchestration; keep orchestration from becoming the long-term “truth” layer.
- Thin composables and stores that bind or delegate only.

## 3. History and message authority

**Current code path:**

- [`channelMessageIndex.ts`](../../clients/web/src/features/chat/domain/channelMessageIndex.ts) — ordered channel index.
- `echoHistoryViewModel.ts` — network I/O, timers, diagnostics, read-state persistence, pagination orchestration.
- `stores/messageIndex.ts` — re-export shim around the index API.

**Why this is still a violation:**

- History truth and workflow orchestration are split across view-model and realtime layers.
- `echoHistoryViewModel.ts` behaves as controller/service, not pure projection.

**Charter target:**

- One owner for ordering, dedupe, caps, and history invariants (domain/server contract); client applies.
- Controller/orchestration owns fetch timing, retries, and lifecycle.
- [`useEchoHistory.ts`](../../clients/web/src/features/chat/composables/useEchoHistory.ts) stays a thin binder.

## Clean seams worth keeping

- `useSocket.ts` as Vue lifecycle glue, as long as it does not absorb message truth or browser policy.
- URL navigation helpers for path parsing and navigation rules; do not move those rules into layout controller or message modules.
- View-only projection such as `activeChannelMessages.ts` and prop-driven `ExploreView.vue` stay thin and presentation-focused.

## Related docs

- [overview/agents.md](../overview/agents.md) — contributor charter.
- [client-charter-violations.md](./client-charter-violations.md) — compact file/table inventory.
