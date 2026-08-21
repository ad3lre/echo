/**
 * One-off: mark active chat upload retention rows as purged when the object
 * is missing from S3/local storage (orphaned metadata).
 *
 * Usage (from server/backend/):
 *   npx ts-node src/scripts/purgeOrphanedChatUploadRetention.ts
 *   npx ts-node src/scripts/purgeOrphanedChatUploadRetention.ts --execute
 *   npx ts-node src/scripts/purgeOrphanedChatUploadRetention.ts --execute --limit 100
 *   npx ts-node src/scripts/purgeOrphanedChatUploadRetention.ts --prefix echo/channels/
 *
 * Requires: DATABASE_URL, S3 or ECHO_LOCAL_UPLOAD_DIR
 */
import { closePgPool, getPgPool } from '../db/pg';
import { runOrphanedChatUploadRetentionPurge } from '../services/uploads/chatUploadRetentionOrphans';

function readArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1]?.trim() || undefined;
}

const execute = process.argv.includes('--execute');
const prefix = readArgValue('--prefix');
const limitRaw = readArgValue('--limit');
const limit = limitRaw ? Number(limitRaw) : undefined;

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  process.stdout.write(
    `${execute ? 'Purging' : 'Would purge'} orphaned chat upload retention rows` +
      (prefix ? ` (prefix=${prefix})` : '') +
      (limit != null && Number.isFinite(limit) ? ` (limit=${limit})` : '') +
      '.\n',
  );

  const summary = await runOrphanedChatUploadRetentionPurge(pool, {
    execute,
    prefix,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  process.stdout.write(
    `Done. scanned=${summary.scanned} ${execute ? 'purged' : 'would_purge'}=${summary.purged} present=${summary.present} skipped=${summary.skipped}\n`,
  );

  if (!execute) {
    process.stdout.write('Dry run. Re-run with --execute to apply.\n');
  }

  await closePgPool();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
