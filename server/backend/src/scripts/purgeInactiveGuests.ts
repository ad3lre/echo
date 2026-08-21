/**
 * Hard-deletes onboarding guests with no meaningful product interaction.
 * Keeps guests who sent messages, participated in DMs, or started account upgrade.
 * Auto-join to the official server alone does not count as interaction.
 *
 *   npx ts-node src/scripts/purgeInactiveGuests.ts           # dry-run
 *   npx ts-node src/scripts/purgeInactiveGuests.ts --execute
 *
 * Env: `DATABASE_URL` (same as the running server).
 */
import { closePgPool, getPgPool } from '../db/pg';

const execute = process.argv.includes('--execute');

const INACTIVE_GUEST_SQL = `
  SELECT u.id
  FROM auth_users u
  WHERE u.is_guest = true
    AND COALESCE(u.guest_total_messages, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM echo_messages m WHERE m.author_id = u.id)
    AND NOT EXISTS (
      SELECT 1 FROM echo_dm_threads d
      WHERE d.user_low = u.id OR d.user_high = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM echo_dm_message_requests r
      WHERE r.requester_user_id = u.id OR r.recipient_user_id = u.id
    )
    AND (u.guest_pending_email IS NULL OR TRIM(u.guest_pending_email) = '')
`;

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const stats = await pool.query<{
    total_guests: string;
    inactive: string;
  }>(`
    WITH inactive AS (${INACTIVE_GUEST_SQL})
    SELECT
      (SELECT COUNT(*)::text FROM auth_users WHERE is_guest = true) AS total_guests,
      (SELECT COUNT(*)::text FROM inactive) AS inactive
  `);

  const inactiveCount = Number(stats.rows[0]?.inactive ?? 0);
  const totalGuests = Number(stats.rows[0]?.total_guests ?? 0);
  const keepCount = totalGuests - inactiveCount;

  console.log(
    `Guests: ${totalGuests} total, ${keepCount} with interaction (keeping), ${inactiveCount} inactive.`,
  );

  if (inactiveCount === 0) {
    console.log('Nothing to purge.');
    await closePgPool();
    return;
  }

  const { rows } = await pool.query<{ id: string }>(INACTIVE_GUEST_SQL);

  console.log(
    `${execute ? 'Deleting' : 'Would delete'} ${rows.length} inactive guest(s).`,
  );

  if (execute) {
    const deleted = await pool.query<{ id: string }>(
      `DELETE FROM auth_users WHERE id IN (${INACTIVE_GUEST_SQL}) RETURNING id`,
    );
    for (const r of deleted.rows) console.log(`  ✓ ${r.id}`);
    console.log(
      `\nDeleted ${deleted.rowCount ?? 0} guest(s). ${keepCount} remain.`,
    );
  } else {
    for (const r of rows.slice(0, 20)) console.log(`  · ${r.id}`);
    if (rows.length > 20) {
      console.log(`  · … and ${rows.length - 20} more`);
    }
    console.log('\nDry run. Re-run with --execute to apply.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
