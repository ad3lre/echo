/**
 * Re-fetch Discord media for Echo messages when mirrored objects are missing
 * (or for a specific message), rewrite Discord CDN URLs, and requeue the mirror.
 *
 * Usage (from server/backend/):
 *   bun src/scripts/repairDiscordImportMedia.ts
 *   bun src/scripts/repairDiscordImportMedia.ts --execute
 *   bun src/scripts/repairDiscordImportMedia.ts --execute --message-id=… --channel-id=…
 *   bun src/scripts/repairDiscordImportMedia.ts --execute --limit=500
 *
 * Requires: DATABASE_URL, running Discord bot with ECHO_DISCORD_BOT_WEBHOOK_SECRET.
 */
import { closePgPool, getPgPool } from '../db/pg';
import {
  repairDiscordImportMediaForMessage,
  scanAndRepairMissingDiscordImportMedia,
} from '../services/discordImport/discordImportMediaRepair';

const execute = process.argv.includes('--execute');

function argValue(flag: string): string | undefined {
  const pref = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length).trim() || undefined;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('-')) return next.trim();
  }
  return undefined;
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const messageId = argValue('--message-id');
  const channelId = argValue('--channel-id');
  const limitRaw = argValue('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if ((messageId && !channelId) || (!messageId && channelId)) {
    console.error('Provide both --message-id and --channel-id, or neither.');
    process.exit(1);
  }

  const say = (line: string) => {
    process.stdout.write(`${line}\n`);
  };

  if (messageId && channelId) {
    say(
      `${execute ? 'Repairing' : 'Would repair'} message ${messageId} in channel ${channelId}.`,
    );
    const result = await repairDiscordImportMediaForMessage(
      pool,
      channelId,
      messageId,
      { execute },
    );
    if (!result.ok) {
      console.error(
        `Failed: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`,
      );
      await closePgPool();
      process.exit(1);
    }
    say(
      `OK restoredDiscordUrls=${result.restoredDiscordUrls} enqueue=${result.enqueue}`,
    );
  } else {
    say(
      `${execute ? 'Scanning' : 'Would scan'} Discord-bridged messages with missing Echo mirror objects` +
        (limit ? ` (limit=${limit})` : '') +
        '.',
    );
    const summary = await scanAndRepairMissingDiscordImportMedia(pool, {
      execute,
      ...(limit != null && Number.isFinite(limit) ? { limit } : {}),
    });
    say(
      `scanned=${summary.scanned} candidates=${summary.candidates} ` +
        `${execute ? 'repaired' : 'would_repair'}=${summary.repaired} ` +
        `pressure=${summary.pressure} failed=${summary.failed}`,
    );
  }

  if (!execute) {
    say('Dry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch(async (err) => {
  console.error(err);
  await closePgPool().catch(() => {});
  process.exit(1);
});
