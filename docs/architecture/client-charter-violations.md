# Client charter violations (AGENTS.md)

Code-only notes on `frontend/src` where the **client layer** does work that `AGENTS.md` reserves for a single domain/model authority: merging sources of truth, choosing fallbacks or priority for **shared state**, enforcing staleness, or embedding **business rules** for workspace/messaging/session data.

This list is **not** exhaustive. It intentionally **does not** catalog presentation ordering, local-only preferences, optimistic UI, transport quirks, or normal view defaults — those are out of scope here.

**Note:** Some behavior lives in `features/*/viewModel`, `services/orchestration/`, `services/realtime/`, or remaining `services/domain/` modules. Folder name alone is **not** compliance. Items below are confirmed tensions, not endorsed architecture.

**See also:** [client-layer-violations.md](./client-layer-violations.md) — module-level detail, code excerpts, and sections aligned with the charter tables.

**Current sweep checklist:** [client-charter-fix-checklist.md](./client-charter-fix-checklist.md) — concrete fixes and verification for the latest charter cleanup pass.

---

## Violations

### Merge, fallback, or priority outside domain (high impact)

| Location                                                                                                               | Summary                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `features/layout/composables/serverVoiceParticipantMerge.ts` — `mergeVoiceModerationMaps`                              | Merges workspace overlay mute/deaf maps with channel snapshot maps; Echo `true` wins over mock.                     |
| `features/layout/composables/useEchoPresenceSync.ts` — `syncEchoPresenceFromApi`                                       | Presence fetch scope from several sources; if `serverMemberIds` is empty, falls back to `workspaceMembersByServer`. |
| `features/layout/urlNavigationResolve.ts` — `pickFallbackParsedPath`, `resolveGuildPath`                               | Invalid paths resolve to first non-`echo` server + first text channel, else explore.                                |
| `features/server-notifications/serverPing.ts` — `mergeServerPingKinds`, `PING_RANK`, `classifyServerPingFromMentions`  | Ranks ping kinds and classifies mentions into ping kinds on the client.                                             |
| `features/dm/buildDmPanelUserList.ts` — `latestTimeForPeerMessage`, `compareActivityRankDesc`, `buildDmPanelInboxList` | Merges legacy DM channels, Echo peer map, buckets, and `lastActivityId` for inbox sort.                             |
| `features/layout/composables/useAppLayoutDmRailUnread.ts` — `dmIncomingRailCluster`                                    | Merges attention summaries with message requests; dedup and defaults for rail unread.                               |
| `composables/useChatPermissions.ts` — `createChatPermissions`                                                          | While capabilities are null, send gating is **permissive** (documented UX fallback; server still enforces).         |

### Truth, ordering, or session policy in client `features` / split layering

| Location                                                                                                                  | Summary                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `features/chat/viewModel/echoHistoryViewModel.ts`                                                                         | Messaging view-model owns load/pagination/read-state paths and message index usage.                          |
| `features/chat/viewModel/channelMessageIndex.ts` — `mergeBatch`, `reconcileGlobalAuthors`, `globalAuthorIds`              | Merge strategies, sort order, cross-channel author reconciliation.                                           |
| `services/realtime/channelMessageAuthority.ts`                                                                            | Domain entry point that still routes through `stores/messageIndex` and `features/chat/viewModel` merge/caps. |
| `features/layout/viewModel/echoWorkspaceSessionApply.ts` — version gating                                                 | Compares workspace versions and rejects stale snapshots.                                                     |
| `features/layout/viewModel/echoWorkspaceSessionApply.ts` — presence                                                       | Dual-writes presence (`presenceByUserId` + `users[]`) and prunes overlay by policy.                          |
| `features/layout/composables/useAppLayoutEchoDmState.ts` — `mergeEchoDmThread`\*                                          | Merges API + realtime DM thread payloads into refs/maps (identity and last-activity).                        |
| `features/server-settings/composables/useServerSettingsRolesEchoPersistence.ts` — `mergeEchoRoleListPreservingLocalEdits` | Three-way merge after refresh (fresh vs local editor vs snapshot).                                           |
| `features/layout/composables/useGuildChannelTree.ts` — `categoriesForServer`                                              | Drops `canViewChannel === false` channels when not in role preview (client-side visibility).                 |
| `utils/compareRawMessagesChronologically.ts`                                                                              | Wall-clock vs snowflake time and tie-breaks for message ordering.                                            |
| `stores/echoAttention.ts` — `patchReadState`, `isReadAtOrBeyondLastMessage`                                               | Read cursor vs `lastMessageId` clears DM attention locally.                                                  |
| `features/server-settings/roleManagerFactory.ts` — `buildManagedRolesFromEcho`                                            | Role ordering, top-role per user, expands `ADMINISTRATOR` to flags client-side.                              |

---

## Related tests

- `frontend/src/features/layout/composables/layoutComposableWorkspaceMergeForbidden.test.ts`
- `frontend/src/vueEchoWorkspaceApplyForbidden.test.ts`

These guard **workspace** apply paths from picking up merge authority in Vue trees; they do not cover every row above.
