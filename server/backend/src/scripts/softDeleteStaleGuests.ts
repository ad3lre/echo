/**
 * Marks inactive onboarding guests as soft-deleted (`guest_deleted_at`), keeping `userId` stable.
 * Activity proxy: `updated_at` (any auth profile touch bumps this).
 *
 *   npx ts-node src/scripts/softDeleteStaleGuests.ts           # dry-run
 *   npx ts-node src/scripts/softDeleteStaleGuests.ts --execute
 *
 * Env: `ECHO_GUEST_STALE_DAYS` (default 90).
 */
import { closePgPool, getPgPool } from '../db/pg';

const execute = process.argv.includes('--execute');
const days = Math.max(
  1,
  parseInt(process.env.ECHO_GUEST_STALE_DAYS ?? '90', 10) || 90,
);

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM auth_users
     WHERE is_guest = true
       AND guest_deleted_at IS NULL
       AND updated_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days],
  );

  if (rows.length === 0) {
    console.log(`No stale guests (inactive > ${days} days by updated_at).`);
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Soft-deleting' : 'Would soft-delete'} ${rows.length} guest(s) (>${days}d since updated_at).`,
  );

  if (execute) {
    await pool.query(
      `UPDATE auth_users
       SET guest_deleted_at = NOW(), updated_at = NOW()
       WHERE is_guest = true
         AND guest_deleted_at IS NULL
         AND updated_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [days],
    );
    for (const r of rows) console.log(`  ✓ ${r.id}`);
  } else {
    for (const r of rows) console.log(`  · ${r.id}`);
    console.log('\nDry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
