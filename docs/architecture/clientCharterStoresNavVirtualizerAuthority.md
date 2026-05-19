# Client Charter — Stores, Cross-Feature Nav, and List Cache (Rows 24–26)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): navigation ownership is mostly clear, but the store and message-authority story is not fully model-compliant. This file records current paths and caveats; it does not mark rows 24–26 complete.

## Row 24 — Pinia stores

- `[echoSession.ts](../../frontend/src/stores/echoSession.ts)` remains a thin store entrypoint.
- Its current delegate, `[echoWorkspaceSessionApply.ts](../../frontend/src/features/layout/viewModel/echoWorkspaceSessionApply.ts)`, is not a clean final authority because it still mixes snapshot truth, presence writes, message disposal, and client-side merge policy.
- `[messageIndex.ts](../../frontend/src/stores/messageIndex.ts)` remains a re-export shim to `[channelMessageIndex.ts](../../frontend/src/features/chat/viewModel/channelMessageIndex.ts)`.

## Row 25 — Cross-feature navigation

- `[navigationReducer.ts](../../frontend/src/features/layout/navigationReducer.ts)`, `[useRailNavigation.ts](../../frontend/src/features/layout/composables/useRailNavigation.ts)`, `[useAppLayoutShellNavigation.ts](../../frontend/src/features/layout/composables/useAppLayoutShellNavigation.ts)`, `[urlNavigationResolve.ts](../../frontend/src/features/layout/urlNavigationResolve.ts)`, `[urlNavigation.ts](../../frontend/src/features/layout/urlNavigation.ts)`, and `[useUrlNavigationSync.ts](../../frontend/src/features/layout/composables/useUrlNavigationSync.ts)` are still the right places for navigation and URL rules.
- Do not move URL, rail, or surface rules into workspace apply code, message modules, or component trees.

## Row 26 — Cache validity and virtualizer invalidation

- `[channelMessageIndex.ts](../../frontend/src/features/chat/viewModel/channelMessageIndex.ts)` remains the ordered channel index.
- `[activeChannelMessages.ts](../../frontend/src/features/chat/viewModel/activeChannelMessages.ts)` remains presentation mapping.
- Current caveat: message truth is still split across `[echoHistoryViewModel.ts](../../frontend/src/features/chat/viewModel/echoHistoryViewModel.ts)`, `[channelMessageAuthority.ts](../../frontend/src/services/realtime/channelMessageAuthority.ts)`, and `[echoRealtimeMessageStoreBridge.ts](../../frontend/src/services/realtime/echoRealtimeMessageStoreBridge.ts)`, so the list pipeline is not yet backed by one clean authority.

For the current violation checklist, see [overview/agents.md](../overview/agents.md) and [client-charter-violations.md](./client-charter-violations.md).
