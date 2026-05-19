# Echo monorepo domain map (single source of truth)

This document is the **authoritative** boundary reference for architecture and refactors. Every asset below has **exactly one primary domain** (slug in backticks). If code appears to belong to two domains, **this map wins**: split the module or re-home it, then update this file in the same change.

Cross-cutting behavior may be described in prose as _touching_ another domain; that is **not** a second owner.

**Inventory scope:** Tracked paths only (`git ls-files`). Untracked or local-only files are out of scope until added to the repository.

---

## Governance

1. Any change that introduces a **new** Pinia store, `frontend/src/features/<name>/` top-level folder, root-level composable (`frontend/src/composables/*.ts`), API module, or route file **must** update this document in the same PR.
2. Moves or renames of mapped files **must** update the relevant rows here; no follow-up “docs PR”.
3. Product domains may depend on `foundation` and `realtime-transport`. Product domains **must not** import `platform-shell` internals. `platform-shell` composes product domains through stable seams (props, orchestration services, small public feature APIs), per `[frontend/src/features/README.md](../../frontend/src/features/README.md)`.
4. Service layering rules in `[frontend/src/services/README.md](../../frontend/src/services/README.md)` apply **within** each domain’s orchestration; this map assigns **which domain owns** each file.

---

## Dependency overview

```mermaid
flowchart TB
  subgraph foundation [foundation]
  end
  subgraph rt [realtime-transport]
  end
  subgraph shell [platform-shell]
  end
  subgraph product [product domains]
    account[account-identity]
    ws[workspace-directory]
    msg[messaging]
    dm[social-dm]
    vm[voice-media]
    perm[permissions-roles]
    mod[moderation-safety]
    notif[notifications-attention]
    set[settings-appearance]
    disc[discord-bridge]
    obs[observability]
  end
  bot[integrations-bot]
  foundation --> product
  rt --> product
  product --> shell
  foundation --> shell
  rt --> shell
  bot --> disc
```

---

## Domain catalog

| Slug                      | Charter                                                                                                                                                                                           | Allowed outbound deps (primary)                                                     | Key backend mirror                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account-identity`        | Authentication, session, guest flows, 2FA, passkeys, password recovery, account “me” security.                                                                                                    | `foundation`, `realtime-transport`                                                  | `[backend/src/api/routes/auth/](../../backend/src/api/routes/auth/)`, `[backend/src/auth/](../../backend/src/auth/)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace-directory`     | Guild list, channel tree, categories, invites, explore/directory, workspace hydration snapshot (servers, members, discoverable servers). _Touches_ messaging for read receipts / channel context. | `foundation`, `realtime-transport`                                                  | `[echoServers.ts](../../backend/src/api/routes/echo/echoServers.ts)`, `[echoCategories.ts](../../backend/src/api/routes/echo/echoCategories.ts)`, `[echoChannels.ts](../../backend/src/api/routes/echo/echoChannels.ts)`, `[echoInvites.ts](../../backend/src/api/routes/echo/echoInvites.ts)`, `[echoPublic.ts](../../backend/src/api/routes/echo/echoPublic.ts)`, `[backend/src/domain/echoStore/servers.ts](../../backend/src/domain/echoStore/servers.ts)`, `[categoriesWorkspace.ts](../../backend/src/domain/echoStore/categoriesWorkspace.ts)`, `[invites.ts](../../backend/src/domain/echoStore/invites.ts)` |
| `messaging`               | Messages, edits, deletes, history, search, pins, reactions, typing, client message index, send pipeline, in-chat markdown.                                                                        | `foundation`, `realtime-transport`                                                  | `[echoMessages.ts](../../backend/src/api/routes/echo/echoMessages.ts)`, `[echoMessageSearch.ts](../../backend/src/api/routes/echo/echoMessageSearch.ts)`, `[channelPinsPersistence.ts](../../backend/src/domain/echoStore/channelPinsPersistence.ts)`, `[messageOps.ts](../../backend/src/domain/echoStore/messageOps.ts)`, `[messageReactionPersistence.ts](../../backend/src/domain/echoStore/messageReactionPersistence.ts)`, `[userTypingProfile.ts](../../backend/src/domain/echoStore/userTypingProfile.ts)`                                                                                                   |
| `social-dm`               | Friends, requests, blocks, DM threads, message requests, DM/group DM call UX.                                                                                                                     | `foundation`, `realtime-transport`                                                  | `[echoSocial.ts](../../backend/src/api/routes/echo/echoSocial.ts)`, `[echoDm.ts](../../backend/src/api/routes/echo/echoDm.ts)`, `[social.ts](../../backend/src/domain/echoStore/social.ts)`, `[dmThreads.ts](../../backend/src/domain/echoStore/dmThreads.ts)`, `[blocks.ts](../../backend/src/domain/echoStore/blocks.ts)`                                                                                                                                                                                                                                                                                          |
| `voice-media`             | Voice channels, LiveKit, media uploads, attachments, emoji/GIF libraries, A/V device prefs, Krisp, ringtone playback _infrastructure_.                                                            | `foundation`, `realtime-transport`                                                  | `[echoVoice.ts](../../backend/src/api/routes/echo/echoVoice.ts)`, `[echoUploads.ts](../../backend/src/api/routes/echo/echoUploads.ts)`, `[echoEmojiLibrary.ts](../../backend/src/api/routes/echo/echoEmojiLibrary.ts)`, `[voice.ts](../../backend/src/domain/echoStore/voice.ts)`, `[emojiLibrary.ts](../../backend/src/domain/echoStore/emojiLibrary.ts)`                                                                                                                                                                                                                                                           |
| `permissions-roles`       | Roles, aggregates, permission overwrites, explain/preview, server settings areas that are RBAC-first.                                                                                             | `foundation`, `realtime-transport`                                                  | `[echoRoles.ts](../../backend/src/api/routes/echo/echoRoles.ts)`, `[echoPermissionOverwrites.ts](../../backend/src/api/routes/echo/echoPermissionOverwrites.ts)`, `[echoServerScoped.ts](../../backend/src/api/routes/echo/echoServerScoped.ts)`, `[echoPermissionEvaluate.ts](../../backend/src/domain/echoPermissionEvaluate.ts)`, `[roles.ts](../../backend/src/domain/echoStore/roles.ts)`, `[permissionOverwrites.ts](../../backend/src/domain/echoStore/permissionOverwrites.ts)`, `[permissions.ts](../../backend/src/domain/echoStore/permissions.ts)`                                                       |
| `moderation-safety`       | Kicks, bans, timeouts, automod/raid toggles, audit log, safety endpoints.                                                                                                                         | `foundation`, `realtime-transport`                                                  | `[echoModeration.ts](../../backend/src/api/routes/echo/echoModeration.ts)`, `[echoSafety.ts](../../backend/src/api/routes/echo/echoSafety.ts)`, `[moderation.ts](../../backend/src/domain/echoStore/moderation.ts)`, `[auditLog.ts](../../backend/src/domain/echoStore/auditLog.ts)`                                                                                                                                                                                                                                                                                                                                 |
| `notifications-attention` | Unread/mention attention, server notification prefs, ping UX.                                                                                                                                     | `foundation`, `realtime-transport`                                                  | `[attention.ts](../../backend/src/domain/echoStore/attention.ts)`, `[serverNotificationPreferences.ts](../../backend/src/domain/echoStore/serverNotificationPreferences.ts)`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `settings-appearance`     | User settings surfaces (appearance, sounds, legal, formatting guides) distinct from guild admin modals.                                                                                           | `foundation`, `realtime-transport`, other product domains via thin API clients only | (mostly frontend; backend pieces split per API table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `discord-bridge`          | Discord OAuth, import, me-Discord linking, bot hooks.                                                                                                                                             | `foundation`, `realtime-transport`                                                  | `[discordOAuth.ts](../../backend/src/api/routes/discordOAuth.ts)`, `[meDiscord.ts](../../backend/src/api/routes/meDiscord.ts)`, `[echoDiscordImport.ts](../../backend/src/api/routes/echo/echoDiscordImport.ts)`, `[discordBotHook.ts](../../backend/src/api/routes/discordBotHook.ts)`, `[discordImport.ts](../../backend/src/services/discordImport.ts)`                                                                                                                                                                                                                                                           |
| `platform-shell`          | App shell composition: layout controller, URL sync, rails, modals host wiring, workspace lifecycle orchestration entrypoints.                                                                     | `foundation`, `realtime-transport`, all product domains via seams                   | `[bootstrap/startServer.ts](../../backend/src/bootstrap/startServer.ts)` is not shell—see `foundation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `realtime-transport`      | WebSocket client/server transport, connection lifecycle, transport-shaped diagnostics.                                                                                                            | `foundation`                                                                        | `[backend/src/bootstrap/socket.ts](../../backend/src/bootstrap/socket.ts)`, `[backend/src/sockets/](../../backend/src/sockets/)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `observability`           | Diagnostics, bug reports, dev tracing, metrics hooks.                                                                                                                                             | `foundation`                                                                        | `[devDiagnostics.ts](../../backend/src/api/routes/devDiagnostics.ts)`, `[echoBugReports.ts](../../backend/src/api/routes/echo/echoBugReports.ts)`, `[backend/src/observability/](../../backend/src/observability/)`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `foundation`              | Shared contracts, generic HTTP helpers, cross-cutting utilities with **no** single product owner, DB/bootstrap glue.                                                                              | `foundation` only                                                                   | `[shared/](../../shared/)`, `[backend/src/db/](../../backend/src/db/)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `integrations-bot`        | Discord export bot and tooling.                                                                                                                                                                   | `foundation`, `discord-bridge` _data contracts only_                                | `[bot/src](../../bot/src)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Explicit ownership overrides (global state)

| Asset                                               | Primary domain            | Note                                                               |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `useEchoSessionStore` / hydrated workspace snapshot | `workspace-directory`     | Includes `presenceByUserId` materialization; consumed by many UIs. |
| `useServerStore`                                    | `workspace-directory`     | Facade over echo session for server rail / ordering.               |
| `messageIndex` store                                | `messaging`               | Client-side channel message indexes.                               |
| `echoAttention` store                               | `notifications-attention` | Unread/mention map.                                                |
| `channelTyping` store                               | `messaging`               | Typing indicators are channel/chat affordances.                    |

---

## Pinia stores (`frontend/src/stores/`)

| Path                                             | Domain                    |
| ------------------------------------------------ | ------------------------- |
| `frontend/src/stores/authSession.ts`             | `account-identity`        |
| `frontend/src/stores/bugHunter.ts`               | `observability`           |
| `frontend/src/stores/callRingtone.ts`            | `voice-media`             |
| `frontend/src/stores/cameraPreferences.ts`       | `voice-media`             |
| `frontend/src/stores/channelTyping.ts`           | `messaging`               |
| `frontend/src/stores/devSettings.ts`             | `observability`           |
| `frontend/src/stores/echoAttention.ts`           | `notifications-attention` |
| `frontend/src/stores/echoAttention.test.ts`      | `notifications-attention` |
| `frontend/src/stores/echoSession.ts`             | `workspace-directory`     |
| `frontend/src/stores/messageIndex.ts`            | `messaging`               |
| `frontend/src/stores/notificationPreferences.ts` | `notifications-attention` |
| `frontend/src/stores/server.ts`                  | `workspace-directory`     |
| `frontend/src/stores/theme.ts`                   | `settings-appearance`     |
| `frontend/src/stores/uiAudioDevices.ts`          | `voice-media`             |
| `frontend/src/stores/voiceLevels.ts`             | `voice-media`             |
| `frontend/src/stores/voiceLevels.test.ts`        | `voice-media`             |

---

## Frontend API clients (`frontend/src/api/`)

| Path                                             | Domain                    |
| ------------------------------------------------ | ------------------------- |
| `frontend/src/api/client.ts`                     | `foundation`              |
| `frontend/src/api/authClient.ts`                 | `account-identity`        |
| `frontend/src/api/authClient.loginParse.test.ts` | `account-identity`        |
| `frontend/src/api/meClient.ts`                   | `account-identity`        |
| `frontend/src/api/echoClient.ts`                 | `foundation`              |
| `frontend/src/api/echoClient.test.ts`            | `foundation`              |
| `frontend/src/api/echoSearchParams.ts`           | `foundation`              |
| `frontend/src/api/echoSearchParams.test.ts`      | `foundation`              |
| `frontend/src/api/echo/attention.ts`             | `notifications-attention` |
| `frontend/src/api/echo/bugReports.ts`            | `observability`           |
| `frontend/src/api/echo/categories.ts`            | `workspace-directory`     |
| `frontend/src/api/echo/channels.ts`              | `workspace-directory`     |
| `frontend/src/api/echo/discordImport.ts`         | `discord-bridge`          |
| `frontend/src/api/echo/emoji.ts`                 | `voice-media`             |
| `frontend/src/api/echo/guild.ts`                 | `workspace-directory`     |
| `frontend/src/api/echo/invitesAndDirectory.ts`   | `workspace-directory`     |
| `frontend/src/api/echo/messages.ts`              | `messaging`               |
| `frontend/src/api/echo/moderation.ts`            | `moderation-safety`       |
| `frontend/src/api/echo/permissions.ts`           | `permissions-roles`       |
| `frontend/src/api/echo/serverAdmin.ts`           | `permissions-roles`       |
| `frontend/src/api/echo/serverLifecycle.ts`       | `workspace-directory`     |
| `frontend/src/api/echo/social.ts`                | `social-dm`               |
| `frontend/src/api/echo/transport.ts`             | `foundation`              |
| `frontend/src/api/echo/transport.test.ts`        | `foundation`              |
| `frontend/src/api/echo/types.ts`                 | `foundation`              |
| `frontend/src/api/echo/uploads.ts`               | `voice-media`             |
| `frontend/src/api/echo/voice.ts`                 | `voice-media`             |
| `frontend/src/api/echo/workspace.ts`             | `workspace-directory`     |

---

## Frontend services (`frontend/src/services/`)

| Path                                                                                | Domain                |
| ----------------------------------------------------------------------------------- | --------------------- |
| `frontend/src/services/README.md`                                                   | `foundation`          |
| `frontend/src/services/index.ts`                                                    | `foundation`          |
| `frontend/src/services/api/echoApi.ts`                                              | `foundation`          |
| `frontend/src/services/domain/composer.ts`                                          | `messaging`           |
| `frontend/src/services/domain/permissions.ts`                                       | `permissions-roles`   |
| `frontend/src/services/domain/presence.ts`                                          | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceAuthUserRoster.ts`                    | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceFirstGuildBootstrapGuard.ts`          | `workspace-directory` |
| `frontend/src/services/domain/workspaceFriendIdsByUserId.ts`                        | `workspace-directory` |
| `frontend/src/services/domain/workspaceHydrateSkipLatch.ts`                         | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceEchoHydrateFromApi.ts`                | `workspace-directory` |
| `frontend/src/services/domain/workspaceEchoApiSnapshot.ts`                          | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceRosterMerge.ts`                       | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceServerDeletionNav.ts`                 | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceShellResetOnLogout.ts`                | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceSocialHydrate.ts`                     | `workspace-directory` |
| `frontend/src/services/orchestration/workspaceSocketEventHandler.ts`                | `workspace-directory` |
| `frontend/src/services/domain/sendIntent.ts`                                        | `messaging`           |
| `frontend/src/services/domain/serverSettings.ts`                                    | `permissions-roles`   |
| `frontend/src/services/domain/__tests__/composer.test.ts`                           | `messaging`           |
| `frontend/src/services/domain/__tests__/permissions.test.ts`                        | `permissions-roles`   |
| `frontend/src/services/domain/__tests__/presence.test.ts`                           | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceAuthUserRoster.test.ts`            | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceFirstGuildBootstrapGuard.test.ts`  | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceFriendIdsByUserId.test.ts`         | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceHydrateSkipLatch.test.ts`          | `workspace-directory` |
| `frontend/src/services/orchestration/__tests__/workspaceEchoHydrateFromApi.test.ts` | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceEchoApiSnapshot.test.ts`           | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceRosterMerge.test.ts`               | `workspace-directory` |
| `frontend/src/services/orchestration/__tests__/workspaceServerDeletionNav.test.ts`  | `workspace-directory` |
| `frontend/src/services/orchestration/__tests__/workspaceShellResetOnLogout.test.ts` | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceSocialHydrate.test.ts`             | `workspace-directory` |
| `frontend/src/services/domain/__tests__/workspaceSocketEventHandler.test.ts`        | `workspace-directory` |
| `frontend/src/services/domain/__tests__/sendIntent.test.ts`                         | `messaging`           |
| `frontend/src/services/orchestration/appEchoRealtimeHost.ts`                        | `platform-shell`      |
| `frontend/src/services/orchestration/__tests__/appEchoRealtimeHost.test.ts`         | `platform-shell`      |
| `frontend/src/services/orchestration/appLayout.ts`                                  | `platform-shell`      |
| `frontend/src/services/orchestration/send.ts`                                       | `messaging`           |
| `frontend/src/services/orchestration/serverSettings.ts`                             | `permissions-roles`   |
| `frontend/src/services/orchestration/voice.ts`                                      | `voice-media`         |
| `frontend/src/services/orchestration/voiceRouting.ts`                               | `voice-media`         |
| `frontend/src/services/orchestration/workspaceLifecycle.ts`                         | `platform-shell`      |
| `frontend/src/services/orchestration/__tests__/send.test.ts`                        | `messaging`           |
| `frontend/src/services/orchestration/__tests__/voice.test.ts`                       | `voice-media`         |
| `frontend/src/services/send/send.ts`                                                | `messaging`           |
| `frontend/src/services/send/__tests__/send.test.ts`                                 | `messaging`           |
| `frontend/src/services/adapters/socketAdapter.ts`                                   | `realtime-transport`  |
| `frontend/src/services/adapters/storeAdapters.ts`                                   | `foundation`          |
| `frontend/src/services/realtime/echoRealtimePort.ts`                                | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketInboundListeners.ts`                      | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketMessageStoreBridge.ts`                    | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketComposableEffects.ts`                     | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketRealtimeWiring.ts`                        | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketSendMessage.ts`                           | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketSessionLifecycle.ts`                      | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketSubmitEmits.ts`                           | `realtime-transport`  |
| `frontend/src/services/realtime/echoSocketUiTransactions.ts`                        | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/echoSocketComposableEffects.test.ts`      | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/echoSocketMessageStoreBridge.test.ts`     | `realtime-transport`  |
| `frontend/src/services/realtime/socketChannelTypingIngest.ts`                       | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketChannelTypingIngest.test.ts`        | `realtime-transport`  |
| `frontend/src/services/realtime/socketConnectErrorIngest.ts`                        | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketConnectErrorIngest.test.ts`         | `realtime-transport`  |
| `frontend/src/services/realtime/socketUnexpectedDisconnectUi.ts`                    | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketUnexpectedDisconnectUi.test.ts`     | `realtime-transport`  |
| `frontend/src/services/realtime/socketInbound.ts`                                   | `realtime-transport`  |
| `frontend/src/services/realtime/socketIncomingChatNotify.ts`                        | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketIncomingChatNotify.test.ts`         | `realtime-transport`  |
| `frontend/src/services/realtime/socketIncomingLiveMessage.ts`                       | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketIncomingLiveMessage.test.ts`        | `realtime-transport`  |
| `frontend/src/services/realtime/socketMessageAckApply.ts`                           | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketMessageAckApply.test.ts`            | `realtime-transport`  |
| `frontend/src/services/realtime/socketRemoteMessagePatchApply.ts`                   | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketRemoteMessagePatchApply.test.ts`    | `realtime-transport`  |
| `frontend/src/services/realtime/socketMessageFailedIngest.ts`                       | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketMessageFailedIngest.test.ts`        | `realtime-transport`  |
| `frontend/src/services/realtime/socketPollVoteFailed.ts`                            | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketPollVoteFailed.test.ts`             | `realtime-transport`  |
| `frontend/src/services/realtime/socketIncomingRawMessage.ts`                        | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketIncomingRawMessage.test.ts`         | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutbound.ts`                                  | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutboundPlainTextChunks.ts`                   | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutboundChunkedChatSend.ts`                   | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutboundPollSend.ts`                          | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutboundChatSend.ts`                          | `realtime-transport`  |
| `frontend/src/services/realtime/socketOutboundSendPreflight.ts`                     | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketOutboundPlainTextChunks.test.ts`    | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketOutboundChunkedChatSend.test.ts`    | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketOutboundPollSend.test.ts`           | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketOutboundChatSend.test.ts`           | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketOutboundSendPreflight.test.ts`      | `realtime-transport`  |
| `frontend/src/services/realtime/socketPendingClientMessages.ts`                     | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketPendingClientMessages.test.ts`      | `realtime-transport`  |
| `frontend/src/services/realtime/socketPresenceSession.ts`                           | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketPresenceSession.test.ts`            | `realtime-transport`  |
| `frontend/src/services/realtime/socketTransport.ts`                                 | `realtime-transport`  |
| `frontend/src/services/realtime/socketConnectBootstrap.ts`                          | `realtime-transport`  |
| `frontend/src/services/realtime/socketClientResumeAndWindow.ts`                     | `realtime-transport`  |
| `frontend/src/services/realtime/socketIoSessionWire.ts`                             | `realtime-transport`  |
| `frontend/src/services/realtime/socketConnectOrchestrator.ts`                       | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketConnectBootstrap.test.ts`           | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketClientResumeAndWindow.test.ts`      | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketIoSessionWire.test.ts`              | `realtime-transport`  |
| `frontend/src/services/realtime/__tests__/socketConnectOrchestrator.test.ts`        | `realtime-transport`  |
| `frontend/src/services/livekit/krispNoiseFilter.ts`                                 | `voice-media`         |
| `frontend/src/services/livekit/krispNoiseFilter.test.ts`                            | `voice-media`         |
| `frontend/src/services/livekit/livekitTrackAdapter.ts`                              | `voice-media`         |

---

## Shared composables (`frontend/src/composables/`)

| Path                                                               | Domain                |
| ------------------------------------------------------------------ | --------------------- |
| `frontend/src/composables/markdownMathRegions.ts`                  | `messaging`           |
| `frontend/src/composables/markdownMathRegions.test.ts`             | `messaging`           |
| `frontend/src/composables/normalizeKatexInput.ts`                  | `messaging`           |
| `frontend/src/composables/normalizeKatexInput.test.ts`             | `messaging`           |
| `frontend/src/composables/useAppIconSearch.ts`                     | `foundation`          |
| `frontend/src/composables/useAudioLevelMonitor.ts`                 | `voice-media`         |
| `frontend/src/composables/useBugHunterAppTrace.ts`                 | `observability`       |
| `frontend/src/composables/useChannelAutocomplete.ts`               | `messaging`           |
| `frontend/src/composables/useChannels.ts`                          | `workspace-directory` |
| `frontend/src/composables/useChannels.test.ts`                     | `workspace-directory` |
| `frontend/src/composables/useChatMessages.ts`                      | `messaging`           |
| `frontend/src/composables/useChatMessages.test.ts`                 | `messaging`           |
| `frontend/src/composables/useChatPermissions.ts`                   | `permissions-roles`   |
| `frontend/src/composables/useChatPermissions.test.ts`              | `permissions-roles`   |
| `frontend/src/composables/useChatSend.ts`                          | `messaging`           |
| `frontend/src/composables/useComposerState.ts`                     | `messaging`           |
| `frontend/src/composables/useEchoHistory.ts`                       | `messaging`           |
| `frontend/src/features/chat/composables/useEchoHistory.ts`         | `messaging`           |
| `frontend/src/features/chat/composables/useEchoHistory.test.ts`    | `messaging`           |
| `frontend/src/features/chat/constants/echoHistoryPageSize.ts`      | `messaging`           |
| `frontend/src/composables/useEchoSounds.ts`                        | `settings-appearance` |
| `frontend/src/composables/useEchoWorkspace.ts`                     | `workspace-directory` |
| `frontend/src/composables/useEmojiAutocomplete.ts`                 | `voice-media`         |
| `frontend/src/composables/useEmojiData.ts`                         | `voice-media`         |
| `frontend/src/composables/useEmojiData.test.ts`                    | `voice-media`         |
| `frontend/src/composables/useEmojiPicker.ts`                       | `voice-media`         |
| `frontend/src/composables/useEmojiPreload.ts`                      | `voice-media`         |
| `frontend/src/composables/useEmojiSearchIndex.ts`                  | `voice-media`         |
| `frontend/src/composables/useEmojiSearchIndex.test.ts`             | `voice-media`         |
| `frontend/src/composables/useFocusTrap.ts`                         | `foundation`          |
| `frontend/src/composables/useGifSearch.ts`                         | `voice-media`         |
| `frontend/src/composables/useLayout.ts`                            | `platform-shell`      |
| `frontend/src/composables/useLimitedGifPlayback.ts`                | `voice-media`         |
| `frontend/src/composables/useLiveKitVoiceRoom.ts`                  | `voice-media`         |
| `frontend/src/composables/useMarkdown.ts`                          | `messaging`           |
| `frontend/src/features/chat/viewModel/messageBodyMarkdown.ts`      | `messaging`           |
| `frontend/src/composables/useMarkdown.cache.test.ts`               | `messaging`           |
| `frontend/src/composables/useMarkdown.katex.test.ts`               | `messaging`           |
| `frontend/src/composables/useMarkdown.mentionShield.test.ts`       | `messaging`           |
| `frontend/src/composables/useMediaDevices.ts`                      | `voice-media`         |
| `frontend/src/composables/useMentionAutocomplete.ts`               | `messaging`           |
| `frontend/src/composables/useMessageReactions.ts`                  | `messaging`           |
| `frontend/src/composables/useMessageReactions.test.ts`             | `messaging`           |
| `frontend/src/composables/useMicTestMonitor.ts`                    | `voice-media`         |
| `frontend/src/composables/useMoreServers.ts`                       | `workspace-directory` |
| `frontend/src/composables/usePendingMedia.ts`                      | `messaging`           |
| `frontend/src/composables/usePollVotes.ts`                         | `messaging`           |
| `frontend/src/composables/usePollVotes.test.ts`                    | `messaging`           |
| `frontend/src/composables/usePopoutStack.ts`                       | `platform-shell`      |
| `frontend/src/composables/useReactionFavorites.ts`                 | `messaging`           |
| `frontend/src/composables/useReactionFavorites.test.ts`            | `messaging`           |
| `frontend/src/composables/useRecentlyUsedEmojis.ts`                | `voice-media`         |
| `frontend/src/composables/useSearch.ts`                            | `messaging`           |
| `frontend/src/composables/useServerEmojiLibrary.ts`                | `voice-media`         |
| `frontend/src/composables/useShiftKey.ts`                          | `foundation`          |
| `frontend/src/composables/useSimpleContextMenu.ts`                 | `foundation`          |
| `frontend/src/composables/useSocket.ts`                            | `realtime-transport`  |
| `frontend/src/composables/useSpeakingState.ts`                     | `voice-media`         |
| `frontend/src/composables/useVcPushToTalk.ts`                      | `voice-media`         |
| `frontend/src/composables/voiceGate.ts`                            | `voice-media`         |
| `frontend/src/composables/voiceGate.test.ts`                       | `voice-media`         |
| `frontend/src/composables/voiceProcessingInjection.ts`             | `voice-media`         |
| `frontend/src/composables/voiceProcessingPreferences.ts`           | `voice-media`         |
| `frontend/src/composables/voiceProcessingPreferences.test.ts`      | `voice-media`         |
| `frontend/src/composables/workspace/types.ts`                      | `workspace-directory` |
| `frontend/src/composables/workspace/utils.ts`                      | `workspace-directory` |
| `frontend/src/composables/workspace/workspaceModerationActions.ts` | `moderation-safety`   |
| `frontend/src/composables/workspace/workspaceServerActions.ts`     | `workspace-directory` |
| `frontend/src/composables/workspace/workspaceUserActions.ts`       | `social-dm`           |

---

## Feature modules (`frontend/src/features/`)

**Inheritance:** Every tracked path under `frontend/src/features/<folder>/` inherits the folder’s primary domain unless listed under _Overrides_.

| Folder                  | Primary domain            | Notable entrypoints                                                                         |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `channel-panel/`        | `workspace-directory`     | Channel tree / voice panel UI, `useChannelPanel`\*                                          |
| `channel-settings/`     | `permissions-roles`       | `PermissionOverwriteEditor.vue`, channel permission UX                                      |
| `chat/`                 | `messaging`               | `useEchoHistory`, composer model, message bubble body, pins, forward modal, `sendIntent.ts` |
| `discord/`              | `discord-bridge`          | `discordIntegrationCopy.ts`                                                                 |
| `dm/`                   | `social-dm`               | DM list helpers, DM call/social composables                                                 |
| `google/`               | `account-identity`        | `googleIntegrationCopy.ts`                                                                  |
| `layout/`               | `platform-shell`          | `useAppLayoutController`, rails, URL sync, shell sections                                   |
| `navigation/`           | `messaging`               | Message jump / scroll bridge                                                                |
| `server-notifications/` | `notifications-attention` | Server ping + notification helpers                                                          |
| `server-settings/`      | `permissions-roles`       | Guild settings modal sections, roles, audit, moderation _settings_ UX                       |
| `settings/`             | `settings-appearance`     | User settings panels and composables                                                        |
| `README.md`             | `foundation`              | Module conventions doc                                                                      |

**Overrides (file → domain):**

| Path                                                                                   | Domain                | Reason                                                  |
| -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| `frontend/src/features/chat/components/DiscordChannelImportWidget.vue`                 | `discord-bridge`      | Discord import CTA/widget                               |
| `frontend/src/features/layout/composables/useGuildModeration.ts`                       | `moderation-safety`   | Guild moderation intents                                |
| `frontend/src/features/server-settings/composables/useServerSettingsDangerZone.ts`     | `workspace-directory` | Destructive guild lifecycle (leave/delete server flows) |
| `frontend/src/features/server-settings/composables/useServerSettingsEchoAuditBans.ts`  | `moderation-safety`   | Ban list materialization                                |
| `frontend/src/features/server-settings/components/ServerSettingsModerationSection.vue` | `moderation-safety`   | Automod / raid UX                                       |
| `frontend/src/features/server-settings/components/ServerSettingsBansSection.vue`       | `moderation-safety`   | Ban management UX                                       |
| `frontend/src/features/server-settings/components/ServerSettingsAuditLogSection.vue`   | `moderation-safety`   | Audit log UX                                            |
| `frontend/src/features/server-settings/components/ServerSettingsDiscordSection.vue`    | `discord-bridge`      | Guild Discord link UX                                   |
| `frontend/src/features/settings/components/SettingsDiscordLinkSection.vue`             | `discord-bridge`      | User Discord link UX                                    |
| `frontend/src/features/settings/components/SettingsFriends.vue`                        | `social-dm`           | Friends settings surface                                |
| `frontend/src/features/settings/components/GuestAccountUpgradePanel.vue`               | `account-identity`    | Guest upgrade                                           |
| `frontend/src/features/layout/components/WelcomeBackExploreGate.vue`                   | `account-identity`    | Auth-gated welcome                                      |

All other tracked files under each folder follow the folder’s primary domain.

---

## `frontend/src/utils/` (default `foundation`)

**Rule:** Unless listed below, a file under `frontend/src/utils/` is `**foundation*`\*.

| Path                                                           | Domain                |
| -------------------------------------------------------------- | --------------------- |
| `frontend/src/utils/accountValidation.ts`                      | `account-identity`    |
| `frontend/src/utils/accountValidation.test.ts`                 | `account-identity`    |
| `frontend/src/utils/priorRegistration.ts`                      | `account-identity`    |
| `frontend/src/utils/totpQrDataUrl.ts`                          | `account-identity`    |
| `frontend/src/utils/echoCsrf.ts`                               | `account-identity`    |
| `frontend/src/utils/echoIds.ts`                                | `foundation`          |
| `frontend/src/utils/echoIds.test.ts`                           | `foundation`          |
| `frontend/src/utils/echoServerOwnership.ts`                    | `workspace-directory` |
| `frontend/src/utils/echoServerOwnership.test.ts`               | `workspace-directory` |
| `frontend/src/utils/exploreDirectory.ts`                       | `workspace-directory` |
| `frontend/src/utils/exploreDirectory.test.ts`                  | `workspace-directory` |
| `frontend/src/utils/serverVanitySlug.ts`                       | `workspace-directory` |
| `frontend/src/utils/serverVanitySlug.test.ts`                  | `workspace-directory` |
| `frontend/src/utils/serverRailOrderPersistence.ts`             | `workspace-directory` |
| `frontend/src/utils/serverRailReorder.ts`                      | `workspace-directory` |
| `frontend/src/utils/serverRailReorder.test.ts`                 | `workspace-directory` |
| `frontend/src/utils/workspaceSessionCache.ts`                  | `workspace-directory` |
| `frontend/src/utils/workspaceSessionCache.test.ts`             | `workspace-directory` |
| `frontend/src/utils/iconChannelSort.ts`                        | `workspace-directory` |
| `frontend/src/utils/iconChannelSort.test.ts`                   | `workspace-directory` |
| `frontend/src/utils/inviteLinkParse.ts`                        | `workspace-directory` |
| `frontend/src/utils/inviteLinkParse.test.ts`                   | `workspace-directory` |
| `frontend/src/utils/inviteEmbedParse.ts`                       | `workspace-directory` |
| `frontend/src/utils/inviteEmbedParse.test.ts`                  | `workspace-directory` |
| `frontend/src/utils/localProfilePersistence.ts`                | `workspace-directory` |
| `frontend/src/utils/localProfilePersistence.test.ts`           | `workspace-directory` |
| `frontend/src/utils/compareRawMessagesChronologically.ts`      | `messaging`           |
| `frontend/src/utils/compareRawMessagesChronologically.test.ts` | `messaging`           |
| `frontend/src/utils/messageJumpContentParse.ts`                | `messaging`           |
| `frontend/src/utils/messageJumpContentParse.test.ts`           | `messaging`           |
| `frontend/src/utils/messageChunkLimits.test.ts`                | `messaging`           |
| `frontend/src/utils/storedMessageTimestamp.ts`                 | `messaging`           |
| `frontend/src/utils/idTokens.ts`                               | `messaging`           |
| `frontend/src/utils/idTokens.test.ts`                          | `messaging`           |
| `frontend/src/utils/embedLinkLabels.ts`                        | `messaging`           |
| `frontend/src/utils/embedLinkLabels.test.ts`                   | `messaging`           |
| `frontend/src/utils/realtimeMessageFailedUserMessage.ts`       | `messaging`           |
| `frontend/src/utils/realtimeMessageFailedUserMessage.test.ts`  | `messaging`           |
| `frontend/src/utils/channelMentionLabel.ts`                    | `messaging`           |
| `frontend/src/utils/channelMentionLabel.test.ts`               | `messaging`           |
| `frontend/src/utils/echoChannelMessageWindow.ts`               | `messaging`           |
| `frontend/src/utils/normalizeMessageAttachments.ts`            | `messaging`           |
| `frontend/src/utils/isOfflinePresence.ts`                      | `messaging`           |
| `frontend/src/utils/memberProfiles.ts`                         | `permissions-roles`   |
| `frontend/src/utils/memberProfiles.test.ts`                    | `permissions-roles`   |
| `frontend/src/utils/gifFirstFrame.ts`                          | `voice-media`         |
| `frontend/src/utils/gifOneLoopDuration.ts`                     | `voice-media`         |
| `frontend/src/utils/gifOneLoopDuration.test.ts`                | `voice-media`         |
| `frontend/src/utils/isGifImageUrl.ts`                          | `voice-media`         |
| `frontend/src/utils/isGifImageUrl.test.ts`                     | `voice-media`         |
| `frontend/src/utils/livekitTrackMediaStream.ts`                | `voice-media`         |
| `frontend/src/utils/chatUploadMediaTypes.ts`                   | `voice-media`         |
| `frontend/src/utils/uploadCompression.ts`                      | `voice-media`         |
| `frontend/src/utils/uploadFingerprint.ts`                      | `voice-media`         |
| `frontend/src/utils/safeImageUrl.ts`                           | `voice-media`         |
| `frontend/src/utils/safeImageUrl.test.ts`                      | `voice-media`         |
| `frontend/src/utils/discordProfileDisplay.ts`                  | `discord-bridge`      |
| `frontend/src/utils/discordSpoilerMarkdown.ts`                 | `discord-bridge`      |
| `frontend/src/utils/discordSpoilerMarkdown.test.ts`            | `discord-bridge`      |
| `frontend/src/utils/theme.ts`                                  | `settings-appearance` |
| `frontend/src/utils/profileBannerGradientFromImage.ts`         | `settings-appearance` |
| `frontend/src/utils/avatarDisplay.ts`                          | `settings-appearance` |
| `frontend/src/utils/avatarDisplay.test.ts`                     | `settings-appearance` |
| `frontend/src/utils/analytics.ts`                              | `observability`       |
| `frontend/src/utils/primaryFlowFailure.ts`                     | `observability`       |
| `frontend/src/utils/echoMemberListDebug.ts`                    | `observability`       |
| `frontend/src/utils/uiErrorBus.ts`                             | `observability`       |
| `frontend/src/utils/uiErrorBus.test.ts`                        | `observability`       |
| `frontend/src/utils/controllerMissingAction.ts`                | `platform-shell`      |
| `frontend/src/utils/actionFailurePropagation.ts`               | `platform-shell`      |
| `frontend/src/utils/formatPollTime.ts`                         | `messaging`           |
| `frontend/src/utils/formatPollTime.test.ts`                    | `messaging`           |
| `frontend/src/utils/formatTimestamp.ts`                        | `messaging`           |
| `frontend/src/utils/formatTimestamp.test.ts`                   | `messaging`           |
| `frontend/src/utils/iconCatalogGrouping.ts`                    | `workspace-directory` |
| `frontend/src/utils/iconCatalogGrouping.test.ts`               | `workspace-directory` |
| `frontend/src/utils/emojiUtils.ts`                             | `foundation`          |
| `frontend/src/utils/emojiUtils.test.ts`                        | `foundation`          |
| `frontend/src/utils/emojiDevCopy.ts`                           | `observability`       |
| `frontend/src/utils/sanitizeEmojiImgHtmlForVHtml.ts`           | `foundation`          |
| `frontend/src/utils/twemoji.ts`                                | `foundation`          |
| `frontend/src/utils/twemoji.test.ts`                           | `foundation`          |
| `frontend/src/utils/twemoji.extra.test.ts`                     | `foundation`          |

---

## Frontend observability (`frontend/src/observability/`)

| Path                                                    | Domain               |
| ------------------------------------------------------- | -------------------- |
| `frontend/src/observability/bugHunterTrace.ts`          | `observability`      |
| `frontend/src/observability/bugHunterTrace.test.ts`     | `observability`      |
| `frontend/src/observability/echoDevTrace.ts`            | `observability`      |
| `frontend/src/observability/sessionDiagnostics.ts`      | `observability`      |
| `frontend/src/observability/sessionDiagnostics.test.ts` | `observability`      |
| `frontend/src/observability/socketDiagnostics.ts`       | `realtime-transport` |
| `frontend/src/observability/voiceClientTrace.ts`        | `voice-media`        |

---

## Frontend domain + entry (`frontend/src/domain/`, roots)

| Path                                                | Domain              |
| --------------------------------------------------- | ------------------- |
| `frontend/src/domain/chatRolePreviewPermissions.ts` | `permissions-roles` |
| `frontend/src/main.ts`                              | `platform-shell`    |
| `frontend/src/App.vue`                              | `platform-shell`    |

---

## Vue SFC inventory — `frontend/src/components/`

| Path                                                                | Domain                    |
| ------------------------------------------------------------------- | ------------------------- |
| `frontend/src/components/AddServerModal.vue`                        | `workspace-directory`     |
| `frontend/src/components/AppLayout.vue`                             | `platform-shell`          |
| `frontend/src/components/AppLayoutLoadError.vue`                    | `platform-shell`          |
| `frontend/src/components/AppLayoutSplash.vue`                       | `platform-shell`          |
| `frontend/src/components/BugReportModal.vue`                        | `observability`           |
| `frontend/src/components/CallRingtoneControls.vue`                  | `voice-media`             |
| `frontend/src/components/CallRingtoneInlinePlayer.vue`              | `voice-media`             |
| `frontend/src/components/CallView.vue`                              | `voice-media`             |
| `frontend/src/components/CameraPreview.vue`                         | `voice-media`             |
| `frontend/src/components/CategorySettingsModal.vue`                 | `workspace-directory`     |
| `frontend/src/components/ChannelIconPickerPopover.vue`              | `workspace-directory`     |
| `frontend/src/components/ChannelPanel.vue`                          | `workspace-directory`     |
| `frontend/src/components/ChannelSettingsModal.vue`                  | `permissions-roles`       |
| `frontend/src/components/CreateCategoryModal.vue`                   | `workspace-directory`     |
| `frontend/src/components/CreateChannelModal.vue`                    | `workspace-directory`     |
| `frontend/src/components/DMCallView.vue`                            | `social-dm`               |
| `frontend/src/components/DMPanel.vue`                               | `social-dm`               |
| `frontend/src/components/DMProfilePanel.vue`                        | `social-dm`               |
| `frontend/src/components/EchoDropdown.vue`                          | `foundation`              |
| `frontend/src/components/EmojiCategorySection.vue`                  | `voice-media`             |
| `frontend/src/components/ExpandedProfileModal.vue`                  | `platform-shell`          |
| `frontend/src/components/ExploreServersPanel.vue`                   | `workspace-directory`     |
| `frontend/src/components/ExploreView.vue`                           | `workspace-directory`     |
| `frontend/src/components/FriendsView.vue`                           | `social-dm`               |
| `frontend/src/components/FullscreenStreamOverlay.vue`               | `voice-media`             |
| `frontend/src/components/GroupDMCreateModal.vue`                    | `social-dm`               |
| `frontend/src/components/GroupDMOverviewPanel.vue`                  | `social-dm`               |
| `frontend/src/components/GroupDMSettingsModal.vue`                  | `social-dm`               |
| `frontend/src/components/GuestCaptchaModal.vue`                     | `account-identity`        |
| `frontend/src/components/GuestDisplayNameModal.vue`                 | `account-identity`        |
| `frontend/src/components/GuestUpgradeModal.vue`                     | `account-identity`        |
| `frontend/src/components/IconNumberedRenameDevModal.vue`            | `observability`           |
| `frontend/src/components/InviteUsersModal.vue`                      | `workspace-directory`     |
| `frontend/src/components/LeaveServerConfirmModal.vue`               | `workspace-directory`     |
| `frontend/src/components/LimitedGifImg.vue`                         | `voice-media`             |
| `frontend/src/components/LoginRegisterModal.vue`                    | `account-identity`        |
| `frontend/src/components/MemberList.vue`                            | `workspace-directory`     |
| `frontend/src/components/MemberProfilePopout.vue`                   | `platform-shell`          |
| `frontend/src/components/MessageRequestsView.vue`                   | `social-dm`               |
| `frontend/src/components/ModerationActionModal.vue`                 | `moderation-safety`       |
| `frontend/src/components/MoreServersPanel.vue`                      | `workspace-directory`     |
| `frontend/src/components/MyServersPanel.vue`                        | `workspace-directory`     |
| `frontend/src/components/PausedGifAvatar.vue`                       | `voice-media`             |
| `frontend/src/components/ProfileBannerMedia.vue`                    | `platform-shell`          |
| `frontend/src/components/ScreenSharePickerModal.vue`                | `voice-media`             |
| `frontend/src/components/SelfProfilePopout.vue`                     | `platform-shell`          |
| `frontend/src/components/ServerBannerLimitedGif.vue`                | `workspace-directory`     |
| `frontend/src/components/ServerList.vue`                            | `workspace-directory`     |
| `frontend/src/components/ServerNotificationSettingsModal.vue`       | `notifications-attention` |
| `frontend/src/components/ServerSettingsModal.vue`                   | `permissions-roles`       |
| `frontend/src/components/SettingsModal.vue`                         | `settings-appearance`     |
| `frontend/src/components/StatusIndicator.vue`                       | `workspace-directory`     |
| `frontend/src/components/StreamVideoTile.vue`                       | `voice-media`             |
| `frontend/src/components/TwemojiText.vue`                           | `foundation`              |
| `frontend/src/components/UserProfileMoreMenu.vue`                   | `platform-shell`          |
| `frontend/src/components/VideoTrackRenderer.vue`                    | `voice-media`             |
| `frontend/src/components/chat/AttachPopout.vue`                     | `voice-media`             |
| `frontend/src/components/chat/ChannelAutocompletePopover.vue`       | `messaging`               |
| `frontend/src/components/chat/ChatInput.vue`                        | `messaging`               |
| `frontend/src/components/chat/ChatInviteEmbed.vue`                  | `workspace-directory`     |
| `frontend/src/components/chat/ChatMediaUploadOverlay.vue`           | `voice-media`             |
| `frontend/src/components/chat/ChatTypingIndicator.vue`              | `messaging`               |
| `frontend/src/components/chat/ChatView.vue`                         | `messaging`               |
| `frontend/src/components/chat/EmojiAutocompletePopover.vue`         | `voice-media`             |
| `frontend/src/components/chat/EmojiPopout.vue`                      | `voice-media`             |
| `frontend/src/components/chat/GifImage.vue`                         | `voice-media`             |
| `frontend/src/components/chat/GifPopout.vue`                        | `voice-media`             |
| `frontend/src/components/chat/ImageViewerModal.vue`                 | `messaging`               |
| `frontend/src/components/chat/MentionAutocompletePopover.vue`       | `messaging`               |
| `frontend/src/components/chat/MessageActionBar.vue`                 | `messaging`               |
| `frontend/src/components/chat/MessageAttachments.vue`               | `messaging`               |
| `frontend/src/components/chat/MessageBubble.vue`                    | `messaging`               |
| `frontend/src/components/chat/MessageContentSegments.vue`           | `messaging`               |
| `frontend/src/components/chat/MessageContextMenu.vue`               | `messaging`               |
| `frontend/src/components/chat/MessageHeader.vue`                    | `messaging`               |
| `frontend/src/components/chat/MessageJumpEmbed.vue`                 | `messaging`               |
| `frontend/src/components/chat/MessageLinkEmbeds.vue`                | `messaging`               |
| `frontend/src/components/chat/MessageList.vue`                      | `messaging`               |
| `frontend/src/components/chat/MessageReactionEmojiPopover.vue`      | `messaging`               |
| `frontend/src/components/chat/MessageReactions.vue`                 | `messaging`               |
| `frontend/src/components/chat/MessageReplyPreview.vue`              | `messaging`               |
| `frontend/src/components/chat/PendingMediaPreview.vue`              | `voice-media`             |
| `frontend/src/components/chat/PollCreateModal.vue`                  | `messaging`               |
| `frontend/src/components/chat/PollDisplay.vue`                      | `messaging`               |
| `frontend/src/components/chat/PollOptionEmoji.vue`                  | `messaging`               |
| `frontend/src/components/chat/PollOptionEmojiPopover.vue`           | `messaging`               |
| `frontend/src/components/chat/SearchBar.vue`                        | `messaging`               |
| `frontend/src/components/chat/SearchMessageRow.vue`                 | `messaging`               |
| `frontend/src/components/member-profile/MemberProfileContent.vue`   | `platform-shell`          |
| `frontend/src/components/member-profile/MemberProfileHeader.vue`    | `platform-shell`          |
| `frontend/src/components/member-profile/MemberProfileRolePanel.vue` | `platform-shell`          |

---

## Vue SFC inventory — `frontend/src/features/` (tracked)

All `.vue` files inherit their folder domain from **Feature modules** except:

| Path                                                                                          | Domain                    |
| --------------------------------------------------------------------------------------------- | ------------------------- |
| `frontend/src/features/channel-panel/components/ChannelPanelContextMenu.vue`                  | `workspace-directory`     |
| `frontend/src/features/channel-panel/components/ChannelPanelHeader.vue`                       | `workspace-directory`     |
| `frontend/src/features/channel-panel/components/ChannelPanelList.vue`                         | `workspace-directory`     |
| `frontend/src/features/channel-panel/components/ChannelPanelVoicePanel.vue`                   | `workspace-directory`     |
| `frontend/src/features/channel-panel/components/ChannelPanelVoiceParticipant.vue`             | `workspace-directory`     |
| `frontend/src/features/channel-panel/components/VcCameraSetupModal.vue`                       | `voice-media`             |
| `frontend/src/features/channel-settings/components/PermissionOverwriteEditor.vue`             | `permissions-roles`       |
| `frontend/src/features/chat/components/ChatInputComposerBar.vue`                              | `messaging`               |
| `frontend/src/features/chat/components/ChatInputMarkdownPreview.vue`                          | `messaging`               |
| `frontend/src/features/chat/components/DiscordChannelImportWidget.vue`                        | `discord-bridge`          |
| `frontend/src/features/chat/components/ForwardMessageModal.vue`                               | `messaging`               |
| `frontend/src/features/chat/components/MessageBubbleInnerBody.vue`                            | `messaging`               |
| `frontend/src/features/chat/components/MessageReactionsRow.vue`                               | `messaging`               |
| `frontend/src/features/layout/components/AppLayoutChatHeader.vue`                             | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutChatSurface.vue`                            | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutDmSection.vue`                              | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutDmSidePanel.vue`                            | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutGuildModals.vue`                            | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutInfoBanners.vue`                            | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutLeftChrome.vue`                             | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutMembersColumn.vue`                          | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutModals.vue`                                 | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutPinsDropdown.vue`                           | `platform-shell`          |
| `frontend/src/features/layout/components/AppLayoutVoiceSection.vue`                           | `platform-shell`          |
| `frontend/src/features/layout/components/WelcomeBackExploreGate.vue`                          | `account-identity`        |
| `frontend/src/features/layout/components/server-rail/DmIncomingRailCluster.vue`               | `platform-shell`          |
| `frontend/src/features/layout/components/server-rail/EchoRailCorner.vue`                      | `platform-shell`          |
| `frontend/src/features/layout/components/server-rail/RailProfileBar.vue`                      | `platform-shell`          |
| `frontend/src/features/layout/components/server-rail/ServerRailCenterColumn.vue`              | `platform-shell`          |
| `frontend/src/features/layout/components/server-rail/ServerRailContextMenu.vue`               | `platform-shell`          |
| `frontend/src/features/layout/components/server-rail/ServerRailServerIcons.vue`               | `platform-shell`          |
| `frontend/src/features/server-settings/components/EmojiPackTagsField.vue`                     | `permissions-roles`       |
| `frontend/src/features/server-settings/components/PermissionDiff.vue`                         | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsAuditLogSection.vue`          | `moderation-safety`       |
| `frontend/src/features/server-settings/components/ServerSettingsBansSection.vue`              | `moderation-safety`       |
| `frontend/src/features/server-settings/components/ServerSettingsDangerZoneSection.vue`        | `workspace-directory`     |
| `frontend/src/features/server-settings/components/ServerSettingsDiscordSection.vue`           | `discord-bridge`          |
| `frontend/src/features/server-settings/components/ServerSettingsEmojiSection.vue`             | `voice-media`             |
| `frontend/src/features/server-settings/components/ServerSettingsHeader.vue`                   | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsMembersSection.vue`           | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsModerationSection.vue`        | `moderation-safety`       |
| `frontend/src/features/server-settings/components/ServerSettingsOverviewSection.vue`          | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsPermissionPreviewSection.vue` | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsRolesSection.vue`             | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsSecuritySection.vue`          | `permissions-roles`       |
| `frontend/src/features/server-settings/components/ServerSettingsSidebar.vue`                  | `permissions-roles`       |
| `frontend/src/features/settings/components/GuestAccountUpgradePanel.vue`                      | `account-identity`        |
| `frontend/src/features/settings/components/SettingsAccount.vue`                               | `account-identity`        |
| `frontend/src/features/settings/components/SettingsAppearance.vue`                            | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsDiscordLinkSection.vue`                    | `discord-bridge`          |
| `frontend/src/features/settings/components/SettingsFormattingGuide.vue`                       | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsFriends.vue`                               | `social-dm`               |
| `frontend/src/features/settings/components/SettingsLegal.vue`                                 | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsNotifications.vue`                         | `notifications-attention` |
| `frontend/src/features/settings/components/SettingsProfile.vue`                               | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsSounds.vue`                                | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsSupplementarySections.vue`                 | `settings-appearance`     |
| `frontend/src/features/settings/components/SettingsVoiceVideo.vue`                            | `voice-media`             |

---

## Views (`frontend/src/views/`)

| Path                                        | Domain             |
| ------------------------------------------- | ------------------ |
| `frontend/src/views/ForgotPasswordView.vue` | `account-identity` |
| `frontend/src/views/ResetPasswordView.vue`  | `account-identity` |

---

## Backend API routes (`backend/src/api/routes/`)

| Path                                                      | Domain                |
| --------------------------------------------------------- | --------------------- |
| `backend/src/api/errors.ts`                               | `foundation`          |
| `backend/src/api/routes/index.ts`                         | `foundation`          |
| `backend/src/api/routes/auth.ts`                          | `account-identity`    |
| `backend/src/api/routes/auth/2fa.ts`                      | `account-identity`    |
| `backend/src/api/routes/auth/guest.ts`                    | `account-identity`    |
| `backend/src/api/routes/auth/login.ts`                    | `account-identity`    |
| `backend/src/api/routes/auth/me.ts`                       | `account-identity`    |
| `backend/src/api/routes/auth/password.ts`                 | `account-identity`    |
| `backend/src/api/routes/auth/register.ts`                 | `account-identity`    |
| `backend/src/api/routes/auth/session.ts`                  | `account-identity`    |
| `backend/src/api/routes/analytics.ts`                     | `observability`       |
| `backend/src/api/routes/devDiagnostics.ts`                | `observability`       |
| `backend/src/api/routes/discordBotHook.ts`                | `discord-bridge`      |
| `backend/src/api/routes/discordOAuth.ts`                  | `discord-bridge`      |
| `backend/src/api/routes/echo.ts`                          | `foundation`          |
| `backend/src/api/routes/echo/echoBugReports.ts`           | `observability`       |
| `backend/src/api/routes/echo/echoCategories.ts`           | `workspace-directory` |
| `backend/src/api/routes/echo/echoChannels.ts`             | `workspace-directory` |
| `backend/src/api/routes/echo/echoDiscordImport.ts`        | `discord-bridge`      |
| `backend/src/api/routes/echo/echoDm.ts`                   | `social-dm`           |
| `backend/src/api/routes/echo/echoEmojiLibrary.ts`         | `voice-media`         |
| `backend/src/api/routes/echo/echoGuestWriteHook.ts`       | `account-identity`    |
| `backend/src/api/routes/echo/echoInvites.ts`              | `workspace-directory` |
| `backend/src/api/routes/echo/echoMessageSearch.ts`        | `messaging`           |
| `backend/src/api/routes/echo/echoMessages.ts`             | `messaging`           |
| `backend/src/api/routes/echo/echoModeration.ts`           | `moderation-safety`   |
| `backend/src/api/routes/echo/echoPermissionOverwrites.ts` | `permissions-roles`   |
| `backend/src/api/routes/echo/echoPublic.ts`               | `workspace-directory` |
| `backend/src/api/routes/echo/echoRoles.ts`                | `permissions-roles`   |
| `backend/src/api/routes/echo/echoRouteUtils.ts`           | `foundation`          |
| `backend/src/api/routes/echo/echoSafety.ts`               | `moderation-safety`   |
| `backend/src/api/routes/echo/echoServerScoped.ts`         | `permissions-roles`   |
| `backend/src/api/routes/echo/echoServers.ts`              | `workspace-directory` |
| `backend/src/api/routes/echo/echoSocial.ts`               | `social-dm`           |
| `backend/src/api/routes/echo/echoUploads.ts`              | `voice-media`         |
| `backend/src/api/routes/echo/echoVoice.ts`                | `voice-media`         |
| `backend/src/api/routes/giphy.ts`                         | `voice-media`         |
| `backend/src/api/routes/googleOAuth.ts`                   | `account-identity`    |
| `backend/src/api/routes/health.ts`                        | `foundation`          |
| `backend/src/api/routes/livekitWebhook.ts`                | `voice-media`         |
| `backend/src/api/routes/meDiscord.ts`                     | `discord-bridge`      |
| `backend/src/api/routes/meGoogle.ts`                      | `account-identity`    |
| `backend/src/api/routes/passkeyRoutes.ts`                 | `account-identity`    |

---

## Backend domain (`backend/src/domain/`)

### `echoStore/` modules

| Path                                                            | Domain                    |
| --------------------------------------------------------------- | ------------------------- |
| `backend/src/domain/echoStore/access.ts`                        | `permissions-roles`       |
| `backend/src/domain/echoStore/attention.ts`                     | `notifications-attention` |
| `backend/src/domain/echoStore/auditLog.ts`                      | `moderation-safety`       |
| `backend/src/domain/echoStore/blocks.ts`                        | `social-dm`               |
| `backend/src/domain/echoStore/bootstrap.ts`                     | `workspace-directory`     |
| `backend/src/domain/echoStore/bugHunterReports.ts`              | `observability`           |
| `backend/src/domain/echoStore/categoriesWorkspace.ts`           | `workspace-directory`     |
| `backend/src/domain/echoStore/channelAudit.ts`                  | `moderation-safety`       |
| `backend/src/domain/echoStore/channelPinsPersistence.ts`        | `messaging`               |
| `backend/src/domain/echoStore/channelReadState.ts`              | `messaging`               |
| `backend/src/domain/echoStore/channelTreeMove.ts`               | `workspace-directory`     |
| `backend/src/domain/echoStore/constants.ts`                     | `foundation`              |
| `backend/src/domain/echoStore/dmThreads.ts`                     | `social-dm`               |
| `backend/src/domain/echoStore/emojiLibrary.ts`                  | `voice-media`             |
| `backend/src/domain/echoStore/guestOnboarding.ts`               | `account-identity`        |
| `backend/src/domain/echoStore/index.ts`                         | `foundation`              |
| `backend/src/domain/echoStore/invites.ts`                       | `workspace-directory`     |
| `backend/src/domain/echoStore/messageExports.ts`                | `messaging`               |
| `backend/src/domain/echoStore/messageOps.ts`                    | `messaging`               |
| `backend/src/domain/echoStore/messageReactionPersistence.ts`    | `messaging`               |
| `backend/src/domain/echoStore/moderation.ts`                    | `moderation-safety`       |
| `backend/src/domain/echoStore/permissionOverwrites.ts`          | `permissions-roles`       |
| `backend/src/domain/echoStore/permissions.ts`                   | `permissions-roles`       |
| `backend/src/domain/echoStore/presence.ts`                      | `workspace-directory`     |
| `backend/src/domain/echoStore/roleLinks.ts`                     | `permissions-roles`       |
| `backend/src/domain/echoStore/roles.ts`                         | `permissions-roles`       |
| `backend/src/domain/echoStore/serverNotificationPreferences.ts` | `notifications-attention` |
| `backend/src/domain/echoStore/serverSpamFilter.ts`              | `moderation-safety`       |
| `backend/src/domain/echoStore/servers.ts`                       | `workspace-directory`     |
| `backend/src/domain/echoStore/social.ts`                        | `social-dm`               |
| `backend/src/domain/echoStore/userTypingProfile.ts`             | `messaging`               |
| `backend/src/domain/echoStore/voice.ts`                         | `voice-media`             |

### Other `domain/` modules

| Path                                                    | Domain              |
| ------------------------------------------------------- | ------------------- |
| `backend/src/domain/aggregateServerRoles.ts`            | `permissions-roles` |
| `backend/src/domain/contentJsonValidation.ts`           | `messaging`         |
| `backend/src/domain/discordBotExportPendingRepo.ts`     | `discord-bridge`    |
| `backend/src/domain/discordImportUsers.ts`              | `discord-bridge`    |
| `backend/src/domain/discordImportableGuilds.ts`         | `discord-bridge`    |
| `backend/src/domain/discordNormalized.ts`               | `discord-bridge`    |
| `backend/src/domain/discordOAuthRedirect.ts`            | `discord-bridge`    |
| `backend/src/domain/discordOAuthState.ts`               | `discord-bridge`    |
| `backend/src/domain/discordProfileMerge.ts`             | `discord-bridge`    |
| `backend/src/domain/discordShadowMerge.ts`              | `discord-bridge`    |
| `backend/src/domain/discordUserAccessToken.ts`          | `discord-bridge`    |
| `backend/src/domain/discordUserLinkRepo.ts`             | `discord-bridge`    |
| `backend/src/domain/echoForwardResolution.ts`           | `messaging`         |
| `backend/src/domain/echoGuestPolicy.ts`                 | `account-identity`  |
| `backend/src/domain/echoMessageLinkEmbed.ts`            | `messaging`         |
| `backend/src/domain/echoMessagePollRedaction.ts`        | `messaging`         |
| `backend/src/domain/echoMessagesDal.ts`                 | `messaging`         |
| `backend/src/domain/echoPermissionCache.ts`             | `permissions-roles` |
| `backend/src/domain/echoPermissionEvaluate.ts`          | `permissions-roles` |
| `backend/src/domain/echoPermissionPrimitives.ts`        | `permissions-roles` |
| `backend/src/domain/echoPermissionPrimitivesSparse.ts`  | `permissions-roles` |
| `backend/src/domain/echoPermissionTrace.ts`             | `permissions-roles` |
| `backend/src/domain/echoPermissions.ts`                 | `permissions-roles` |
| `backend/src/domain/echoPlanEntitlements.ts`            | `account-identity`  |
| `backend/src/domain/echoPolicy.ts`                      | `foundation`        |
| `backend/src/domain/echoPollVotesDal.ts`                | `messaging`         |
| `backend/src/domain/echoSnowflake.ts`                   | `foundation`        |
| `backend/src/domain/emailVerificationUrls.ts`           | `account-identity`  |
| `backend/src/domain/googleOAuthRedirect.ts`             | `account-identity`  |
| `backend/src/domain/googleOAuthState.ts`                | `account-identity`  |
| `backend/src/domain/googleUserLinkRepo.ts`              | `account-identity`  |
| `backend/src/services/auth/guestAbuseLimiter.ts`        | `account-identity`  |
| `backend/src/services/linkUnfurl/linkUnfurl.ts`         | `messaging`         |
| `backend/src/services/linkUnfurl/linkUnfurlFetch.ts`    | `messaging`         |
| `backend/src/services/linkUnfurl/linkUnfurlOembed.ts`   | `messaging`         |
| `backend/src/services/linkUnfurl/linkUnfurlUrlStubs.ts` | `messaging`         |
| `backend/src/domain/mergeOverrideRows.ts`               | `permissions-roles` |
| `backend/src/domain/messagePlainTextProjection.ts`      | `messaging`         |
| `backend/src/services/auth/passwordResetActions.ts`     | `account-identity`  |
| `backend/src/domain/permissionExplanation.ts`           | `permissions-roles` |
| `backend/src/domain/permissionLayers.ts`                | `permissions-roles` |
| `backend/src/domain/permissionOverwriteMerge.ts`        | `permissions-roles` |
| `backend/src/services/auth/phoneVerificationActions.ts` | `account-identity`  |
| `backend/src/domain/smsSendAbuse.ts`                    | `account-identity`  |
| `backend/src/domain/twemojiAssetUrl.ts`                 | `foundation`        |

---

## Backend services (`backend/src/services/`)

| Path                                                    | Domain                    |
| ------------------------------------------------------- | ------------------------- |
| `backend/src/services/auth/emailVerificationActions.ts` | `account-identity`        |
| `backend/src/services/discordImport.ts`                 | `discord-bridge`          |
| `backend/src/services/discordImportQuota.ts`            | `discord-bridge`          |
| `backend/src/services/discordMessageImport.ts`          | `discord-bridge`          |
| `backend/src/services/echoAttentionRealtime.ts`         | `notifications-attention` |
| `backend/src/services/echoPersistedMessageCreate.ts`    | `messaging`               |
| `backend/src/services/echoUploadDedupe.ts`              | `voice-media`             |
| `backend/src/services/echoUploadKeyUtils.ts`            | `voice-media`             |
| `backend/src/services/echoUploadResolveDest.ts`         | `voice-media`             |
| `backend/src/services/echoVideoOptimizeProcessor.ts`    | `voice-media`             |
| `backend/src/services/echoVideoOptimizeQueue.ts`        | `voice-media`             |
| `backend/src/services/integrations/discordApiClient.ts` | `discord-bridge`          |
| `backend/src/services/integrations/googleApiClient.ts`  | `account-identity`        |
| `backend/src/services/integrations/turnstileVerify.ts`  | `account-identity`        |
| `backend/src/services/email/passwordResetTemplates.ts`  | `account-identity`        |
| `backend/src/services/email/sendMail.ts`                | `account-identity`        |
| `backend/src/services/email/verificationTemplates.ts`   | `account-identity`        |
| `backend/src/services/livekit/livekitAdapter.ts`        | `voice-media`             |
| `backend/src/services/localUploadDisk.ts`               | `voice-media`             |
| `backend/src/services/localUploadToken.ts`              | `voice-media`             |
| `backend/src/services/mediaUrlPolicy.ts`                | `voice-media`             |
| `backend/src/services/s3UploadPresign.ts`               | `voice-media`             |
| `backend/src/services/sms/otpMessage.ts`                | `account-identity`        |
| `backend/src/services/sms/sendSms.ts`                   | `account-identity`        |
| `backend/src/services/storedMediaUrl.ts`                | `voice-media`             |

---

## Backend auth (`backend/src/auth/`)

| Path                                                   | Domain             |
| ------------------------------------------------------ | ------------------ |
| `backend/src/auth/csrf.ts`                             | `account-identity` |
| `backend/src/auth/defaultAvatarPfp.ts`                 | `account-identity` |
| `backend/src/auth/discordTokenCrypto.ts`               | `discord-bridge`   |
| `backend/src/auth/email.ts`                            | `account-identity` |
| `backend/src/auth/guestDisplayNames.ts`                | `account-identity` |
| `backend/src/auth/issueBrowserSession.ts`              | `account-identity` |
| `backend/src/auth/loginAudit.ts`                       | `account-identity` |
| `backend/src/auth/middleware.ts`                       | `account-identity` |
| `backend/src/auth/phoneE164.ts`                        | `account-identity` |
| `backend/src/auth/recoveryCodes.ts`                    | `account-identity` |
| `backend/src/auth/serverSession.ts`                    | `account-identity` |
| `backend/src/auth/sessionCookies.ts`                   | `account-identity` |
| `backend/src/auth/smsOtpHmac.ts`                       | `account-identity` |
| `backend/src/auth/store.ts`                            | `account-identity` |
| `backend/src/auth/token.ts`                            | `account-identity` |
| `backend/src/auth/totpCrypto.ts`                       | `account-identity` |
| `backend/src/auth/totpVerify.ts`                       | `account-identity` |
| `backend/src/auth/types.ts`                            | `account-identity` |
| `backend/src/auth/webauthnChallenge.ts`                | `account-identity` |
| `backend/src/auth/store/helpers.ts`                    | `account-identity` |
| `backend/src/auth/store/index.ts`                      | `account-identity` |
| `backend/src/auth/store/types.ts`                      | `account-identity` |
| `backend/src/auth/store/memory/MemoryAuthStore.ts`     | `account-identity` |
| `backend/src/auth/store/postgres/PostgresAuthStore.ts` | `account-identity` |

---

## Backend DB (`backend/src/db/`)

| Path                                | Domain       |
| ----------------------------------- | ------------ |
| `backend/src/db/authTables.ts`      | `foundation` |
| `backend/src/db/echoTables.ts`      | `foundation` |
| `backend/src/db/ensureAppSchema.ts` | `foundation` |
| `backend/src/db/index.ts`           | `foundation` |
| `backend/src/db/nats.ts`            | `foundation` |
| `backend/src/db/pg.ts`              | `foundation` |
| `backend/src/db/pgErrors.ts`        | `foundation` |

---

## Backend bootstrap (`backend/src/bootstrap/`)

| Path                                              | Domain               |
| ------------------------------------------------- | -------------------- |
| `backend/src/bootstrap/createFastify.ts`          | `foundation`         |
| `backend/src/bootstrap/echoHttpObservability.ts`  | `observability`      |
| `backend/src/bootstrap/echoReadRateLimitPaths.ts` | `foundation`         |
| `backend/src/bootstrap/httpPlugins.ts`            | `foundation`         |
| `backend/src/bootstrap/socket.ts`                 | `realtime-transport` |
| `backend/src/bootstrap/startServer.ts`            | `foundation`         |

---

## Backend sockets (`backend/src/sockets/`)

| Path                                              | Domain                |
| ------------------------------------------------- | --------------------- |
| `backend/src/sockets/channelBroadcast.ts`         | `realtime-transport`  |
| `backend/src/sockets/channelHandlers.ts`          | `realtime-transport`  |
| `backend/src/sockets/chatMessageHandler.ts`       | `messaging`           |
| `backend/src/sockets/dmCallSignalHandler.ts`      | `social-dm`           |
| `backend/src/sockets/echoLinkEmbeds.ts`           | `messaging`           |
| `backend/src/sockets/echoMessageFlow.ts`          | `messaging`           |
| `backend/src/sockets/eventMiddleware.ts`          | `realtime-transport`  |
| `backend/src/sockets/handlers.ts`                 | `realtime-transport`  |
| `backend/src/sockets/messageEditDeleteHandler.ts` | `messaging`           |
| `backend/src/sockets/messagePinHandler.ts`        | `messaging`           |
| `backend/src/sockets/messageRateLimiter.ts`       | `messaging`           |
| `backend/src/sockets/messageReactionHandler.ts`   | `messaging`           |
| `backend/src/sockets/messageValidation.ts`        | `messaging`           |
| `backend/src/sockets/parseCookieHeader.ts`        | `foundation`          |
| `backend/src/sockets/pollVoteHandler.ts`          | `messaging`           |
| `backend/src/sockets/presenceHandler.ts`          | `workspace-directory` |
| `backend/src/sockets/presenceSocketRegistry.ts`   | `workspace-directory` |
| `backend/src/sockets/resolveSocketIdentity.ts`    | `account-identity`    |
| `backend/src/sockets/typingHandler.ts`            | `messaging`           |

---

## Backend observability (`backend/src/observability/`)

| Path                                              | Domain          |
| ------------------------------------------------- | --------------- |
| `backend/src/observability/echoMetrics.ts`        | `observability` |
| `backend/src/observability/otel.ts`               | `observability` |
| `backend/src/observability/sessionDiagnostics.ts` | `observability` |
| `backend/src/observability/voiceTraceLog.ts`      | `voice-media`   |

---

## Backend config, jobs, scripts, tests, constants

| Path                                               | Domain                |
| -------------------------------------------------- | --------------------- |
| `backend/src/config.ts`                            | `foundation`          |
| `backend/src/constants/outboundHttp.ts`            | `foundation`          |
| `backend/src/jobs/loginEventsRetention.ts`         | `account-identity`    |
| `backend/src/jobs/presenceSweep.ts`                | `workspace-directory` |
| `backend/src/jobs/videoUploadOptimize.ts`          | `voice-media`         |
| `backend/src/scripts/backfillDefaultAvatarPfp.ts`  | `foundation`          |
| `backend/src/scripts/migrateEchoIdsToSnowflake.ts` | `foundation`          |
| `backend/src/scripts/softDeleteStaleGuests.ts`     | `foundation`          |
| `backend/src/scripts/wipeAppDatabase.ts`           | `foundation`          |

**Rule:** Every tracked file under `backend/src/tests/` (including `helpers/` and `fixtures/`) is `**foundation`\*\* (shared test harness and fixtures). Product meaning is enforced by what they import, not a second domain owner.

---

## Shared package (`shared/`)

| Path                             | Domain       |
| -------------------------------- | ------------ |
| `shared/types/api.ts`            | `foundation` |
| `shared/types/channel.ts`        | `foundation` |
| `shared/types/domains/api.ts`    | `foundation` |
| `shared/types/domains/auth.ts`   | `foundation` |
| `shared/types/domains/chat.ts`   | `foundation` |
| `shared/types/domains/server.ts` | `foundation` |
| `shared/types/domains/socket.ts` | `foundation` |
| `shared/types/index.ts`          | `foundation` |
| `shared/types/message.ts`        | `foundation` |
| `shared/types/pollRedaction.ts`  | `foundation` |
| `shared/types/server.ts`         | `foundation` |
| `shared/types/socket.ts`         | `foundation` |
| `shared/types/user.ts`           | `foundation` |

---

## Bot (`bot/src/`)

| Path                                             | Domain             |
| ------------------------------------------------ | ------------------ |
| `bot/src/exporter/assets.ts`                     | `integrations-bot` |
| `bot/src/exporter/channelSerialize.ts`           | `integrations-bot` |
| `bot/src/exporter/effectivePermissionsSample.ts` | `integrations-bot` |
| `bot/src/exporter/messages.ts`                   | `integrations-bot` |
| `bot/src/exporter/phaseGuild.ts`                 | `integrations-bot` |
| `bot/src/exporter/phaseMembers.ts`               | `integrations-bot` |
| `bot/src/exporter/phaseOptional.ts`              | `integrations-bot` |
| `bot/src/exporter/runFullExport.ts`              | `integrations-bot` |
| `bot/src/util/fs.ts`                             | `integrations-bot` |
| `bot/src/util/rateLimitQueue.ts`                 | `integrations-bot` |

---

## Maintenance

- Regenerate inventories when needed: `git ls-files <path>` and reconcile rows.
- When a domain feels overloaded, **split the domain** (new slug + charter) rather than assigning informal secondary owners.

_Last updated: 2026-04-10._
