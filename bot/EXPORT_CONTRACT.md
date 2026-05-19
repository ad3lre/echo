# Export contract (Echo Discord export bot)

This document defines what each run produces and how importers should treat it.

## Authoritative artifacts (Echo import)

These files describe the guild in a form suitable for rebuilding Echo servers:

| File               | Purpose                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `guild.json`       | Guild metadata (Discord API–shaped JSON from discord.js `toJSON()`).                                                 |
| `roles.json`       | All roles, sorted deterministically (higher `position` first; tie-break `id` ascending).                             |
| `channels.json`    | Parent guild channels only (categories, text, voice, etc.). **Threads are omitted** by design (not an Echo feature). |
| `members.jsonl`    | One JSON object per line: Discord guild member payloads (includes `roles` = member’s role IDs).                      |
| `overwrites.jsonl` | Optional when `--no-overwrites-jsonl` is not set: one JSON object per overwrite row, with `channelId` prefix.        |

Optional / auxiliary:

- `invites.json`, `webhooks.jsonl`, `scheduled_events.json`, `auto_moderation.json`
- `emojis.json`, `stickers.json`, `assets/`, `asset_manifest.json`
- `member_effective_permissions_sample.json` (only with `--compute-effective-permissions`)

## Idempotent JSONL

These files are **replaced wholesale** on every successful export run (file truncated before writing):

- `members.jsonl`
- `overwrites.jsonl` (when enabled)
- `webhooks.jsonl` (when webhooks export is enabled)

Re-running the export for the same guild folder must **not** append duplicate lines from previous runs.

## `manifest.json`

Written when an export finishes (and includes a start snapshot where applicable). Fields include:

- `tool`, `toolVersion`, timestamps, `guildId`, `guildName`, `flags`
- `memberCountExported`, optional `assetManifestSummary`
- **`completeness`**: machine-readable health (bot member resolved, permission checks, counts, `echoCoreOk`, `strictFailed` when applicable)

Importers should read `completeness.echoCoreOk` (and optional warnings) to decide whether to trust the bundle.

## CLI modes

- **Default:** export runs even if some optional data is missing; `completeness` lists warnings.
- **`--strict`:** export throws after writing outputs if Echo-core checks fail (e.g. bot member unresolved, missing View Channel without Administrator, zero members exported while the guild reports members). Process should exit non-zero.

## Voice bitrate

By default, voice channel `bitrate` is **included** in `channels.json` for mapping to Echo `bitrate_bps`. Use `--strip-voice-bitrate` only if you need a slimmer file.
