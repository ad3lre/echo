#!/usr/bin/env node
/**
 * Backfill published custom emoji CDN objects (`echo/public-emojis/{id}.{ext}`).
 *
 * Requires: DATABASE_URL, S3 env (or ECHO_LOCAL_UPLOAD_DIR)
 *
 * Usage:
 *   ECHO_EMOJI_PUBLISH_TO_CDN=true node --import tsx scripts/backfill-echo-emoji-cdn.mjs
 *   ECHO_EMOJI_PUBLISH_TO_CDN=true node --import tsx scripts/backfill-echo-emoji-cdn.mjs --dry-run
 */
import pg from 'pg';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  process.env.ECHO_EMOJI_PUBLISH_TO_CDN = 'true';

  const { publishEchoCustomEmojiToCdn } =
    await import('../../backend/src/services/echoEmojiCdnPublish.ts');

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const res = await pool.query(
      `SELECT id, image_url FROM echo_server_custom_emojis
       WHERE COALESCE(expression_kind, 'emoji') = 'emoji'
         AND image_url LIKE '%echo/emoji/%'`,
    );
    let ok = 0;
    let skip = 0;
    for (const row of res.rows) {
      if (dryRun) {
        console.log(`[dry-run] would publish ${row.id}`);
        ok++;
        continue;
      }
      try {
        const url = await publishEchoCustomEmojiToCdn(
          pool,
          row.id,
          row.image_url,
        );
        if (url) {
          ok++;
          console.log(`published ${row.id} -> ${url}`);
        } else {
          skip++;
        }
      } catch (e) {
        console.error(`failed ${row.id}:`, e);
      }
    }
    console.log(
      `done: published=${ok} skipped=${skip} total=${res.rows.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
