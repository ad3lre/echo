/**
 * One-off: refresh expired Discord CDN signatures on messages from bulk Discord import.
 *
 * Re-fetches channel history from the Discord bot (same path as initial import) and
 * rewrites stored attachment/embed/sticker URLs when the stable asset path matches.
 *
 * Usage (from server/backend/):
 *   npx ts-node src/scripts/backfillDiscordImportCdnUrls.ts           # dry-run
 *   npx ts-node src/scripts/backfillDiscordImportCdnUrls.ts --execute # apply
 *
 * Requires: DATABASE_URL, running Discord bot with ECHO_DISCORD_BOT_WEBHOOK_SECRET.
 */
import { closePgPool, getPgPool } from '../db/pg';
import { refreshDiscordImportCdnUrlsForChannel } from '../services/discordImport/discordImportCdnRefresh';

const execute = process.argv.includes('--execute');

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const { rows } = await pool.query<{
    channel_id: string;
    discord_channel_id: string;
    message_count: number;
  }>(
    `SELECT channel_id, discord_channel_id, message_count
     FROM echo_discord_channel_message_imports
     ORDER BY channel_id`,
  );

  if (rows.length === 0) {
    console.log('No Discord-imported channels with message history.');
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Refreshing' : 'Would refresh'} CDN URLs for ${rows.length} imported channel(s).`,
  );

  let totalUpdated = 0;
  for (const r of rows) {
    try {
      const result = await refreshDiscordImportCdnUrlsForChannel(
        pool,
        {
          echoChannelId: r.channel_id,
          discordChannelId: r.discord_channel_id,
          messageCount: Number(r.message_count) || 90,
        },
        { execute },
      );
      totalUpdated += result.updated;
      console.log(
        `  ${execute ? '✓' : '·'} echo=${result.echoChannelId} discord=${result.discordChannelId}: ` +
          `fetched=${result.fetchedFromDiscord} scanned=${result.scanned} ` +
          `${execute ? 'updated' : 'would_update'}=${result.updated} ` +
          `no_discord_row=${result.skippedNoDiscordRow} no_path_match=${result.skippedNoMatch}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `  ✗ echo=${r.channel_id} discord=${r.discord_channel_id}: ${msg}`,
      );
    }
  }

  console.log(
    `\n${execute ? 'Updated' : 'Would update'} ${totalUpdated} message(s) total.`,
  );

  if (execute) {
    const requeued = await pool.query(
      `UPDATE echo_discord_import_media_mirror_queue
       SET status = 'pending', last_error = NULL, attempts = 0, updated_at = NOW()
       WHERE status = 'failed'
       RETURNING message_id`,
    );
    console.log(
      `Requeued ${requeued.rowCount ?? 0} failed Discord media mirror job(s).`,
    );
  } else {
    const { rows: failedRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM echo_discord_import_media_mirror_queue WHERE status = 'failed'`,
    );
    const failedCount = Number(failedRows[0]?.count ?? 0);
    if (failedCount > 0) {
      console.log(
        `Would requeue ${failedCount} failed Discord media mirror job(s) when run with --execute.`,
      );
    }
  }

  if (!execute) {
    console.log('Dry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
