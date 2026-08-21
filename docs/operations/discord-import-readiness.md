# Discord server import — structural readiness (Echo vs Discord)

**Scope:** This report has two layers:

1. **Structural readiness (§1–§5, §7)** — Echo’s **persisted model and evaluation logic** vs what a Discord **bot export** describes (`guild.json`, `roles.json`, `channels.json`, `overwrites.jsonl`, etc.).
2. **Runtime import pipeline (§6)** — What the backend **actually imports today** from an on-disk export bundle (`server/backend/src/services/discordImport/discordImport.ts`, `discordMessageImport.ts`, routes under `echoDiscordImport.ts`). This section is the **fact check** against code; refresh it when import behavior changes.

It **does not** cover calling Discord’s HTTP APIs from Echo (the **export bot** under `bot/` is separate).

**Runtime note (2026-03):** Production Echo assumes **Postgres + real Echo APIs** only (see `[STATUS_AND_PRODUCTION_READINESS.md](../reviews/STATUS_AND_PRODUCTION_READINESS.md)`). Import jobs target that stack; mock UI/API is **dev-only**.

**Verdict (short — model):** Echo can represent a **full guild export** for **channels, categories (ordered rows with stable IDs), roles**, and (at the schema level) **member↔role links**. For **channel/category overwrites**, Echo persists **per-target rows** (`everyone` / `role` / `member`) and merges them in `**buildEvaluationPlan`**. Legacy single-blob `permission_overrides` still **fallback\*\* when no overwrite rows exist.

**Verdict (short — shipped importer):** A **four-step** import (**metadata → roles → members → channels**) plus optional `**run-full`** is implemented. **`members.jsonl`** creates **shadow (or linked) Echo users**, updates **`discord_to_echo_user_map`**, and applies **`echo_member_roles`** from each row’s Discord role list. **Channel/category overwrites** compile **@everyone**, **mapped roles**, and **member** targets (when the Discord user id is in that map) into Echo **`partial`** rows (see §6). Member overwrites for Discord users **missing** from the map are **skipped with a warning**. Optional **per-channel message** import exists but is narrow (§6). Remaining **Discord parity** gaps: richer **message** + **attachment** import, unsupported **channel types\*\* (forum/stage/thread), and any Discord semantics not reproduced by the current allow/deny→partial fold (§3.4).

---

## 1. Readiness at a glance

| Discord concept                                | Echo support            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text channel                                   | **Yes**                 | `echo_channels.type = 'text'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Voice channel                                  | **Yes**                 | `type = 'voice'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Category                                       | **Yes**                 | `**echo_categories`**: stable `id`, `name`, `**position**`(list order). Channels reference`**category_id**`. Category permission overrides use `**(server_id, category_id)\*\*`.                                                                                                                                                                                                                                                                                                                                                                                             |
| Channel order within category                  | **Yes**                 | `echo_channels.position` scoped per `**(server_id, category_id)`\*\* on create.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Server roles (list)                            | **Yes**                 | `echo_roles`: `name`, `color`, `position`, `**hoist`\*\*, `permissions` (JSON array of strings).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| @everyone                                      | **Yes**                 | Created with new server; special name `@everyone`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Role hierarchy (ordering)                      | **Yes**                 | `position`; fold order for effective perms uses **position ASC, id ASC** (see RBAC docs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Role permissions (server-wide)                 | **Partial**             | Echo’s set is **smaller and differently named** than Discord’s (`ECHO_PERMISSIONS` / `ECHO_API_PERMISSIONS`). Import requires a **deterministic mapping**; some Discord bits have **no Echo equivalent** yet.                                                                                                                                                                                                                                                                                                                                                                |
| Role display / mentionable / hoist             | **Yes**                 | `**echo_roles.hoist`** maps to Server Settings **“Display role separately”**; `**PATCH` …`/roles/:roleId`** accepts `**name**`, `**color**`, `**hoist**`, `**permissions**`(at least one required).`**PUT` …`/roles/order**`replaces full hierarchy order (body`**roleIds**`top-to-bottom);`**@everyone**`is pinned to the **bottom** server-side. **Mentionable** remains`**MENTION_EVERYONE`** in the permission JSON. Member list (Echo servers) groups by **hoisted** roles via `**pickEchoMemberListSectionRole`**, with a shared **Members\*\* bucket when none apply. |
| Member ↔ role assignments                      | **Yes**                 | `echo_member_roles`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Per-channel permission overwrites per role** | **Yes (Echo merge)**    | Rows per channel/category with `target_type` `everyone`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `role`                                                       | `member` and JSONB `**partial`**. `**buildEvaluationPlan**` keeps everyone + the member’s roles + optional **member** row, orders them, then `**mergeOverrideRows`**. REST: `**GET`/`PUT` …`/permission-overwrites**`. **Not** Discord-identical allow/deny at runtime unless you compile imports or add allow/deny storage. |
| Per-member channel overwrites                  | **Yes (Echo merge)**    | `**target_type = 'member'`** with `**target_id = userId\*\*`; merged last among applicable rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Forum / stage / announcement / thread channels | **No** (as first-class) | Echo channel type union is effectively \*\*text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | voice\*\* in shared types; no forum/stage/thread tree in DB. |
| Slowmode, user limit, bitrate, NSFW            | **Yes (Echo)**          | `**echo_channels`**: `**slowmode_seconds**`, `**user_limit**`(voice join cap),`**bitrate_bps**`(voice; UI slider, transport TBD),`**nsfw**`. `**PATCH` `/channels/:id**`persists settings; slowmode enforced in`**chatMessageHandler**` (`SLOWMODE`); voice cap in `**joinEchoVoiceChannel\*\*` (`CHANNEL_FULL`).                                                                                                                                                                                                                                                            |
| **Automated import from bot `exports/` tree**  | **Partial (shipped)**   | `**discordImport`**: metadata, roles, **`members.jsonl`**, channels, **@everyone + role + member (mapped)** overwrites, `**run-full`**. **Not:** full message history/attachments; member overwrites for users **not** in `members.jsonl` map (§6).                                                                                                                                                                                                                                                                                                                          |

---

## 2. Channels and categories

**What Echo stores**

- `**echo_categories`**: `id`, `server_id`, `name`, `**position\*\*`, timestamps (where applicable).
- `**echo_channels**`: `id`, `server_id`, `name`, `type`, `**category_id**`, `**position**`, `**slowmode_seconds**`, `**user_limit**`, `**bitrate_bps**`, `**nsfw**`, `permission_overrides` (legacy blob when no overwrite rows), timestamps.
- `**echo_channel_permission_overwrite_rows**` / `**echo_category_permission_overwrite_rows**`: per-target `**partial**` overwrites for evaluation + `**GET`/`PUT` …`/permission-overwrites**`.

**Import mapping**

- **Categories:** create `**echo_categories`** rows with Discord’s category order reflected in `**position**`, then set each channel’s `**category_id\*\*`.
- **Channels:** map text/voice types, names, and `**position`\*\* within the parent category (same server + category scope as today).
- **Ordering:** `listEchoChannels` orders by `**echo_categories.position`**, then channel `position` — Discord category order can be preserved when `**position\*\*` is set on import.

---

## 3. Permissions — deeper dive (yes, this is the core issue)

### 3.1 What Discord does

- **Guild (server) roles** carry a permission bitset.
- **Channel (and category) overwrites** attach to **targets**: `@everyone`, a **role**, or a **member**, each with **allow** and **deny** bitmasks.
- Effective permissions for a user in a channel are computed by **composing** those overwrites in a **fixed order** (Discord’s documented algorithm), not by “one global patch for the whole server.”

### 3.2 What Echo does today

1. `**foldRolePermissions`** — fold the member’s **assigned roles\*\* (plus `@everyone` fallback) into a `Set` of Echo permission strings (Option A: ordered by role `position`, last write per bit).
2. **Category / channel override partials** — For each layer, if `**echo_*_permission_overwrite_rows`** has any rows for that channel or category, load them, **filter** to rows applicable to this user (everyone + matching role targets + member target), **sort** (`permissionOverwriteMerge.ts`), `**mergeOverrideRows`** into one `Record<string, boolean>`. If **no** rows exist, use the legacy **single** JSON blob (`echo_category_permission_overrides`/`echo_channels.permission_overrides`) as before — still one object shared by all members for that path.
3. `**applyLayerFromPartialObject`** — apply **category** then **channel** merged partials: for each key, `true` **adds** the bit, `false` **removes\*\* it (`echoPermissionPrimitives.ts`).

So the **layer** is still “final boolean writes” on top of the folded guild roles. With overwrite **rows**, the inputs to that step can differ **per member**; with **legacy-only** channels, the old “one blob, everyone” behavior remains.

### 3.3 Why a naive “translation into one JSON blob” is wrong

Example Discord setup:

- `@everyone` overwrite on `#announcements`: **deny** `SEND_MESSAGES`
- `Moderators` overwrite on `#announcements`: **allow** `SEND_MESSAGES`

A moderator **can** send; a normal member **cannot**.

If you import that into Echo’s **current** `permission_overrides` as **one** flat object `{ "SEND_MESSAGES": false }` (legacy `{ "SEND_MESSAGE": false }` is normalized to the same bit), that layer is applied **after** everyone’s role fold:

- Moderator had `SEND_MESSAGES` from guild roles → channel layer `false` → **bit removed** → **cannot** send (**incorrect**).

So the bug is not “Echo’s types are too weak”; it is that **one shared layer cannot encode different outcomes for different members**. Discord’s power is **per-target overwrites** → **per-member** effective layer.

### 3.4 Implemented mechanism + what’s left for Discord parity

- **Vocabulary:** Stored permission keys match **Discord API flag names** (`SEND_MESSAGES`, `MANAGE_GUILD`, …). Import maps Discord bitfields → those strings. Legacy Echo keys (e.g. `SEND_MESSAGE`) are still accepted and normalized when folding or saving overwrites.
- **Semantics:** `applyLayerFromPartialObject` remains the **final step**; it receives a **per-user** merged partial when overwrite **rows** are in use.
- **Mechanism (shipped):** Tables `**echo_channel_permission_overwrite_rows`** and `**echo_category_permission_overwrite_rows**`store`target_type`, `target_id`, and `**partial**`(Echo-style boolean map).`**buildEvaluationPlan**`loads rows, applies the member filter + documented order,`**mergeOverrideRows**`, then passes merged maps into `**executeEvaluationPlan**`. Legacy JSONB is used only when **no\*\* rows exist for that channel/category.
- **Discord allow/deny at runtime:** Rows today hold **Echo partials**, not separate allow/deny masks. **Importer (2026):** for each Discord overwrite row whose target is `**@everyone`**, a **mapped role**, or a **member** whose Discord user id appears in **`discord_to_echo_user_map`** (from the **`members`** step), `discordImport.ts` builds a `**partial`** via `**overwritePartialFromAllowDeny**`(deny bits then allow bits per mapped permission name; thread-only permission names are skipped). Those rows are written with`**replaceEchoCategoryPermissionOverwrites**`/`**replaceEchoChannelPermissionOverwrites**`. **Member-target** overwrites for ids **not** in the map are **skipped with a warning**. Multi-overwrite **Discord ordering** vs Echo’s merge may still differ at the edges—validate on real guilds if you need bit-exact parity.

**API note:** `**GET`/`PUT` …`/channels/:channelId/permission-overwrites`** and `**…/categories/:categoryId/permission-overwrites**`replace row sets (transactional).`**updateEchoChannelPermissionOverrides**` / category equivalent can still write a **single** everyone row or clear rows; unknown keys are dropped at validation boundaries as before. Bulk import may use `**PUT` permission-overwrites\*\* or SQL against the row tables.

### 3.5 UI / bridge gap (not the engine)

The **shared** `ChannelPermissionKey` surface is Discord-flavored, but `**channelOverridesToEchoPartial`** only maps a **small subset** into Echo API strings. Full parity work includes **wiring\*\* the rest of the keys into the same Echo permission names the evaluator uses, not inventing a second permission system.

---

## 4. Roles

**Persisted**

- `echo_roles`: `id`, `server_id`, `name`, `color`, `position`, `**hoist`\*\*, `permissions` (JSON array).

**API (current)**

- **POST** create role: `name`, `color`, `permissions`, optional `**hoist`\*\*.
- **PATCH** role: optional `**name`**, `**color**`, `**hoist**`, `**permissions\*\*` (at least one field).
- **PUT** `…/roles/order`: `**roleIds`** — full ordered list (highest role first); `**@everyone\*\*` forced last.
- **UI vs persistence:** **Mentionable** ↔ `**MENTION_EVERYONE`** (PATCH). **Display separately** ↔ `**hoist`**. **Drag reorder** ↔ **PUT order** then refresh. `**listEchoRolesForServer`** includes `**hoist**` for clients.

**Import**

- Rebuilding **roles** with **names, colors, positions, hoist flags, and mapped permission arrays** is **aligned** with the schema, subject to **permission mapping** from Discord bits → Echo strings (and handling **unmapped** bits).

---

## 5. Members

- **Membership:** `echo_server_members`.
- **Role assignment:** `echo_member_roles`.

Discord → Echo user mapping is **out of scope** for the structural comparison. At the **schema** level, assigning the same role graph is supported **once** Echo user IDs exist.

**Importer reality (§6):** The **`members`** step reads `members.jsonl`, ensures an Echo user per Discord user (shadow or linked), merges **`discord_to_echo_user_map`**, replaces **`echo_member_roles`** per row from Discord role ids via **`role_id_map`**, and sets server membership. **Message import** (`discordMessageImport.ts`) may still create additional shadow users for authors not in that file.

---

## 6. Runtime import pipeline (verified in code)

**Config:** Export trees live under `**ECHO_DISCORD_EXPORTS_ROOT`\*_ (default `bot/exports` relative to repo). Binding resolves `_{guildId}/` folder names.

**HTTP API** (`server/backend/src/api/routes/echo/discordImport.ts`):

| Method / path                                                          | Purpose                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET …/servers/:serverId/discord-import`                               | Import state + preview                                                                                        |
| `POST …/discord-import/bind`                                           | Bind server to a Discord guild id (folder discovery)                                                          |
| `POST …/servers/:serverId/discord-import/run-full`                     | `metadata` → `roles` (force) → `members` → `channels` (force) — used from “Import from Discord” server create |
| `POST …/servers/:serverId/discord-import`                              | Body `step`: `metadata`, `roles`, `members`, or `channels`; optional `force`                                  |
| `POST …/servers/:serverId/channels/:channelId/discord-import-messages` | Optional message import for **one** Echo channel                                                              |

**Service:** `server/backend/src/services/discordImport/discordImport.ts`

| Step         | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **metadata** | Guild name/description; icon/banner as inline data URLs when `asset_manifest` + files exist (`updateEchoServerPreferences`).                                                                                                                                                                                                                                                                                                                                                                                     |
| **roles**    | `roles.json`: Discord permission **bitfield → Echo string list** (`DISCORD_ECHO_PERMISSION_STRINGS` / shared map); skips **managed** roles; updates `@everyone` or merges with existing roles; `**replaceEchoServerRoleOrder`\*\*.                                                                                                                                                                                                                                                                               |
| **members**  | `members.jsonl`: Discord user → Echo user (**shadow** or **linked**), merge **`discord_to_echo_user_map`**, **`echo_member_roles`** from Discord role ids (via **`role_id_map`**). Required before **channels** (guarded in `importChannelsStep`). If the file is missing, the step completes with warnings and an **empty** map.                                                                                                                                                                                |
| **channels** | **Deletes** existing `echo_channels` + `echo_categories` for the server (then recreates). Categories + text/voice; **type 5 (GUILD_NEWS)** → Echo text + **announcement** flag; **slowmode**, **user_limit**, **bitrate**, **nsfw** from export. Unsupported Discord channel **types** skipped with warnings. **Orphan** channels get placeholder categories. Applies **`overwrites.jsonl`**: **@everyone**, **mapped roles**, **member** targets when the Discord user id is in **`discord_to_echo_user_map`**. |

**Guards:** Channel import refuses (unless `force`) if the server already has **messages** in channels (`countEchoMessagesForServerChannels`). `run-full` passes `force` so a freshly created server can replace the default layout.

**Messages:** `server/backend/src/services/discordImport/discordMessageImport.ts`

- Preconditions: **channels** step done; Echo channel **empty**; Echo channel id appears in import `**channelIdMap`\*\*.
- Calls **Discord bot** internal HTTP (`ECHO_DISCORD_BOT_INTERNAL_PORT`, `ECHO_DISCORD_BOT_WEBHOOK_SECRET`) for last **N** messages (default 90, max 100).
- Inserts rows with **Discord snowflake as Echo message id**; `**updateEchoMessageCreatedAtById`** for timestamps; **attachments not imported\*\* (comment in code).
- Authors: linked Discord account → canonical user; else **shadow user** (`echo_discord_shadow_users` + `is_discord_shadow`).

---

## 7. Conclusion

| Question                                                                           | Answer                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are **perms** the main import issue?                                               | **Yes** — specifically **channel/category overwrite semantics** (per-member composition), not “we can never be as expressive as Discord.”                                                                                                                                                                                                                                                            |
| Can we build the server **channel-for-channel** (text/voice) under **categories**? | **Largely yes** — `**echo_categories`** with `**position**`and`**category_id**`on channels; import should set`**position\*\*` to preserve Discord order.                                                                                                                                                                                                                                             |
| Can we match Discord **permission behavior**?                                      | **Per-member channel/category layers** are supported via **overwrite rows** + plan-time merge. **Not** identical to Discord’s allow/deny engine **at runtime** unless you compile imports or add allow/deny storage. **Unsafe** to flatten a whole server into **one** legacy blob per channel (§3.3 still applies for that path). Server-level role bits remain a **mapping + allowlist** exercise. |
| Can we rebuild **roles** and **assignments**?                                      | **Roles** yes via importer. **`members.jsonl`** fills **shadow/link users**, **`echo_member_roles`**, and the **import user map** used for **member** overwrites (§5–§6). **Message import** may add more shadow users for message authors.                                                                                                                                                          |

**Practical split**

- **Translation-only** into a **single** legacy `permission_overrides` blob per channel (no rows): **unsafe** for real Discord servers (see §3.3).
- **Translation + per-target rows** (`PUT` permission-overwrites or SQL) + evaluator merge: **implemented** in the product; the **automated importer** applies this for **everyone + role + member (when mapped)** overwrites and **`members.jsonl`** role assignments (§6). **Member** overwrites for users **absent** from the import map remain **skipped** until those users appear in **`members.jsonl`** (or the map is extended).
- **Discord-exact** effective permission for every user/channel may still differ where **member** overwrites matter or Discord’s multi-overwrite ordering differs from Echo merge—**validate** on representative guilds.

**Still separate from permissions:** forum/stage/thread **channel types**, full **message** + **attachment** history, and **complete** Discord member coverage when `members.jsonl` omits users (only exported members get map entries). Category **ordering** is first-class via `**echo_categories.position`\*\* (see §2); the importer sets positions from the export.

---

_Sources: `server/backend/src/db/echoTables.ts`, `server/backend/src/domain/echoStore/` (barrel `index.ts`), `server/backend/src/domain/permissions/echoPermissionEvaluate.ts`, `server/backend/src/domain/permissions/permissionOverwriteMerge.ts`, `server/backend/src/domain/permissions/mergeOverrideRows.ts`, `server/backend/src/domain/permissions/echoPermissionPrimitives.ts`, `server/backend/src/services/discordImport/discordImport.ts`, `server/backend/src/services/discordImport/discordMessageImport.ts`, `server/backend/src/api/routes/echo/discordImport.ts`, `contracts/types/channel.ts`, `contracts/discordEchoPermissions.ts`, `docs/rbac/RBAC_COMPLETENESS_REPORT.md`._
