# Client charter violations (AGENTS.md)

**Last verified:** 2026-08-17 (live path audit).

Code-only notes on `clients/web/src` where the **client layer** still does work that
`AGENTS.md` reserves for a single domain/model authority: merging sources of truth,
choosing fallbacks or priority for **shared state**, enforcing staleness, or embedding
**business rules** for workspace/messaging/session data.

This list is **not** exhaustive. It intentionally **does not** catalog presentation
ordering, local-only preferences, optimistic UI, transport quirks, or normal view
defaults.

**Status tags:** `OPEN` (still a charter tension) · `ACCEPTED` (intentional owner;
not a drive-by “violation”) · `MOVED` (historical path; do not edit dead files).

**See also:** [client-layer-violations.md](./client-layer-violations.md),
[client-charter-fix-checklist.md](./client-charter-fix-checklist.md).

---

## Live inventory

### Merge, fallback, or priority

| Location                                                                                        | Status   | Summary                                                                               |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `features/layout/domain/voiceParticipantState.ts` — `mergeVoiceModerationMaps`                  | OPEN     | Voice mute/deaf map merge (Echo `true` wins). Was `…/serverVoiceParticipantMerge.ts`. |
| `services/orchestration/useEchoPresenceSync.ts`                                                 | OPEN     | Presence fetch scope + empty-roster fallback. Was layout composable.                  |
| `services/orchestration/urlNavigationResolve.ts` — `pickFallbackParsedPath`, `resolveGuildPath` | OPEN     | Invalid paths resolve to first non-`echo` server + first text channel, else explore.  |
| `features/server-notifications/serverPing.ts`                                                   | OPEN     | Ping kind rank + mention classification on the client.                                |
| `features/dm/buildDmPanelUserList.ts`                                                           | OPEN     | DM inbox merge/sort across legacy + Echo peers.                                       |
| `services/orchestration/useAppLayoutDmRailUnread.ts`                                            | OPEN     | Rail unread cluster merge. Was layout composable.                                     |
| `composables/useChatPermissions.ts`                                                             | ACCEPTED | Null capabilities → permissive send UX; server still enforces.                        |

### Truth, ordering, or session policy

| Location                                                                        | Status   | Summary                                                                                                               |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `services/realtime/channelMessageIndex.ts`                                      | ACCEPTED | Ordered channel index + mergeBatch; single write path via authority helpers.                                          |
| `services/realtime/channelMessageAuthority.ts`                                  | ACCEPTED | Documented single client write surface for channel message lists.                                                     |
| `features/chat/domain/channelMessageIndex.ts`                                   | ACCEPTED | Thin re-export shim → `services/realtime/channelMessageIndex`.                                                        |
| `services/domain/workspaceSession.ts`                                           | OPEN     | Workspace/session apply, version gating, presence dual-write. Replaces deleted `echoWorkspaceSessionApply` viewModel. |
| `services/orchestration/workspaceEchoHydrateFromApi.ts`                         | OPEN     | Hydrate timing / bootstrap orchestration.                                                                             |
| `features/server-settings/composables/useServerSettingsRolesEchoPersistence.ts` | OPEN     | Three-way role list merge after refresh.                                                                              |
| `stores/echoAttention.ts`                                                       | OPEN     | Read cursor vs `lastMessageId` clears DM attention locally.                                                           |

### Historical paths (do not resurrect)

These were removed or relocated. `mvcPurityGuards.test.ts` asserts many stay gone:

- `features/layout/composables/serverVoiceParticipantMerge.ts`
- `features/layout/composables/useEchoPresenceSync.ts`
- `features/layout/urlNavigationResolve.ts`
- `features/layout/composables/useAppLayoutDmRailUnread.ts`
- `features/chat/viewModel/echoHistoryViewModel.ts`
- `features/chat/viewModel/channelMessageIndex.ts`
- `features/layout/viewModel/echoWorkspaceSessionApply.ts`
- `services/orchestration/echoRealtimeUiTransactions.ts`

---

## Related tests

- `clients/web/src/features/layout/composables/controller/layoutComposableWorkspaceMergeForbidden.test.ts`
- `clients/web/src/vueEchoWorkspaceApplyForbidden.test.ts`
- `clients/web/src/mvcPurityGuards.test.ts`
