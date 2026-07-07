/**
 * One-off: re-encode stored PNG/JPEG chat media as WebP and migrate storage keys.
 *
 * Reads active rows from echo_chat_upload_retention, stores `{same-base}.webp`,
 * rewrites message/user URL references, and deletes the legacy object.
 *
 * Usage (from backend/):
 *   npx ts-node src/scripts/backfillRasterImagesToWebp.ts
 *   npx ts-node src/scripts/backfillRasterImagesToWebp.ts --execute
 *   npx ts-node src/scripts/backfillRasterImagesToWebp.ts --execute --limit 50
 *   npx ts-node src/scripts/backfillRasterImagesToWebp.ts --prefix echo/channels/
 *
 * Requires: DATABASE_URL, S3 or ECHO_LOCAL_UPLOAD_DIR
 */
import { closePgPool, getPgPool } from '../db/pg';
import { runRasterWebpBackfill } from '../services/rasterImageWebpBackfill';

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

  console.log(
    `${execute ? 'Migrating' : 'Would migrate'} raster uploads to WebP` +
      (prefix ? ` (prefix=${prefix})` : '') +
      (limit != null && Number.isFinite(limit) ? ` (limit=${limit})` : '') +
      '.',
  );

  const summary = await runRasterWebpBackfill(pool, {
    execute,
    prefix,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  console.log(
    `Done. scanned=${summary.scanned} ${execute ? 'transcoded' : 'would_transcode'}=${summary.transcoded} skipped=${summary.skipped} failed=${summary.failed}`,
  );

  if (!execute) {
    console.log('Dry run. Re-run with --execute to apply.');
  }

  await closePgPool();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
