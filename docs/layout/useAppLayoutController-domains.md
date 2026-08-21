# Domains handled by `useAppLayoutController`

Inventory of concern areas inside the layout composition root: [`useAppLayoutController.ts`](../../clients/web/src/features/layout/composables/controller/useAppLayoutController.ts) (facade, ~7 lines) orchestrates via [`createAppLayoutController.ts`](../../clients/web/src/features/layout/composables/controller/createAppLayoutController.ts) and three phased `wireAppLayout*` modules. Context field-mapping lives in [`buildAppLayoutAssemblyDeps.ts`](../../clients/web/src/features/layout/composables/controller/buildAppLayoutAssemblyDeps.ts); slice instantiation in [`assembleAppLayoutControllerContext.ts`](../../clients/web/src/features/layout/composables/controller/assembleAppLayoutControllerContext.ts).

**Split out of the monolithic controller (still wired through phased modules):**

- `[useAppLayoutShellNavigation](../../clients/web/src/features/layout/composables/controller/useAppLayoutShellNavigation.ts)` — composes `useRailNavigation`, `createDmRailIntents`, and `useUrlNavigationSync`; owns `shellNavState`, `deriveMainSurface` → `mainSurface`, `isServerEmptyOnboarding`, `closeDmPanelWhenServerChannelSurface` (+ watch), `activeChannelId` nav diagnostic watch, and tab helpers (`selectServersTab`, `selectExploreTab`, `selectDMTab`, `closeDMPanel`, `dispatchNav`).
- `[useAppLayoutCallVoiceBridge](../../clients/web/src/features/layout/composables/controller/useAppLayoutCallVoiceBridge.ts)` — **glue only** (does not remove coupling): internal hydrate slot, runs `[useAppLayoutDmCalls](../../clients/web/src/features/layout/composables/dm/useAppLayoutDmCalls.ts)` + `[useAppLayoutShellVoice](../../clients/web/src/features/layout/composables/voice/useAppLayoutShellVoice.ts)` + `bindVoiceSession`; exposes `assignHydrateEchoFromApi` (after `useEchoWorkspaceLifecycle`) and `wireDmCallSocketSubmitters` (after `useSocket`). **Dependency graph vs lifecycle/socket is unchanged** — only where those hooks live.
- `[useAppLayoutProfilesDomain](../../clients/web/src/features/layout/composables/profiles/useAppLayoutProfilesDomain.ts)` — profile/member-list domain aggregator: composes `[useAppLayoutProfiles](../../clients/web/src/features/layout/composables/profiles/useAppLayoutProfiles.ts)` + `[useAppLayoutProfileSafety](../../clients/web/src/features/layout/composables/profiles/useAppLayoutProfileSafety.ts)`, owns member-list/channel-panel user projection, expanded-profile mutual-friends stale-guard watch, friend removal routing, and profile safety handlers surfaced to controller context.
- **Context slice builders (new):**
  - `[useAppLayoutContextProfileSlice](../../clients/web/src/features/layout/composables/profiles/useAppLayoutContextProfileSlice.ts)`
  - `[useAppLayoutContextVoiceSlice](../../clients/web/src/features/layout/composables/voice/useAppLayoutContextVoiceSlice.ts)`
  - `[useAppLayoutContextMessagingSlice](../../clients/web/src/features/layout/composables/messaging/useAppLayoutContextMessagingSlice.ts)`
  - `[useAppLayoutContextServerRailSlice](../../clients/web/src/features/layout/composables/rail/useAppLayoutContextServerRailSlice.ts)`
    These assemble typed `Pick<AppLayoutControllerContext, ...>` slices that the controller spreads into the final context object to reduce API-drift risk during refactors.
- **Nested inside the bridge:** `useAppLayoutDmCalls` (DM/group calls, `handleEchoDmCall`, ringtone, DM LiveKit after bind, `callOverlay`, …) and `useAppLayoutShellVoice` (`useServerVoiceSession`, device sync, channel-panel VC bridge, voice nav helpers, `buildVoiceBindingForDmCalls`).

---

## 1. Core stores and workspace

- **Server selection & lists** — `useServerStore`, selected server/channel navigation.
- **Echo session** — `useEchoSessionStore` (`workspaceMembersByServer`, `presenceByUserId` for chat/member-list overlays). HTTP batch presence, debounced channel/server-driven refresh, and `presence:update` application run in `[useEchoPresenceSync](../../clients/web/src/features/layout/useEchoPresenceSync.ts)`; allowed statuses and transient fetch classification live in `[echoPresence.ts](../../clients/web/src/features/layout/echoPresence.ts)` (see §10).
- **Echo attention / read state** — `useEchoAttentionStore` (`dmAttentionByChannelId`, `serverAttentionByServerId`, socket-driven patches).
- **Auth session** — `useAuthSessionStore` (tokens, `backendUser`, guest flag, plan limits, session-ended message).
- **Workspace model** — `useEchoWorkspace` (messages, users, servers, categories, friends, requests, etc.).

---

## 2. Cross-cutting orchestration

- **App action registry** — `createAppActionRegistryBuild` / `sealActionRegistry`: sealed registry for `goToMessage`, `openDm`, group-DM actions, `openServerSettingsFromUrl`. `**openServerSettingsFromUrl`** is one function on the controller: assigned to `**actionRegistryDraft.navigation.openServerSettingsFromUrl`** before `**seal()`** and passed into `**useAppLayoutShellNavigation**` for URL/deep-link handling (same reference for both; no post-seal registry hop).
- **Chat message navigation bridge** — `createChatMessageNavBridge` + registration from `useAppLayoutMessageActions`.
- **Session diagnostics** — `emitDiagnostic` / `newTraceId` (e.g. `nav`, `socket` domains for channel switches, DM call events).
- **Failure / UX propagation** — `propagateActionFailure`, `reportPrimaryFlowFailure`, `UIErrorBus`, `dispatchAppToast`, `softMissingHandler`.

---

## 3. Shell UI state and layout geometry

- **Modal & panel flags** — auth, add-server, invite, settings, server-settings, member/self popouts, expanded profile, group DM modals, screen-share picker, etc. (`useAppLayoutUiState`).
- **Resizable columns** — channel panel, member panel, voice side-chat, DM panel (`useLayout`).
- **Voice chrome refs** — guild VC: current voice channel id/name, mute/deafen/video/screenshare, fullscreen stream participant (`useAppLayoutUiState`). DM call mute/deafen/video/screenshare live on `useAppLayoutDmCalls` and are threaded into shell voice for `useServerVoiceSession` / channel-panel routing.

---

## 4. Authentication entry

- `**openAuthModal`\*\* — social vs Echo entry, passkey, login/register, forgot-password sub-view.
- **Watch on auth modal close** — reset initial tab/entry state.

---

## 5. Invites and vanity

- `**useSelectedServerInvite`\*\* — invite links (API + selected server), lookup pending, newly created server id, `syncVanityAcrossServerLists`.

---

## 6. Guild structure, permissions, and role preview

- `**useEchoGuildRoleUi`\*\* — Echo role catalog, capability flags, member role ids, role preview start/clear/refresh, server settings gates.
- `**useGuildChannelTree`\*\* — categories/channels for server, first text channel, preview permission resolution, `watchActiveChannelWithServerChange`.
- **Channel management permission** — `canCreateChannels`, `canManageThisChannel` (Echo graph servers).

---

## 7. Direct messages (threads, peers, blocking)

- `**useAppLayoutEchoDmState`\*\* — peer map, thread ids, last activity, blocked users, merge from API/realtime, `leaveDmUiIfViewingUser`.
- `**useAppLayoutOpenDmThread`\*\* — selecting a DM user → thread + `activeChannelId`; shadow Discord users blocked from DM.
- `**selectDmUser` / `mergeRealtimeDmThread`\*\* — public surface for DM selection and realtime thread merge.
- `**useAppLayoutDmRailUnread`\*\* — DM rail unread clustering (`dmIncomingRailCluster`).

---

## 8. Left-rail navigation and main-surface inputs

- `**useAppLayoutShellNavigation`\*\* — see split summary above; exposes `selectIncomingDmFromRail`, `openDmInboxFromRailOverflow`, and all rail tab / `dispatchNav` / `closeDMPanel` helpers to the controller.
- **History / URL** — `useUrlNavigationSync` runs inside shell navigation only; its refs (`applyingFromUrl`, `applyFromBrowserLocation`) are not re-exported on the controller context today.

---

## 9. DM and group voice calls (orchestration vs implementation)

**Implementation:** `[useAppLayoutDmCalls](../../clients/web/src/features/layout/composables/dm/useAppLayoutDmCalls.ts)` — call UI state (`dmCallWithUserId`, fullscreen, mute/deafen/video/screenshare, signal state), partner/group computeds (`dmPartnerUser`, `activeGroupId`, `dmCallGlassPeer`, `dmVoiceJoinTargetId`, …), `startDmCall*` / `startGroupCall*`, direct-DM channel ensure (`postEchoOpenDm`), `handleEchoDmCall`, ringtone/wait audio, DM LiveKit join/leave once bound to shell voice (`bindVoiceSession`), invite/accept/end over socket (via submitters), `endDmCall` / `answerDmCall` / `declineDmCall`, `callOverlay` / quarter-view / CallView participants.

**Controller responsibilities:** after shell navigation, compute `effectiveActiveChannel` / `voiceChannelForParticipants` / `isViewingVoiceChannel` / `isDmUiContext` (Vue `setup()` order only — inputs for the bridge). Call `useAppLayoutCallVoiceBridge({ … })` once. After `useEchoWorkspaceLifecycle`, `assignHydrateEchoFromApi(hydrateEchoFromApi)`. Pass `handleEchoDmCall` from the bridge into `useSocket`; immediately after `useSocket`, `wireDmCallSocketSubmitters({ invite, accept, end })`.

---

## 10. Presence (delegated composable)

Implementation lives in `[useEchoPresenceSync](../../clients/web/src/features/layout/useEchoPresenceSync.ts)`. The controller **instantiates** it (after `activeChannelId` exists) and threads the returned functions into lifecycle and socket wiring.

- `**syncEchoPresenceFromApi`\*\* — `fetchEchoPresenceBatch` over users, friends, message authors, selected-server roster (with `workspaceMembersByServer` fallback), plus self; validates statuses via `[echoPresence](../../clients/web/src/features/layout/echoPresence.ts)`; transient fetch errors suppressed, others → `reportPrimaryFlowFailure`.
- **Watches (inside composable)** — `serverStore.selectedServerId` and debounced (~60ms) `activeChannelId` → batch refresh; `onScopeDispose` clears the debounce timer.
- `**applyEchoPresenceFromSocket`\*\* — passed into `useSocket` as `onPresenceUpdate`; validates then `echoSession.patchPresence`.
- **Controller still reads** `presenceByUserId` from `echoSession` for `useChatMessages`, `memberListUsers`, and `usersForChannelPanel` (§16, §29) — not moved into the presence composable.

---

## 11. Workspace lifecycle and hydration

- `**useEchoWorkspaceLifecycle`** — `hydrateEchoFromApi`, `refreshEchoSocialFromApi`, `handleServerDeleted`, `echoWorkspaceError`; auth token/user watches (hydrate on login + cleanup on logout); first-guild / rail bootstrap inside hydrate (respecting DM rail, legacy DM channel id, `echoDmThreadIds`, and active DM call). Merges DM threads and blocked list from API; calls `refreshEchoRoleData` after hydrate and server delete. Injects `**syncEchoPresenceFromApi`** from `useEchoPresenceSync`(optional callback shape) and invokes it after successful social refresh and workspace hydrate — the batch presence implementation stays in`useEchoPresenceSync`, not in lifecycle.
- `**workspace.friendIdsByUserId`** — maintained by a **deep watch inside\*\* `useEchoWorkspaceLifecycle` from `workspace.friendIds` and `authSession.backendUser?.id` (not in the controller).

---

## 12. Group DM creation (API) and UI

- `**openGroupDmOnServerImpl`\*\* — `postEchoOpenGroupDm`, hydrate, error handling.
- `**useAppLayoutGroupDm`\*\* — modals, settings, overview, selection, registry hooks; integrates with pins/search close before open.

---

## 13. Guest experience

- `**useAppLayoutGuestSession`\*\* — guest modals (display name, upgrade, captcha), `continueAsGuest`, friends locked, message-failed hook.
- **Guest quick-DM escrow** — `sessionStorage` pending DM until account upgrade; `onGuestAccountUpgraded` delivers after upgrade.
- `**useAppLayoutBootstrap`\*\* — initial shell/bootstrap behavior with guest failure hook.

---

## 14. Guild channel & category modals

- `**useGuildChannelModals`\*\* — create channel/category, settings modals, Echo permission editors, delete/save handlers, hydration after changes.

---

## 15. Realtime: `useSocket` integration

- **Messaging** — send, edit, delete, reactions, pins/unpins, poll votes; DM call invite/accept/end socket fns are wired into `useAppLayoutDmCalls` via `setDmCallSocketSubmitters` immediately after `useSocket` resolves.
- **DM activity** — `handleEchoDmActivity` → merge thread + message.
- **Attention** — read-state patch + snapshot replace.
- **Workspace version events** — friend requests refresh; debounced `hydrateEchoFromApi` on invalidation / tree / permission / server / membership changes; live cap refresh key.
- **Reconnect hook** — `syncEchoPresenceFromApi` from `useEchoPresenceSync` + channel history attention hydrate (`echoChannelHistory.hydrateAttentionSnapshot`).
- **Pins from Echo** — `setChannelPinsFromEcho`, restore pinned ids.
- **Client caps** — `applyEchoChannelClientCap` per channel.

---

## 16. Message list, history, and actions

- `**useEchoHistory`\*\* — history + attention snapshot helpers on active channel.
- `**useChatMessages`\*\* — `activeChannelMessages` with users/presence.
- `**useMessageReactions` + `useReactionFavorites`\*\* — optimistic reactions + favorites.
- `**useAppLayoutMessageActions`\*\* — edit/delete/go-to-message/poll vote, status updates, search clear on nav, server/DM selection for jumps.
- `**usePollVotes`\*\* — local poll vote helper (paired with socket submit).

---

## 17. Search

- `**useAppLayoutSearchIntegration`\*\* — query, filters, pagination, scope hints, loading/errors, `handleGoToMessage` delegate.

---

## 18. Pinned messages

- `**useAppLayoutPinsIntegration`\*\* — dropdown state, pin/unpin, go-to pinned, Echo pin list sync, previews.

---

## 19. NSFW channel gate

- `**useAppLayoutNsfwGate`\*\* — gate visibility, acknowledge/decline, effective main/member panel columns when gated.

---

## 20. Onboarding and “welcome back”

- `**isServerEmptyOnboarding**` — computed in `useAppLayoutShellNavigation` (no guilds or empty channel tree on servers rail); controller consumes it for grid chrome and NSFW gate. It also feeds `mainSurface`, which URL sync reads indirectly.
- `**useAppLayoutWelcomeBack**` — slim banner + explore gate for returning users / session messaging.

---

## 21. Grid / main-pane chrome

- `**useAppLayoutGridChrome**` — CSS grid template columns, expand channels, explore discoverable servers flag, `isExploreView`, more-servers widths.

---

## 22. Main surface and call overlay

- `**mainSurface` / `shellNavState**` — built inside `useAppLayoutShellNavigation` via `deriveMainSurface` + channel type + persisted DM threads + `isServerEmptyOnboarding`.
- `**callOverlay**` — from `useAppLayoutDmCalls` (`deriveCallOverlay` + DM call state): guild vs DM call overlay (fullscreen, group vs 1:1).
- **DM vs guild VC coordination** — `closeDmPanelWhenServerChannelSurface` (+ watch on `mainSurface` / rail) lives in `**useAppLayoutShellNavigation`**. `isDmVoiceCallUi` comes from `**useAppLayoutDmCalls`**. Channel-panel voice strip / guild-vs-DM transport lives in `**useAppLayoutShellVoice**` (`channelPanelVoice*`/`dmCallVoiceStrip*`).

---

## 23. Guild voice (LiveKit) and media

**Implementation:** `[useAppLayoutShellVoice](../../clients/web/src/features/layout/composables/voice/useAppLayoutShellVoice.ts)` wraps `**useServerVoiceSession`\*\* — join/leave (`joinVoiceSession` / `leaveVoiceSession`), participants, LiveKit room/API, speaking levels, mic/speaker/camera/screen share, output/input volume, voice processing reapply; bridges to UI `onJoinVoice` / `onLeaveVoice` from `useAppLayoutUiState`.

- **Device stores** — `useUiAudioDevicesStore`, `useVoiceLevelsStore`, `useCameraPreferencesStore`; watches sync sink/mic and volumes when connected (inside shell voice).
- `**syncLiveKitAudioFromUiStores`\*\* — post-connect audio alignment; also passed into DM binding for DM call paths.
- **Guild vs DM control routing** — `onGuildChannelVc*` vs `onDmCallVc*` vs unified `onChannelPanelVc*` when the channel panel shows the DM call strip.
- **Screen share** — config modal vs browser defaults; picker confirm handler still surfaced on context from shell voice / ui state as today.

**Controller:** calls `useAppLayoutCallVoiceBridge` (which runs DM calls + shell voice + `bindVoiceSession` internally).

---

## 24. DM social graph (friends & message requests)

- `**useDmSocialActions`\*\* — message requests, friend requests, accept/decline/cancel, select server for flows, `refreshEchoSocialFromApi`.

---

## 25. Guild moderation

- `**useGuildModeration`\*\* — permission checks, moderation modal, kick/ban/timeout flows, VC moderate hook, invite permissions, leave voice on moderation actions as needed.

---

## 26. Server-level notifications

- `**useAppLayoutServerNotifications`\*\* — per-server notification settings modal and save.
- `**serverNotificationLevelsMap`\*\* — derived from workspace for each server.
- `**useAppLayoutServerPingIndicators`\*\* — server icon ping/attention kinds.

---

## 27. Incoming chat sound

- **Window listener** — `ECHO_INCOMING_CHAT_MESSAGE_EVENT` → `playIncomingChatMessageSound` with DM detection, `@mention` context, server notification level, member role ids for mention rules.

---

## 28. Server rail actions and leaving servers

- `**useAppLayoutServerRailActions`\*\* — settings, invite, notification settings, leave; owner-blocked vs confirm modals.
- **Local leave-server modal state** — `confirmLeaveServerFromModal` → `serverStore.leaveServer`.

---

## 29. Profiles, safety, and member list

Primary implementation now lives in `[useAppLayoutProfilesDomain](../../clients/web/src/features/layout/composables/profiles/useAppLayoutProfilesDomain.ts)`; the controller wires dependencies and exposes outputs.

- `**useAppLayoutProfileSafety`\*\* — custom status, block/unblock/report, expanded profile close, nickname changes, hydration/role refresh hooks (composed by `useAppLayoutProfilesDomain`).
- `**useAppLayoutProfiles`\*\* — member/self/expanded profile open flows, notes, DM from profile (composed by `useAppLayoutProfilesDomain`).
- `**removeEchoFriendOnServer` / `fetchEchoMutualFriends`\*\* — friend removal API + expanded profile mutuals (with generation guard) now owned by `useAppLayoutProfilesDomain`.
- **Friend/request computeds** — popout friend flag, outgoing request, cancel outgoing.
- `**memberListUsers`\*\* — server roster merge (nicknames, presence overlay, guest/shadow filtering), now emitted by `useAppLayoutProfilesDomain`.
- `**usersForChannelPanel`\*\* — channel list / VC avatar source (distinct from DM panel user list), now emitted by `useAppLayoutProfilesDomain`.
- `**dbgMemberList` watch\*\* — debug pipeline logging.

---

## 30. Forwarding messages

- **Forward modal state** — open/close, destination picker (DM threads + group DMs + visible text channels per server).
- `**submitForwardedMessage`\*\* — empty content send with `forwardMessageId` + `forwardPreview`.

---

## 31. Add server / join / create / explore

- `**useAddServerFlow`\*\* — modal views, invite join, create server, discoverable join, invite friend list, hydration, first channel selection, sign-in prompt, `sendMessage` for post-join flows.

---

## 32. Discord import / bot export UX

- **Background poll** — `fetchDiscordBotExportPending` while `sessionStorage` marks a pending guild wait; banner when export ready; 24h cap; cleanup on unmount/auth change/add-server modal close.
- `**openUserSettingsToDiscordFromAddServer`\*\* — deep-link into settings Discord section.

---

## 33. URL ↔ shell sync

- `**useUrlNavigationSync`** — invoked **only** from `**[useAppLayoutShellNavigation](../../clients/web/src/features/layout/composables/controller/useAppLayoutShellNavigation.ts)`**. Keeps History API URL in sync with rail, DM subview, channel, modals (user settings / guild server settings), workspace readiness, `mainSurface`, Echo DM thread ids; `popstate` / initial apply / logout edge cases unchanged from the dedicated module.
- **Server settings from URL** — uses the controller’s `**openServerSettingsFromUrl`** directly (same function as `**actionRegistryDraft.navigation.openServerSettingsFromUrl`**), not a post-`seal()` indirection through the sealed registry.

---

## 34. Voice navigation helpers

- `**handleJoinVoiceNavigation`**, `**canJoinPreviewVoiceChannel**`, `**handleLeaveVoiceNavigation**`, `**handleChannelVoicePanelLeave**`, `**onVcChatButtonClickNavigation\*\*`— implemented in`useAppLayoutShellVoice`; exposed on context via `useAppLayoutCallVoiceBridge` return.
- `**handleActiveChannelChangeNavigation**` — remains in the controller (channel list select + close DM panel when choosing guild text/voice).

---

## 35. Lazy-loaded shell pieces

- `**ExploreView**` — `defineAsyncComponent` for explore content.

---

## 36. Expose layer and legacy stubs

- `**buildAppLayoutExpose(context)**` — returns the object consumed by the layout; the `context` includes many **placeholder refs/computed** (`isEchoGraphId: () => false`, empty VC stubs, noop toggles) for API compatibility with older layout code paths.
- **Context composition now uses slices** — profile/voice/messaging/server-rail keys are built through typed slice builders before final `context` assembly, then passed unchanged into `buildAppLayoutExpose`.

---

## Sub-composables imported by name (dependency map)

| Composable / module                | Primary domain                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `useAppLayoutUiState`              | Shell modals, rail, DM/Guild chrome state                                                                             |
| `useAppLayoutShellNavigation`      | Rail + DM-rail intents, `mainSurface`, onboarding, DM-panel/server-surface watch, `useUrlNavigationSync`              |
| `useAppLayoutCallVoiceBridge`      | Hydrate slot + DM calls + shell voice + `bindVoiceSession`; `assignHydrateEchoFromApi` / `wireDmCallSocketSubmitters` |
| `useAppLayoutDmCalls`              | (via bridge) DM/group calls, signaling, ringtone, DM LiveKit bind, `callOverlay`                                      |
| `useAppLayoutShellVoice`           | (via bridge) Guild LiveKit session (`useServerVoiceSession`), device sync, VC bridge, voice nav helpers               |
| `useGuildChannelTree`              | Categories/channels                                                                                                   |
| `useGuildChannelModals`            | Channel/category CRUD UI                                                                                              |
| `useEchoGuildRoleUi`               | Roles, preview, Echo permissions                                                                                      |
| `useEchoPresenceSync`              | Batch presence + socket presence apply + watches                                                                      |
| `useEchoWorkspaceLifecycle`        | Hydrate, social refresh, server delete, auth watches, `friendIdsByUserId` mirror                                      |
| `useGuildModeration`               | Moderation UX                                                                                                         |
| `useDmSocialActions`               | Friends + message requests                                                                                            |
| `useAppLayoutOpenDmThread`         | Open DM thread                                                                                                        |
| `useAppLayoutEchoDmState`          | DM maps + blocking                                                                                                    |
| `useAppLayoutDmRailUnread`         | DM unread rail                                                                                                        |
| `useAppLayoutLiveChannelCaps`      | Live capabilities per channel                                                                                         |
| `useAppLayoutNsfwGate`             | NSFW gate                                                                                                             |
| `useAppLayoutSearchIntegration`    | Search                                                                                                                |
| `useAppLayoutPinsIntegration`      | Pins                                                                                                                  |
| `useAppLayoutBootstrap`            | Boot wiring                                                                                                           |
| `useAppLayoutGridChrome`           | Grid layout                                                                                                           |
| `useAppLayoutWelcomeBack`          | Welcome back / explore gate                                                                                           |
| `useAppLayoutServerNotifications`  | Server notification settings                                                                                          |
| `useAppLayoutServerPingIndicators` | Server pings                                                                                                          |
| `useAppLayoutServerRailActions`    | Server context menu actions                                                                                           |
| `useAppLayoutGuestSession`         | Guest flows                                                                                                           |
| `useAppLayoutProfilesDomain`       | Profiles + safety + member-list/channel-panel projection + mutual-friends watch                                       |
| `useAppLayoutProfileSafety`        | Block/report/nick/status safety (composed inside `useAppLayoutProfilesDomain`)                                        |
| `useAppLayoutProfiles`             | Profile popouts / expanded profile (composed inside `useAppLayoutProfilesDomain`)                                     |
| `useAppLayoutMessageActions`       | Message-level actions                                                                                                 |
| `useAddServerFlow`                 | Add/join server                                                                                                       |
| `useSelectedServerInvite`          | Invites                                                                                                               |
| `useAppLayoutGroupDm`              | Group DM UI                                                                                                           |
| `buildAppLayoutExpose`             | Public controller surface                                                                                             |

**Not imported by the controller (nested/indirect):** `useRailNavigation`, `createDmRailIntents`, `useUrlNavigationSync` (inside `useAppLayoutShellNavigation`); `useAppLayoutDmCalls`, `useAppLayoutShellVoice`, `useServerVoiceSession` (inside `useAppLayoutCallVoiceBridge`); `useAppLayoutProfileSafety`, `useAppLayoutProfiles` (inside `useAppLayoutProfilesDomain`).

---

_Inventory maintained alongside `useAppLayoutController.ts` and its extracted composables (`useEchoPresenceSync`, `useAppLayoutShellNavigation`, `useAppLayoutCallVoiceBridge`, `useAppLayoutProfilesDomain`, context slice builders, …). Validated against current controller wiring on 2026-04-10; regenerate sections when large wiring moves._
