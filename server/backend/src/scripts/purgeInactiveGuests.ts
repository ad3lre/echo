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
import { hasActiveServerSessionsForUser } from '../auth/serverSession';

const execute = process.argv.includes('--execute');

const INACTIVE_GUEST_SQL = `
  SELECT u.id, u.guest_minted_at, u.created_at
  FROM auth_users u
  WHERE u.is_guest = true
    AND u.guest_minted_at IS NOT NULL
    AND u.guest_minted_at < NOW() - INTERVAL '90 days'
    AND u.updated_at < NOW() - INTERVAL '90 days'
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

  const totalGuestsRes = await pool.query<{ total_guests: string }>(
    `SELECT COUNT(*)::text AS total_guests FROM auth_users WHERE is_guest = true`,
  );
  const totalGuests = Number(totalGuestsRes.rows[0]?.total_guests ?? 0);
  const query = await pool.query<{
    id: string;
    guest_minted_at: Date;
    created_at: Date;
  }>(INACTIVE_GUEST_SQL);
  const rows = [];
  for (const row of query.rows) {
    if (!(await hasActiveServerSessionsForUser(row.id))) rows.push(row);
  }
  const inactiveCount = rows.length;
  const keepCount = totalGuests - inactiveCount;

  console.log(
    `Guests: ${totalGuests} total, ${keepCount} retained, ${inactiveCount} inactive (minted and untouched for at least 90 days, no active server session).`,
  );

  if (inactiveCount === 0) {
    console.log('Nothing to purge.');
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Deleting' : 'Would delete'} ${rows.length} inactive guest(s).`,
  );

  if (execute) {
    const deletedIds: string[] = [];
    for (const row of rows) {
      // Recheck both activity and sessions immediately before each deletion.
      if (await hasActiveServerSessionsForUser(row.id)) continue;
      const deleted = await pool.query<{ id: string }>(
        `DELETE FROM auth_users u
         WHERE u.id = $1 AND u.is_guest = true
           AND u.guest_minted_at IS NOT NULL
           AND u.guest_minted_at < NOW() - INTERVAL '90 days'
           AND u.updated_at < NOW() - INTERVAL '90 days'
           AND COALESCE(u.guest_total_messages, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM echo_messages m WHERE m.author_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM echo_dm_threads d WHERE d.user_low = u.id OR d.user_high = u.id)
           AND NOT EXISTS (SELECT 1 FROM echo_dm_message_requests r WHERE r.requester_user_id = u.id OR r.recipient_user_id = u.id)
           AND (u.guest_pending_email IS NULL OR TRIM(u.guest_pending_email) = '')
         RETURNING u.id`,
        [row.id],
      );
      if (deleted.rows[0]?.id) deletedIds.push(deleted.rows[0].id);
    }
    for (const id of deletedIds) console.log(`  ✓ ${id}`);
    console.log(
      `\nDeleted ${deletedIds.length} guest(s). ${totalGuests - deletedIds.length} remain.`,
    );
  } else {
    for (const r of rows.slice(0, 20)) {
      const ageDays = Math.floor(
        (Date.now() - new Date(r.guest_minted_at).getTime()) / 86_400_000,
      );
      console.log(`  · ${r.id} (${ageDays} days old)`);
    }
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
