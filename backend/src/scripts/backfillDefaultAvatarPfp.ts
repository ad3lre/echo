/**
 * One-off: set `pfp` to the generated SVG data URL for users with empty `pfp`.
 *
 * Usage (from repo root or backend/):
 *   npx ts-node src/scripts/backfillDefaultAvatarPfp.ts           # dry-run
 *   npx ts-node src/scripts/backfillDefaultAvatarPfp.ts --execute # apply
 */
import { generateDefaultAvatarPfp } from '../auth/defaultAvatarPfp';
import { closePgPool, getPgPool } from '../db/pg';

const execute = process.argv.includes('--execute');

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const { rows } = await pool.query<{
    id: string;
    username: string;
    display_name: string | null;
  }>(
    `SELECT id, username, display_name FROM auth_users
     WHERE pfp IS NULL OR TRIM(pfp) = ''`,
  );

  if (rows.length === 0) {
    console.log('No users with empty pfp.');
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Updating' : 'Would update'} ${rows.length} user(s).`,
  );

  for (const r of rows) {
    const displayName =
      String(r.display_name ?? '').trim() || String(r.username);
    const pfp = generateDefaultAvatarPfp(displayName);
    if (execute) {
      await pool.query(
        `UPDATE auth_users SET pfp = $2, updated_at = NOW() WHERE id = $1`,
        [r.id, pfp],
      );
    }
    console.log(`  ${execute ? '✓' : '·'} ${r.id} (${displayName})`);
  }

  if (!execute) {
    console.log('\nDry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
