# Voice channel migration repair

## What broke

Two idempotent migrations in `ensureEchoTables` (`server/backend/src/db/echoTables.ts`) could leave production data in a bad state:

| Migration                            | Symptom                                                                                                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrateEchoCategorySchema`          | Legacy `category_name` → `category_id` used `'Text Channels'` as the default for **empty** names. Voice/stage rows with blank `category_name` were grouped with text instead of `'Voice Channels'`.                                                               |
| `migrateEchoPermissionOverwriteRows` | Legacy `permission_overrides` JSONB was copied verbatim into a single `@everyone` overwrite row. Mirror-only flows (Discord voice mirror) store `{ CONNECT: false }`; when that signature was applied to joinable Echo voice channels, members could not connect. |

Discord-imported servers with custom category names are not recategorized by this repair.

## Automatic repair

On every backend boot with Postgres, after the migrations above, `repairEchoVoiceChannelMigrationDamage` runs (see `server/backend/src/db/repairEchoVoiceChannelMigration.ts`).

It is **idempotent** and only changes rows that match the broken patterns:

1. **Recategorize** — `voice` / `stage` channels in a category named `Text Channels` move to `Voice Channels` (category created if missing, positioned after `Text Channels` when present).
2. **Restore join** — removes `@everyone` overwrite rows whose partial is exactly `{ CONNECT: false }` on non-mirror server/voice/stage channels.
3. **Clear stuck mirror flag** — sets `discord_voice_mirror_only = false` when no voice-mirror map or enabled per-channel mirror row exists.

Stage channels that intentionally use `{ CONNECT: true, SPEAK: false }` are preserved.

## Verify on existing broken data

Run against a DB copy (see [database-migrations.md](./database-migrations.md)):

```sql
-- Voice/stage still stranded in Text Channels
SELECT s.name AS server, ch.name, ch.type, cat.name AS category
FROM echo_channels ch
JOIN echo_servers s ON s.id = ch.server_id
JOIN echo_categories cat ON cat.id = ch.category_id AND cat.server_id = ch.server_id
WHERE ch.type IN ('voice', 'stage')
  AND LOWER(TRIM(cat.name)) = 'text channels';

-- Joinable voice with erroneous @everyone CONNECT deny
SELECT ch.id, ch.name, ow.partial
FROM echo_channels ch
JOIN echo_channel_permission_overwrite_rows ow
  ON ow.channel_id = ch.id AND ow.server_id = ch.server_id
WHERE ch.type IN ('voice', 'stage')
  AND ow.target_type = 'everyone'
  AND ow.partial = '{"CONNECT": false}'::jsonb
  AND ch.discord_voice_mirror_only = false;
```

After deploy/restart (or `ensureEchoTables`), both queries should return **zero rows** for repaired servers.

Optional targeted repair without full app boot:

```bash
DATABASE_URL='postgres://…' npx ts-node -e "
  const pg = require('pg');
  const { ensureEchoTables } = require('./src/db/echoTables');
  (async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await ensureEchoTables(pool);
    await pool.end();
  })();
"
```

## Tests

```bash
npm run test:echo:channelSettings -w backend
```

Includes `echo.voiceChannelMigrationRepair.test.ts` (unit + integration when `DATABASE_URL` / `PG_TEST_URL` is set).

## Manual recovery

If a voice channel **should** deny Echo connect (Discord mirror display-only):

1. Enable Discord voice mirror for that channel or its category in Server Settings.
2. The product will re-apply `{ CONNECT: false }` and `discord_voice_mirror_only = true` intentionally.

If a channel **should** deny connect for moderation (non-mirror), set `@everyone` **Connect** to deny in Channel Settings → Permissions after repair; multi-permission overwrites are not removed by this repair.
