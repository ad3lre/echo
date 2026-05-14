# Echo `api/echo/*` — normalization inventory

Charter reference: [agents.md](../overview/agents.md); leak goals **row 15** (Echo HTTP boundary), **row 16** ([major payload contract checks](./echoApiMajorPayloadContractChecks.md)), and **row 53** (inventory completeness) in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

**Pattern labels**

| Pattern           | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `passthrough`     | Typed `echoFetch` returning API-shaped DTOs; no manual row loops.                             |
| `void_command`    | POST/PATCH/DELETE; response ignored or empty.                                                 |
| `request_body`    | `Record<string, unknown>` used only to build JSON **request** bodies.                         |
| `shared_bridge`   | Maps through `@shared/*` (e.g. role permission bridge); not ad-hoc domain semantics in `api`. |
| `boundary_parse`  | Small `unknown` → typed parse at the HTTP trust boundary (documented).                        |
| `layout_merge`    | Channel/category **layout** composition (distinct from raw JSON soup).                        |
| `domain:migrated` | Response normalization lives in `frontend/src/services/domain/*`; `api` = fetch + delegate.   |

**Workspace (reference split):** [workspace.ts](../../frontend/src/api/echo/workspace.ts) delegates snapshot assembly to [workspaceEchoApiSnapshot.ts](../../frontend/src/services/domain/workspaceEchoApiSnapshot.ts).

---

## [attention.ts](../../frontend/src/api/echo/attention.ts)

| Function                                | Pattern      | Disposition | Notes                            |
| --------------------------------------- | ------------ | ----------- | -------------------------------- |
| `fetchEchoAttentionSummary`             | passthrough  | keep        | Server DTO matches client types. |
| `fetchEchoServerNotificationPreference` | passthrough  | keep        |                                  |
| `putEchoServerNotificationPreference`   | void_command | keep        | `Record` on request only.        |

## [bugReports.ts](../../frontend/src/api/echo/bugReports.ts)

| Function            | Pattern     | Disposition | Notes |
| ------------------- | ----------- | ----------- | ----- |
| `postEchoBugReport` | passthrough | keep        |       |

## [categories.ts](../../frontend/src/api/echo/categories.ts)

| Function                    | Pattern      | Disposition | Notes |
| --------------------------- | ------------ | ----------- | ----- |
| `fetchEchoServerCategories` | passthrough  | keep        |       |
| `postEchoServerCategory`    | passthrough  | keep        |       |
| `patchEchoServerCategory`   | void_command | keep        |       |
| `deleteEchoServerCategory`  | void_command | keep        |       |

## [channels.ts](../../frontend/src/api/echo/channels.ts)

| Function                                                                                                        | Pattern                    | Disposition | Notes                                                                  |
| --------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------- | ---------------------------------------------------------------------- |
| `fetchEchoServerChannels`                                                                                       | passthrough                | keep        |                                                                        |
| `patchEchoChannel` / deletes                                                                                    | void_command / passthrough | keep        |                                                                        |
| `echoChannelRowToChannelSummary`                                                                                | layout_merge               | keep in api | Maps known `EchoChannelRow` → UI `ChannelSummary`; not unbounded JSON. |
| `mergeEchoChannelCategoriesWithRoots` / `groupEchoChannelsToCategories` / `buildEchoChannelCategoriesForServer` | layout_merge               | keep in api | Category tree merge; follow-up epic if moved to view-model.            |

## [discordImport.ts](../../frontend/src/api/echo/discordImport.ts)

| Function                                             | Pattern                    | Disposition | Notes |
| ---------------------------------------------------- | -------------------------- | ----------- | ----- |
| `fetchEchoDiscordImportState`                        | passthrough                | keep        |       |
| `postEchoDiscordImportStep` / `RunFull` / `Messages` | passthrough + request_body | keep        |       |
| `postEchoDiscordImportBind`                          | void_command               | keep        |       |

## [emoji.ts](../../frontend/src/api/echo/emoji.ts)

| Function                                                    | Pattern                    | Disposition                                                                                           | Notes |
| ----------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| `fetchEchoEmojiMarketPacks`                                 | domain:migrated            | [echoEmojiMarketPacksFromHttp.ts](../../frontend/src/services/domain/echoEmojiMarketPacksFromHttp.ts) |       |
| `fetchEchoServerEmojiLibrary` / `fetchEchoUserEmojiLibrary` | passthrough                | keep                                                                                                  |       |
| Pack CRUD / usage                                           | void_command / passthrough | keep                                                                                                  |       |

## [guild.ts](../../frontend/src/api/echo/guild.ts)

| Function   | Pattern | Disposition | Notes                                                                |
| ---------- | ------- | ----------- | -------------------------------------------------------------------- |
| _(barrel)_ | —       | keep        | Re-exports child modules in this inventory only; no HTTP of its own. |

## [invitesAndDirectory.ts](../../frontend/src/api/echo/invitesAndDirectory.ts)

| Function                                                      | Pattern         | Disposition                                                                                                 | Notes                                                   |
| ------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `postEchoJoinWithInviteToken` / `postEchoJoinDirectoryServer` | passthrough     | keep                                                                                                        | Light `String`/`Boolean` coalesce on small join result. |
| `fetchEchoServerInviteLink` / `postEchoServerInvite`          | passthrough     | keep                                                                                                        |                                                         |
| `fetchEchoInvitePreview`                                      | domain:migrated | [echoInvitesAndDirectoryFromHttp.ts](../../frontend/src/services/domain/echoInvitesAndDirectoryFromHttp.ts) |                                                         |
| `fetchEchoDirectoryServers`                                   | domain:migrated | same                                                                                                        |                                                         |

## [messages.ts](../../frontend/src/api/echo/messages.ts)

| Function                              | Pattern                   | Disposition | Notes                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channel message CRUD + search fetches | boundary_parse (envelope) | keep        | **Row 16:** list/single/post/search responses validated for required keys (`messages`, `message`, `messageIds`, `lastReadMessageId`, `idempotentReplay`) in [`messages.ts`](../../frontend/src/api/echo/messages.ts); **row 30** maps message bodies in [`echoMessageSnapshots.ts`](../../frontend/src/services/domain/echoMessageSnapshots.ts). |

## [moderation.ts](../../frontend/src/api/echo/moderation.ts)

| Function                                    | Pattern     | Disposition | Notes |
| ------------------------------------------- | ----------- | ----------- | ----- |
| `fetchEchoAuditLog` / `fetchEchoServerBans` | passthrough | keep        |       |

## [permissions.ts](../../frontend/src/api/echo/permissions.ts)

| Function                                                 | Pattern            | Disposition | Notes                                      |
| -------------------------------------------------------- | ------------------ | ----------- | ------------------------------------------ |
| Overwrite fetch `.map` + `echoPartialToChannelOverrides` | shared_bridge      | keep        | Logic from `@shared/rolePermissionBridge`. |
| Explain / role CRUD                                      | passthrough / void | keep        |                                            |

## [serverAdmin.ts](../../frontend/src/api/echo/serverAdmin.ts)

| Function                                  | Pattern      | Disposition | Notes |
| ----------------------------------------- | ------------ | ----------- | ----- |
| Moderation / nickname / transfer / delete | void_command | keep        |       |

## [serverLifecycle.ts](../../frontend/src/api/echo/serverLifecycle.ts)

| Function                                          | Pattern     | Disposition | Notes |
| ------------------------------------------------- | ----------- | ----------- | ----- |
| `createEchoServer` / `fetchEchoServers` / members | passthrough | keep        |       |

## [social.ts](../../frontend/src/api/echo/social.ts)

| Function                   | Pattern                    | Disposition                                                                             | Notes                                              |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `fetchEchoDmThreads`       | domain:migrated            | [echoDmThreadsFromHttp.ts](../../frontend/src/services/domain/echoDmThreadsFromHttp.ts) |                                                    |
| `fetchEchoPresenceBatch`   | passthrough + filter       | keep                                                                                    | Chunking + status allowlist; transport-shaped map. |
| Friends / blocks / DM open | passthrough / void_command | keep                                                                                    |                                                    |

## [uploads.ts](../../frontend/src/api/echo/uploads.ts)

| Function             | Pattern                        | Disposition | Notes                                              |
| -------------------- | ------------------------------ | ----------- | -------------------------------------------------- |
| Presign + PUT upload | boundary_parse / orchestration | keep in api | Upload URL + browser PUT; not Echo JSON row lists. |

## [voice.ts](../../frontend/src/api/echo/voice.ts)

| Function                             | Pattern            | Disposition | Notes                                                     |
| ------------------------------------ | ------------------ | ----------- | --------------------------------------------------------- |
| `parseEchoLiveKitSessionResponse`    | boundary_parse     | keep        | Explicit `unknown` → typed session; documented in module. |
| Join/leave/participants/LiveKit POST | passthrough / void | keep        |                                                           |

## [workspace.ts](../../frontend/src/api/echo/workspace.ts)

| Function             | Pattern | Disposition                                                                                   | Notes                             |
| -------------------- | ------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| `fetchEchoWorkspace` | domain  | [workspaceEchoApiSnapshot.ts](../../frontend/src/services/domain/workspaceEchoApiSnapshot.ts) | Thin fetch + validate + delegate. |

---

## Row 15 — Echo HTTP boundary (charter)

**Target:** mirror [`workspace.ts`](../../frontend/src/api/echo/workspace.ts): **validate** response shape at the `api/echo/*` trust boundary where needed; **delegate** response shaping that encodes product meaning to `services/domain/*`.

**Status (100% for row 15):** Every non-infrastructure `api/echo/*.ts` surface is listed in this file with a disposition. Modules that perform semantic normalization on Echo JSON use an explicit `domain:migrated` path (or the same pattern as workspace: thin fetch + validate + delegate). Remaining modules are `passthrough`, `void_command`, `layout_merge`, `shared_bridge`, or `boundary_parse` as documented — not ad-hoc “JSON soup” merge in API for DTOs that should be domain-owned. Further tightening (e.g. moving layout_merge out of `channels.ts`) is optional follow-up, not an open row-15 leak.

---

## Excluded from this inventory

- [transport.ts](../../frontend/src/api/echo/transport.ts) — HTTP client infrastructure.
- [types.ts](../../frontend/src/api/echo/types.ts) — type definitions only.
- `*.test.ts` — tests.

---

## Revision

| Date       | Note                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| 2026-04-11 | Row 15: inventory marked charter-complete; `messages.ts` disposition updated post–row 30 domain migration.          |
| 2026-04-11 | Initial inventory; DM threads, invite preview, directory servers, emoji market packs migrated to `services/domain`. |
