/**
 * One-off: re-host Discord CDN / hash-only profile pictures into Echo storage.
 *
 * Targets users whose `auth_users.pfp` still references Discord (`cdn.discordapp.com`
 * avatars or bare avatar hashes) instead of Echo uploads / data URLs.
 *
 * Usage (from backend/):
 *   npx ts-node src/scripts/backfillDiscordImportAvatarPfp.ts           # dry-run
 *   npx ts-node src/scripts/backfillDiscordImportAvatarPfp.ts --execute # apply
 *
 * Requires: DATABASE_URL and configured Echo upload storage (local dir or S3).
 */
import { closePgPool, getPgPool } from '../db/pg';
import {
  backfillDiscordImportAvatarPfpForUser,
  listUsersWithCorruptedDiscordImportPfp,
} from '../services/discordImportAvatarPfpBackfill';

const execute = process.argv.includes('--execute');

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const candidates = await listUsersWithCorruptedDiscordImportPfp(pool);
  if (candidates.length === 0) {
    console.log('No users with corrupted Discord-import pfps.');
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Re-hosting' : 'Would re-host'} ${candidates.length} user pfp(s).`,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const result = await backfillDiscordImportAvatarPfpForUser(
      pool,
      row,
      execute,
    );
    if (result.status === 'updated') {
      updated += 1;
      const preview = result.after.slice(0, 72);
      console.log(
        `  ${execute ? '✓' : '·'} ${result.userId} discord=${row.discordUserId} ` +
          `→ ${preview}${result.after.length > preview.length ? '…' : ''}`,
      );
    } else if (result.status === 'skipped') {
      skipped += 1;
      console.log(`  · ${result.userId} skipped (${result.reason})`);
    } else {
      failed += 1;
      console.log(`  ✗ ${result.userId} failed (${result.reason})`);
    }
  }

  console.log(
    `\n${execute ? 'Updated' : 'Would update'} ${updated} user(s); ` +
      `skipped ${skipped}; failed ${failed}.`,
  );
  if (!execute) {
    console.log('Dry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
