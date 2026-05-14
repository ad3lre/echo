# Client charter — URL navigation glue (leak goal row 12)

Charter: [agents.md](../overview/agents.md). Leak goal **12** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

## Pure priority / parsing

- [`urlNavigationResolve.ts`](../../frontend/src/features/layout/urlNavigationResolve.ts), [`urlNavigationLocationNormalize.ts`](../../frontend/src/features/layout/urlNavigationLocationNormalize.ts), [`urlNavigationModalPolicy.ts`](../../frontend/src/features/layout/urlNavigationModalPolicy.ts), [`urlNavigation.ts`](../../frontend/src/features/layout/urlNavigation.ts), [`navigationReducer.ts`](../../frontend/src/features/layout/navigationReducer.ts).

## Glue composable — race guard

[`useUrlNavigationSync.ts`](../../frontend/src/features/layout/composables/useUrlNavigationSync.ts) uses `applyingFromUrl` so **URL → shell** application does not fight **shell → `history.pushState`** (`syncHistoryPushIfNeeded` returns early when `applyingFromUrl` is true). `workspaceReady` gates first sync until workspace data can resolve guild paths safely.

Cross-feature coordination with rail/DM is documented in [clientCharterStoresNavVirtualizerAuthority.md](./clientCharterStoresNavVirtualizerAuthority.md) (row **25**).

## Revision

| Date       | Note                                                 |
| ---------- | ---------------------------------------------------- |
| 2026-04-11 | Glue re-entry policy documented; row 12 scored 100%. |
