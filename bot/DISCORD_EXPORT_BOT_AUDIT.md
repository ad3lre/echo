# Discord Export Bot Audit

## Scope

This audit checks whether the bot in `bot/` is good enough for its stated goal:

- capture a Discord server's structure for import into Echo
- preserve channel/category structure
- preserve role structure
- preserve member-to-role ownership
- preserve permission overwrite data and related metadata

The review is based on the current implementation in `bot/src/` and the import expectations described in `docs/operations/discord-import-readiness.md`.

**Out of scope (not a gap):** Discord **threads** are not exported (`runPhaseGuild` skips `ch.isThread()`). That matches the product direction: threads are **not** planned as an Echo feature, so the exporter does not need thread existence, parentage, or thread-specific permissions for import.

## Short verdict

The bot is **useful**, but it is **not yet as complete or as safe as it can be** for a full-fidelity import pipeline.

It already captures the core raw export set:

- guild metadata via `guild.json`
- roles via `roles.json`
- parent channels via `channels.json`
- member payloads via `members.jsonl`
- overwrite rows via `overwrites.jsonl`
- optional invites, webhooks, scheduled events, and automod
- assets like icons, emoji, stickers, and role icons

However, there are several important gaps and logic issues that matter if the export is supposed to be a reliable import source of truth.

## Findings

### High: repeated exports corrupt JSONL outputs with duplicates

Files written through `appendJsonl()` are never truncated before a new export run:

- `members.jsonl`
- `overwrites.jsonl`
- `webhooks.jsonl`

`runFullExport()` reuses the same folder name for the same guild (`<safeName>_<guildId>`), and `appendJsonl()` always appends. That means rerunning the export for the same guild silently accumulates duplicate rows from prior runs.

This is a correctness issue, not just a cosmetic one. An importer could:

- duplicate members
- duplicate overwrites
- treat old rows as still current
- import stale webhook metadata

Relevant code:

- `bot/src/exporter/runFullExport.ts`
- `bot/src/exporter/phaseGuild.ts`
- `bot/src/exporter/phaseMembers.ts`
- `bot/src/exporter/phaseOptional.ts`
- `bot/src/util/fs.ts`

### High: voice bitrate is intentionally dropped even though Echo has a place for it

`channelToExport()` deletes `bitrate` from the serialized channel JSON.

That is a lossy transform. The import-readiness doc says Echo can persist voice bitrate (`bitrate_bps`), so stripping it reduces import fidelity for voice channels for no import benefit.

Relevant code:

- `bot/src/exporter/channelSerialize.ts`
- `docs/operations/discord-import-readiness.md`

### Medium: permission verification is advisory only, so partial exports can look successful

The new permission check prints warnings, but the export still runs even when required visibility is missing.

For a "make me an importable map" workflow, that is risky because:

- hidden channels can be absent
- invites/webhooks/events/automod can silently be missing
- member export can be incomplete if privileged intent is not properly enabled

Today the bot logs the risk but does not:

- fail fast
- mark the manifest as incomplete
- produce a machine-readable completeness report

So the export can look "done" while still being partial.

Relevant code:

- `bot/src/exportPermissions.ts`
- `bot/src/index.ts`
- `bot/src/exporter/runFullExport.ts`

### Medium: core structure export relies on caches instead of explicit full fetches

The exporter explicitly fetches:

- guild metadata
- members through REST pagination
- emojis
- stickers
- scheduled events
- automod rules

But for two critical structure sets, it reads from cache:

- `full.roles.cache`
- `full.channels.cache`

There is no explicit `roles.fetch()` or `channels.fetch()` before writing `roles.json` and `channels.json`.

That may be fine in many cases, but it means completeness depends on discord.js cache hydration behavior at runtime. For a one-shot archival exporter, explicit fetches would be safer and easier to reason about.

Relevant code:

- `bot/src/exporter/phaseGuild.ts`

### Medium: serve mode handles new joins, but not "all known guilds need export now"

`--serve` exports on `GuildCreate`, which is correct for "when the bot joins a new server."

But it does not also do an initial pass over already-joined guilds on startup. So it is not a complete unattended sync/bootstrap mode; it is specifically a join-triggered mode.

That is fine if intentional, but it is less "smart" than it could be for operational use.

Relevant code:

- `bot/src/index.ts`

### Low: role ordering output is not fully stabilized on equal positions

Roles are sorted by descending `position`, but ties are not broken by `id` or another stable key. Discord role positions can tie in practice.

This is probably not catastrophic, but for reproducible exports and deterministic imports it would be better to stabilize equal-position ordering.

Relevant code:

- `bot/src/exporter/phaseGuild.ts`

## Coverage against the stated import goal

### What it already gets right

- **Guild-level metadata:** `guild.json` is a good raw source.
- **Roles:** `roles.json` captures names, colors, positions, permissions, icons, and related metadata from Discord objects.
- **Member-role ownership:** `members.jsonl` from `Routes.guildMembers()` is the right raw source for per-member role IDs.
- **Channel/category structure:** `channels.json` preserves the parent-channel graph for non-thread channels, including overwrite objects in the channel payload.
- **Per-target overwrite rows:** `overwrites.jsonl` is useful for import ETL because it preserves row-level overwrite information separately from `channels.json`.
- **Assets:** icon/banner/splash/emoji/sticker/role-icon export is solid and useful for reconstruction.

### Where it falls short for Echo-relevant import map

- **Voice bitrate is stripped.**
- **Completeness is not enforced when permissions are insufficient.**
- **Repeated exports are not idempotent because JSONL files accumulate duplicates.**
- **Channels/roles depend on cache rather than explicit full fetch.**

## Answer to the main questions

### Is it as smart as it can be?

No.

It is a solid first-pass exporter, but not yet a "trust this as the canonical import snapshot" tool. The biggest reasons are:

- no idempotent rerun behavior for JSONL files
- lossy bitrate removal
- advisory rather than enforced completeness checks

### Is it pulling everything it is supposed to?

For **Echo import scope** (no threads): mostly yes on structure, roles, members, and overwrites. It still weakens or risks incompleteness on:

- voice bitrate (stripped)
- exports that can be partial without being clearly marked failed/incomplete

Threads are intentionally out of scope; do not count their absence as missing work.

### Does it capture channel structures, role structures, and member ownership of roles?

Yes for what Echo needs:

- **channel structures:** parent channels and categories (not threads — intentional)
- **role structures:** yes
- **member ownership of roles:** yes through `members.jsonl`

Remaining concern is **completeness enforcement** (permissions / intent), not missing threads.

## Recommended next fixes

1. Make each export run idempotent.
   Delete or truncate `members.jsonl`, `overwrites.jsonl`, and `webhooks.jsonl` before writing new rows.

2. Stop dropping `bitrate`.
   Preserve the raw Discord bitrate so the importer can map it to Echo's `bitrate_bps`.

3. Upgrade permission verification from "print warnings" to "completeness contract."
   At minimum, write a machine-readable completeness section into `manifest.json`.
   Better: fail strict export mode when required access is missing.

4. Explicitly fetch roles/channels before export.
   This reduces dependence on cache state and makes the exporter safer as an archival/import tool.

5. Add a strict mode.
   Example: `--strict` could refuse to write a "successful" export when required structure cannot be fully observed.

## Final assessment

For a casual or exploratory Discord export, the bot is already pretty good.

For a serious Echo import source of truth, it still needs a few upgrades before it can honestly claim it exports the **Echo-relevant** server map completely and safely. Thread omission is not one of those upgrades.

## Remediation (implemented)

The following audit items have been addressed in code:

- **JSONL idempotency:** `members.jsonl`, `overwrites.jsonl`, and `webhooks.jsonl` are reset at the start of each export via `prepareJsonl()` in [`bot/src/util/fs.ts`](src/util/fs.ts) from [`runFullExport`](src/exporter/runFullExport.ts).
- **Voice bitrate:** kept by default in `channels.json`; `--strip-voice-bitrate` opt-out. See [`bot/src/exporter/channelSerialize.ts`](src/exporter/channelSerialize.ts).
- **Explicit role/channel fetch:** [`bot/src/exporter/phaseGuild.ts`](src/exporter/phaseGuild.ts) calls `guild.channels.fetch()` and `guild.roles.fetch()` before serialization.
- **Deterministic roles:** sort by `position` descending, tie-break `id` ascending.
- **Completeness + strict:** [`bot/src/exportCompleteness.ts`](src/exportCompleteness.ts) builds `manifest.completeness`; `--strict` throws `ExportStrictViolationError` after writing manifest with `exportStatus: failed_strict`.
- **Serve bootstrap:** `--serve-bootstrap` with `--serve` exports existing guilds on `ClientReady` (sequential delay). See [`bot/src/index.ts`](src/index.ts).
- **Contract doc:** [`bot/EXPORT_CONTRACT.md`](EXPORT_CONTRACT.md).
