# Discord -> Echo permission translation layer

This document explains how to build a translation layer that reproduces **Discord permission outcomes exactly** inside Echo, including channel/category overwrite edge cases.

It is intentionally stricter than "good enough import." The goal here is:

- preserve Discord's **effective outcomes** for every `(member, channel, action)`
- avoid lossy flattening during import
- define where Echo's current RBAC model is already compatible
- define what must change to achieve **flawless parity**

## Executive summary

If the requirement is **same outcomes as Discord**, then the translation layer must preserve and evaluate **Discord semantics**, not just Discord vocabulary.

That means:

1. **Do not flatten Discord into one shared legacy overwrite blob** (per-member outcomes differ; see `docs/operations/discord-import-readiness.md`).
2. **Do use per-target overwrite rows** (and correct role-base semantics) so Echo’s **single** evaluator can reproduce Discord outcomes.
3. **At import time**, you may keep a lossless **export-wide** snapshot **only while translating** (staging / audit). **Runtime is Echo only:** persisted `echo_*` tables + `evaluatePermissionSet` (or whatever the one canonical path is after any needed primitive fixes).
4. **Use a Discord-accurate reference implementation only to validate the translation** (compare reference vs Echo outcomes before the import is accepted). It is **not** an acceptable permanent second permission engine in production.

Why this matters:

- Discord **server role permissions** are effectively a **bitwise union** of assigned roles.
- Echo's current role engine is **Option A / ordered last-write-wins** for role fold behavior.
- Discord channel/category overwrites are **allow/deny pairs** with a fixed precedence:
  `@everyone` -> aggregated role overwrites -> member overwrite.
- Echo's current overwrite row storage stores **final boolean writes**, not raw allow/deny pairs.

Those are not the same model. Translation by name only will not produce parity.

## What "flawless" actually requires

To claim flawless parity, all of the following must be true:

- For every imported member and channel, Echo reaches the same answer as Discord for all supported permission bits.
- Category sync / unsynced channel behavior is preserved.
- Member-specific overwrites beat role overwrites exactly as Discord does.
- `ADMINISTRATOR` bypass behavior matches Discord.
- Unsupported Discord features are never silently approximated.
- Import-time validation proves the translated result matches a Discord reference evaluator.

If any Discord feature is unsupported in Echo's product model and is merely ignored, the result is **not** flawless. It may still be acceptable, but it is not parity.

## Current repository reality

The current codebase already gives useful building blocks:

- Stored permission strings already use Discord API names in `contracts/rolePermissionBridge.ts`.
- Echo can store overwrite rows per target in:
  - `echo_channel_permission_overwrite_rows`
  - `echo_category_permission_overwrite_rows`
- Echo already has a plan/evaluate split in `server/backend/src/domain/permissions/echoPermissionEvaluate.ts`.
- Overwrite rows already support target types:
  - `everyone`
  - `role`
  - `member`

But there are two important mismatches:

### 1. Server-level role semantics mismatch

Discord:

- Guild permission base is the union of `@everyone` plus all assigned roles.
- Role `position` matters for hierarchy and moderation constraints, not for permission union.

Echo today:

- `foldRolePermissions(...)` uses an ordered fold with last-write-wins semantics.

That means a direct import of Discord role permissions into Echo's current role fold is **not exact**.

### 2. Overwrite semantics mismatch

Discord:

- Channel/category overwrites are stored as separate `allow` and `deny` masks per target.
- Applicable role overwrites are aggregated across all member roles.
- The order is semantic, not just row order:
  - apply `@everyone` deny, then `@everyone` allow
  - aggregate all role denies, then aggregate all role allows
  - apply member deny, then member allow

Echo today:

- overwrite rows merge to one boolean partial using last-write-wins before layer apply

That is close in shape, but not natively Discord-exact unless the translation layer preserves the full Discord overwrite model first.

## Non-negotiable design rule

**Translate into Echo; do not ship a permanent parallel Discord permission stack.**

In practice:

- **Import / migration job:** read Discord (or export) → compute what each member should get → **write** `echo_roles`, `echo_member_roles`, overwrite rows, etc., and/or adjust Echo primitives once if the stored shape must change.
- **Production:** one permission system — Echo’s evaluator on Echo’s data. A Discord reference may run **only** during import validation or offline tests, not on every request forever.

## Recommended architecture

Use a two-layer model:

### Layer 1: Canonical Discord permission IR

For imported guilds, store a canonical intermediate representation with no loss:

- guild roles
  - `discord_role_id`
  - `position`
  - raw permission bitset
- member role assignments
- categories and channels
- overwrite rows
  - `scope`: `category` or `channel`
  - `target_type`: `everyone` | `role` | `member`
  - `target_id`
  - `allow_bits`
  - `deny_bits`
- sync metadata
  - whether a channel inherits/syncs category overwrites
- guild ownership and administrative metadata

This can live in dedicated import tables or in JSONB snapshots tied to Echo objects. It exists to **translate without loss** and to support audit; it is **not** a second runtime permission source once Layer 2 is committed.

### Layer 2: Write-through into Echo persistence

The translation layer’s output is **normal Echo state**: roles, member-role links, category/channel overwrite rows (and any one-time schema or primitive changes required so Echo’s merge matches Discord). After a successful import, **nothing else** should be required to evaluate permissions except Echo’s standard path.

## Discord reference evaluation (import-time only)

The following steps describe **Discord’s rules**. Use them in two places:

1. **Specification** for how the translator must populate Echo data (and for any Echo primitive changes).
2. **Validation**: a reference implementation compares “Discord truth” vs “Echo after translation” for sampled or exhaustive `(user, channel, bit)` tuples before committing the import.

They are **not** a proposal for a second production evaluator.

### Step 1: owner bypass

If the member is the guild owner, return full allow.

### Step 2: guild base permissions

Start from `@everyone` permissions, then OR in every assigned role's permissions.

If the result includes `ADMINISTRATOR`, return full allow immediately for channel permission purposes.

Important:

- this is **union**, not ordered fold
- role `position` does not affect base permission accumulation

### Step 3: apply category overwrites

If the channel has a category, apply Discord's overwrite algorithm using category rows.

### Step 4: apply channel overwrites

Apply Discord's overwrite algorithm again using channel rows.

### Step 5: post-permission policy gates

Some outcomes are not pure permission bits and must be modeled as extra policy:

- timeout restrictions
- product-level unsupported channel type fallbacks
- server ownership leave/delete constraints
- Echo-specific business rules unrelated to Discord RBAC

These must be layered after resolved effective permissions (whether computed by a short-lived reference during validation or by Echo after translation), not mixed into the raw bit math.

## Discord overwrite algorithm to preserve exactly

For a member `u` in channel `c`:

1. Compute `base = permissions(@everyone OR assigned roles)`.
2. If `ADMINISTRATOR in base`, stop and allow everything supported by the imported model.
3. Apply category overwrites, if any:
   - apply `@everyone.deny`
   - apply `@everyone.allow`
   - let `roleDeny = OR(all denies for u's roles)`
   - let `roleAllow = OR(all allows for u's roles)`
   - apply `roleDeny`
   - apply `roleAllow`
   - apply `member.deny`
   - apply `member.allow`
4. Apply channel overwrites with the same sequence.

That exact sequence is the **spec** the translator (and any Echo primitive tweaks) must satisfy. A reference implementation uses it during import validation; production Echo uses **one** evaluator on **Echo** data.

## Why naive compile-to-Echo alone is risky

A tempting shortcut is:

- map Discord bits to Echo strings
- compile overwrites into Echo boolean partials
- use the existing Echo evaluator

This is not sufficient for flawless parity because:

### Risk 1: role union vs role fold

Discord role accumulation is union-based.
Echo role accumulation is currently last-write-wins.

That is a semantic mismatch before channel overwrites even begin.

### Risk 2: aggregated role overwrites

Discord combines all applicable role overwrites before applying deny then allow.

Example:

- `RoleA` denies `SEND_MESSAGES`
- `RoleB` allows `SEND_MESSAGES`
- user has both roles

Discord result:

- final role overwrite result is **allow**

A naive ordered partial-row fold can produce the wrong answer depending on row order.

### Risk 3: unsupported bits silently disappearing

If a Discord bit has no Echo equivalent and the import simply drops it, later behavior may diverge without any explicit signal.

## Required data model additions

If exact parity is the goal, add a canonical imported-permission representation.

Recommended tables:

### `discord_import_roles`

- `echo_server_id`
- `discord_role_id`
- `name`
- `position`
- `permission_bits`

### `discord_import_member_roles`

- `echo_server_id`
- `echo_user_id`
- `discord_role_id`

### `discord_import_permission_overwrites`

- `echo_server_id`
- `scope_type` = `category` | `channel`
- `scope_id`
- `target_type` = `everyone` | `role` | `member`
- `target_id`
- `allow_bits`
- `deny_bits`
- `source_order`

### `discord_import_channel_metadata`

- `echo_server_id`
- `echo_channel_id`
- `discord_channel_type`
- `parent_category_id`
- `permissions_synced`
- thread/stage/forum flags if relevant

The names can vary; the requirement is lossless storage, not these exact identifiers.

## Mapping policy for permission bits

Every Discord permission bit must be classified into one of three buckets:

### 1. Exact mapping

The bit maps 1:1 to an Echo permission string or action gate.

Examples already close to exact:

- `VIEW_CHANNEL`
- `SEND_MESSAGES`
- `ATTACH_FILES`
- `MANAGE_MESSAGES`
- `MANAGE_CHANNELS`
- `CREATE_INSTANT_INVITE`
- `CONNECT`
- `SPEAK`
- `STREAM`
- `MOVE_MEMBERS`
- `MUTE_MEMBERS`
- `DEAFEN_MEMBERS`

### 2. Derived mapping

The bit has no direct persisted Echo bit, but Echo can derive the same product outcome.

Example:

- a Discord bit may map to a product capability exposed through existing UI logic rather than a stored permission string

### 3. Reject / degrade explicitly

If a server uses unsupported features, the import pipeline must either:

- reject "exact parity mode", or
- mark the guild as "best effort, not exact"

No silent fallback.

## Channel-type edge cases

Exact outcomes require honoring channel-type-specific behavior.

### Text channels

Need at least:

- `VIEW_CHANNEL`
- `SEND_MESSAGES`
- `EMBED_LINKS`
- `ATTACH_FILES`
- `ADD_REACTIONS`
- `READ_MESSAGE_HISTORY`
- `MENTION_EVERYONE`
- `MANAGE_MESSAGES`
- thread-related bits if threads exist in imported data

### Voice channels

Need at least:

- `VIEW_CHANNEL`
- `CONNECT`
- `SPEAK`
- `STREAM`
- `MUTE_MEMBERS`
- `DEAFEN_MEMBERS`
- `MOVE_MEMBERS`
- `PRIORITY_SPEAKER`
- `USE_VAD`

### Categories

Need inheritance/sync semantics:

- if a child channel is synced, category overwrites define the inherited starting layer
- if unsynced, category overwrites still apply first, then channel overwrites replace/refine the result

### Unsupported channel classes

If the Discord export contains:

- forums
- stages
- announcement channels
- threads as first-class entities

then exact parity requires Echo support for them, or the import must explicitly declare non-parity.

## Role hierarchy edge cases

Discord role hierarchy affects more than raw permission bits.

Flawless parity must treat these separately:

### Permission evaluation

- union of assigned role permission bitsets
- role order does **not** change the bit result

### Moderation / management constraints

Role hierarchy does matter for actions like:

- kick
- ban
- timeout
- manage roles
- nickname edits

So the translation layer must preserve:

- highest role position for actor
- highest role position for target
- owner immunity rules

Do not confuse "has `BAN_MEMBERS`" with "can ban this specific user."

## Member overwrite edge cases

Member overwrites must remain explicit in storage and evaluation.

Rules:

- a member-specific overwrite is applied after `@everyone` and role overwrites
- member allow must beat earlier denies
- member deny must beat earlier base permissions

This cannot be reconstructed correctly if member rows are flattened away too early.

## Timeout edge cases

Discord timeouts are not just a normal channel overwrite.

If exact parity is required, the translation layer must model timeout as a separate policy layer that suppresses actions Discord suppresses during timeout, including at minimum:

- sending messages
- creating thread messages
- reacting
- speaking / streaming where applicable

In Echo, the supported parity surface should also stay aligned across every product action built on top of those permissions/capabilities:

- poll voting and other message interactions
- pin / unpin mutations
- typing indicators
- invite creation
- nickname changes
- channel/media upload entry points that imply communication
- capability and workspace payloads consumed by the client UI

The exact set should match the Discord reference implementation used during validation.

## `ADMINISTRATOR` edge cases

Rules to preserve:

- owner bypass beats all normal evaluation
- `ADMINISTRATOR` bypasses channel/category overwrites
- admin still does not magically grant unsupported product features; it only grants supported permission outcomes

Ensure `ADMINISTRATOR` ends up with the same effective outcome as the upstream reference **in Echo**: e.g. correct role permission arrays on import, and Echo’s evaluation path must treat it like the reference (bypass overwrites where the reference does). Validate with the reference during import; do not rely on a permanent duplicate engine in production.

## Recommended implementation plan

### Phase 1: import contract and docs

- Document strict vs best-effort import (parity claims vs warnings only). No permanent `permission_model` fork in production unless product explicitly wants two systems (this doc assumes **you do not**).

### Phase 2: lossless import staging (optional, time-bounded)

- While translating, keep **export-wide** allow/deny and metadata if it helps the job; **commit** Echo rows as the durable source of truth.

### Phase 3: align Echo with Discord where the stored model requires it

- Either **change** `foldRolePermissions` / overwrite merge to match Discord rules for guilds that need parity, or **compile** Discord into row partials such that Echo’s **existing** merge + `applyLayerFromPartialObject` reproduces Discord outcomes. Either way, **one** runtime evaluator.

### Phase 4: validation harness (import / CI)

- Compare reference Discord outcomes vs `evaluatePermissionSet` (or equivalent) on Echo-persisted state until the translation is proven.

### Phase 5: normal Echo caches and invalidation

- Use existing Echo permission cache patterns; no separate cache system for “Discord mode.”

## Validation strategy

Flawless parity is a testing problem as much as an implementation problem.

During import validation (or CI), compare two implementations **only to prove the translation**:

- **Reference:** Discord-accurate (short-lived; not a second production engine).
- **Target:** Echo’s normal `evaluatePermissionSet` (or equivalent) on **persisted** Echo data after import.

For every imported guild, compute and compare:

- server-level effective bits per user
- channel-level effective bits per user/channel
- derived action outcomes used by Echo UI and APIs

Validation should fail if:

- any supported bit differs
- any unsupported bit was silently dropped in strict import mode
- any moderation hierarchy outcome differs for tested actions

## Import contract modes

Expose two explicit **import** modes (not runtime engines):

- **Strict:** reject or flag imports that cannot be expressed in Echo without silent loss; require validation vs reference.
- **Best effort:** translate with warnings; do not claim parity.

## Conclusion

**You are translating into Echo, not adding a permanent second permission system.**

- **Acceptable:** Import pipeline + (if needed) one-time changes to Echo’s **same** RBAC primitives so persisted `echo_*` data yields Discord-equivalent outcomes; use a Discord-accurate reference **only** to validate the translation.
- **Not acceptable:** A long-lived production fork such as “imported servers use a separate Discord evaluator forever.”

Flawless parity still means honoring Discord’s rules for union, overwrites, and hierarchy — but the **durable** answer lives in Echo storage and Echo’s **one** evaluation path, not a parallel stack.
