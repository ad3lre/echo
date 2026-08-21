# Client Charter — Workspace Snapshot, Hydrate, History, and Rows (Rows 6–10)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): rows 6–10 are not fully model-compliant. This note records current code paths and the compliant target. It does not treat the current `viewModel` and `services/domain` placements as final authorities.

## Current violating owners

- `echoWorkspaceSessionApply.ts` still owns snapshot version gating, roster merge, presence writes, message disposal, and reset behavior.
- `echoWorkspaceLifecycleViewModel.ts` and [`workspaceEchoHydrateFromApi.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceEchoHydrateFromApi.ts) still coordinate hydrate timing, social refresh, bootstrap, logout reset, and server-delete follow-up.
- `echoHistoryViewModel.ts` still combines fetches, timers, diagnostics, read-state persistence, and pagination orchestration.

## Thin seams worth preserving

- [`echoSession.ts`](../../clients/web/src/features/layout/echoSession.ts) should remain a thin store entrypoint.
- [`useEchoWorkspaceLifecycle.ts`](../../clients/web/src/features/layout/composables/workspace/useEchoWorkspaceLifecycle.ts) and [`useEchoHistory.ts`](../../clients/web/src/features/chat/composables/useEchoHistory.ts) should remain binders only.
- [`channelMessageIndex.ts`](../../clients/web/src/features/chat/domain/channelMessageIndex.ts) is still the ordered message index structure.
- [`activeChannelMessages.ts`](../../clients/web/src/features/chat/domain/activeChannelMessages.ts) remains presentation mapping, not canonical message merge.

## Charter target

- one model/domain authority owns workspace snapshot truth, message ordering, dedupe, caps, normalization, and invariants
- controller/orchestration code owns fetch timing, lifecycle, retries, bootstrap, logout, and navigation side effects
- stores, composables, and views bind or project only

For the broader charter context, see [overview/agents.md](../overview/agents.md) and [client-layer-violations.md](./client-layer-violations.md).
