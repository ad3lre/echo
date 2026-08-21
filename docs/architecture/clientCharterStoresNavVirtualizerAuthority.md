# Client Charter — Stores, Cross-Feature Nav, and List Cache (Rows 24–26)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): navigation ownership is mostly clear, but the store and message-authority story is not fully model-compliant. This file records current paths and caveats; it does not mark rows 24–26 complete.

## Row 24 — Pinia stores

- `[echoSession.ts](../../clients/web/src/features/layout/echoSession.ts)` remains a thin store entrypoint.
- Its current delegate, `echoWorkspaceSessionApply.ts`, is not a clean final authority because it still mixes snapshot truth, presence writes, message disposal, and client-side merge policy.
- `messageIndex.ts` remains a re-export shim to `[channelMessageIndex.ts](../../clients/web/src/features/chat/domain/channelMessageIndex.ts)`.

## Row 25 — Cross-feature navigation

- `[navigationReducer.ts](../../clients/web/src/features/layout/navigationReducer.ts)`, `[useRailNavigation.ts](../../clients/web/src/features/layout/composables/rail/useRailNavigation.ts)`, `[useAppLayoutShellNavigation.ts](../../clients/web/src/features/layout/composables/controller/useAppLayoutShellNavigation.ts)`, `[urlNavigationResolve.ts](../../clients/web/src/features/layout/urlNavigationResolve.ts)`, `[urlNavigation.ts](../../clients/web/src/features/layout/urlNavigation.ts)`, and `[useUrlNavigationSync.ts](../../clients/web/src/features/layout/composables/shell/useUrlNavigationSync.ts)` are still the right places for navigation and URL rules.
- Do not move URL, rail, or surface rules into workspace apply code, message modules, or component trees.

## Row 26 — Cache validity and virtualizer invalidation

- `[channelMessageIndex.ts](../../clients/web/src/features/chat/domain/channelMessageIndex.ts)` remains the ordered channel index.
- `[activeChannelMessages.ts](../../clients/web/src/features/chat/domain/activeChannelMessages.ts)` remains presentation mapping.
- Current caveat: message truth is still split across `echoHistoryViewModel.ts`, `[channelMessageAuthority.ts](../../clients/web/src/features/chat/domain/channelMessageAuthority.ts)`, and `[echoRealtimeMessageStoreBridge.ts](../../clients/web/src/features/chat/ingest/echoRealtimeMessageStoreBridge.ts)`, so the list pipeline is not yet backed by one clean authority.

For the current violation checklist, see [overview/agents.md](../overview/agents.md) and [client-charter-violations.md](./client-charter-violations.md).
