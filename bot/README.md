# Echo Discord export bot

Node tool that logs in as a **Discord bot** and writes guild **structure, roles, channel permission overwrites, members, emojis/stickers metadata, optional invites/webhooks/scheduled events/auto moderation**, and **downloaded assets** into a folder:

`exports/<SafeGuildName>_<guildId>/`

It does **not** export messages, **threads** (not an Echo feature), audit log, or bans. Voice channel **bitrate** is **included** in `channels.json` by default for Echo `bitrate_bps` import mapping; use `--strip-voice-bitrate` if you want a slimmer file. **Slowmode** is kept as `rate_limit_per_user` when Discord provides it.

**Export contract:** see [EXPORT_CONTRACT.md](./EXPORT_CONTRACT.md) for authoritative files, idempotent JSONL behavior, and `manifest.completeness`.

## Prerequisites

- **Node.js 20+**
- A **Discord application** with a bot user ([Discord Developer Portal](https://discord.com/developers/applications))
- The bot **added to the target server** with permissions to see channels you care about (and to list members)

### Privileged intent (required for member export)

In the Developer Portal → **Bot** → **Privileged Gateway Intents**, enable:

- **Server Members Intent** (`GUILD_MEMBERS`)

Without this, member pagination may fail or be incomplete.

**Message Content Intent** is **not** required (this tool does not read messages).

### Suggested bot permissions (OAuth2 URL generator)

Minimum useful set (adjust to your server):

- View Channels
- Read Message History (not used for bulk message export here, but typical for a bot that can see channels)

Optional (for optional export files):

- **Manage Server** — helps with some guild metadata and integrations (best-effort; failures are logged)
- **Manage Webhooks** — listing webhooks per channel (`webhooks.jsonl`)
- **Manage Events** — scheduled events fetch when enabled

If the bot lacks access to a channel, that channel’s webhooks are skipped silently.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable            | Required | Description                                              |
| ------------------- | -------- | -------------------------------------------------------- |
| `DISCORD_BOT_TOKEN` | Yes      | Bot token                                                |
| `DISCORD_GUILD_ID`  | No       | Default guild if you omit the CLI guild id               |
| `EXPORT_BASE_DIR`   | No       | Parent directory for export folders (default: `exports`) |

## Usage

From the **monorepo root**:

```bash
npm install
npm run build -w bot
node bot/dist/index.js <guildId> [--out <dir>]
```

From **`bot/`**:

```bash
npm install
npm run build
npm start -- <guildId>
# or during development:
npm run dev -- <guildId>
```

Running `npm run dev` with no guild and no `DISCORD_GUILD_ID` prints help and exits successfully (it does not start an export).

Long-running mode (export on each new guild invite):

```bash
npm run serve:dev
# or: npm run serve
```

### CLI flags

| Flag                              | Effect                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--out <dir>`                     | Base directory for exports (overrides `EXPORT_BASE_DIR`)                                                                      |
| `--strict`                        | Exit with non-zero if Echo-core completeness checks fail (`manifest.json` still written with `exportStatus` / `completeness`) |
| `--strip-voice-bitrate`           | Remove voice `bitrate` from `channels.json`                                                                                   |
| `--serve`                         | Stay online; export when the bot joins a guild                                                                                |
| `--serve-bootstrap`               | With `--serve`, after login export every guild already in cache (sequential, ~2.5s between guilds)                            |
| `--skip-optional`                 | Skips **invites** and **webhooks**                                                                                            |
| `--no-invites`                    | Skips `invites.json`                                                                                                          |
| `--no-webhooks`                   | Skips `webhooks.jsonl`                                                                                                        |
| `--no-scheduled-events`           | Skips `scheduled_events.json`                                                                                                 |
| `--no-auto-mod`                   | Skips `auto_moderation.json`                                                                                                  |
| `--no-overwrites-jsonl`           | Skips `overwrites.jsonl` (overwrites remain inside `channels.json`)                                                           |
| `--compute-effective-permissions` | Writes `member_effective_permissions_sample.json` (Permission **bitfield** strings, small sample only)                        |
| `--effective-members <n>`         | Max members in that sample (default `20`)                                                                                     |
| `--effective-channels <n>`        | Max channels in that sample (default `30`)                                                                                    |
| `-h`, `--help`                    | Help text                                                                                                                     |

## Output layout

- `manifest.json` — tool version, timestamps, flags, `completeness`, `exportStatus`, summaries
- `guild.json`, `roles.json`, `channels.json`, `members.jsonl`
- `emojis.json`, `stickers.json`, `asset_manifest.json`
- `assets/` — guild icon/banner/splash (if any), emoji files, sticker files, role icon files
- Optional: `overwrites.jsonl`, `invites.json`, `webhooks.jsonl`, `scheduled_events.json`, `auto_moderation.json`
- Optional: `member_effective_permissions_sample.json`

JSONL files (`members.jsonl`, `overwrites.jsonl`, `webhooks.jsonl`) are **truncated at the start of each run** so repeat exports do not duplicate lines.

### Security / privacy

- **Do not commit** `.env` or export folders. Treat `members.jsonl` as **PII**.
- **Webhook URLs and tokens are not exported** (Discord webhook URLs embed secrets). The exporter writes non-secret webhook metadata only.

## Alignment with Echo import

Raw **role permission integers** and **channel overwrite rows** are preserved for a future importer. See `docs/operations/discord-import-readiness.md` in the main repo for how Echo maps Discord permission semantics.
