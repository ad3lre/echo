# Client charter — layout reactive graph (leak goal row 2)

Charter: [agents.md](../overview/agents.md). Leak goal **2** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

This document is the **single place** that explains why [`useAppLayoutController.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.ts) must keep a **strict setup order** across **DM state**, **effective channel / voice context**, **DM rail unread**, **chat rows**, and **realtime host/socket** glue. It complements [clientCharterStoresNavVirtualizerAuthority.md](./clientCharterStoresNavVirtualizerAuthority.md) (rows 24–26): that doc owns nav + list invalidation; this one owns **layout composition-root ordering**.

---

## Why ordering matters

Vue `setup()` runs composables **sequentially**. Several layout modules take **refs/computeds produced earlier** in the same function. Reordering calls without updating dependencies causes subtle regressions (wrong voice strip, empty DM rail cluster, socket wired before history callbacks exist, etc.).

Truth and merge rules **belong** in domain / view-models — this file only records **wiring dependencies**, not business semantics.

---

## Enforced contract

**Regression guard:** [`useAppLayoutController.wiringOrder.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.wiringOrder.test.ts) asserts that the first occurrence of each marker in `useAppLayoutController.ts` appears in the documented order. If you intentionally reorder setup, update **both** this doc and the marker list in that test.

---

## Phase map (high level)

| Phase | Composable / call                                 | Depends on (examples)                                                                                         |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | `useAppLayoutEchoDmState`                         | `activeChannelId`, workspace, rail UI refs                                                                    |
| 2     | `useAppLayoutEffectiveChannel`                    | `echoDmThreadIds`, `findChannelContextById`                                                                   |
| 3     | `useAppLayoutOpenDmThread`                        | DM maps, `activeChannelId`, workspace messages                                                                |
| 4     | `createIsKnownDmChannelId`                        | `echoDmPeerByChannelId`, `echoDmThreadIds`, tree                                                              |
| 5     | `useAppLayoutShellNavigation`                     | `selectDmUser`, DM maps, `mainSurface` inputs, `dmCallWithUserIdForShellLog` (placeholder until voice bridge) |
| 6     | `useAppLayoutVoiceChannelForParticipantsComputed` | `currentVoiceChannelId`, `effectiveActiveChannel`                                                             |
| 7     | `useAppLayoutCallVoiceBridge`                     | `mainSurface`, `voiceChannelForParticipants`, VC refs, `mergeEchoDmThreadFromRealtime`, role preview          |
| 8     | `useDmCallWithUserIdShellLogMirror`               | `dmCallWithUserId` from bridge → shell log ref used by nav diagnostics                                        |
| 9     | `useEchoWorkspaceLifecycle`                       | `dmCallWithUserId`, DM merge hooks, presence sync                                                             |
| 10    | `assignHydrateEchoFromApi`                        | hydrate fn from lifecycle, assign slot from voice bridge                                                      |
| 11    | `useEchoHistory`                                  | `activeChannelId`, workspace messages — before realtime host wiring                                           |
| 12    | `useAppLayoutRailLoadingDerived`                  | shell + workspace + `activeChannelId`                                                                         |
| 13    | `useAppLayoutDmRailUnread`                        | `isKnownDmChannelId`, `dmAttentionByChannelId`, `activeChannelId`                                             |
| 14    | `useChatMessages`                                 | history/index path stable for downstream search                                                               |
| 15    | `useAppLayoutSearchIntegration`                   | `activeChannelMessages`                                                                                       |
| 16    | `useAppLayoutPinsIntegration`                     | pins state before host assembles callbacks                                                                    |
| 17    | `useAppLayoutRealtimeHostWiring`                  | `echoChannelHistory`, presence, DM activity, `handleEchoDmCall`, attention patch                              |
| 18    | `useAppLayoutRealtimeSocketBinding`               | `hostCallbacks`                                                                                               |
| 19    | `wireDmCallSocketSubmitters`                      | socket submitters from (18) + bridge                                                                          |

---

## Related docs

- [clientCharterLayoutCompositionRootAuthority.md](./clientCharterLayoutCompositionRootAuthority.md) — composition root stays free of Echo HTTP / raw socket wiring (leak goal row **1**).
- [useAppLayoutController-domains.md](../layout/useAppLayoutController-domains.md) — domain split and bridge responsibilities.
- [clientCharterStoresNavVirtualizerAuthority.md](./clientCharterStoresNavVirtualizerAuthority.md) — nav + URL + virtualizer policy.

---

## Revision

| Date       | Note                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-04-11 | Initial authority map + wiring-order contract test for leak goal row 2 at 100%. |
