/**
 * Run: node --import tsx server/backend/src/tests/unfurl/stageYoutubeBroadcast.claim.test.ts
 * Requires DATABASE_URL.
 */
import { getPgPool } from '../../db/pg';
import { ensureAppSchema } from '../../db/ensureAppSchema';
import {
  getStageYoutubeBroadcast,
  tryClaimStageYoutubeBroadcastStart,
  updateStageYoutubeBroadcastStatus,
  clearStageYoutubeBroadcast,
} from '../../domain/youtube/stageYoutubeBroadcastRepo';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function run(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('stageYoutubeBroadcast.claim.test: skip (no DATABASE_URL)');
    return;
  }
  await ensureAppSchema(pool);

  const serverId = `test-srv-yt-${Date.now()}`;
  const channelId = `test-ch-yt-${Date.now()}`;
  const userId = `test-user-yt-${Date.now()}`;

  await pool.query(
    `INSERT INTO auth_users (id, username, password_hash, is_guest)
     VALUES ($1, $2, NULL, true)
     ON CONFLICT (id) DO NOTHING`,
    [userId, `yt_claim_${Date.now()}`],
  );

  const claimed1 = await tryClaimStageYoutubeBroadcastStart(pool, {
    serverId,
    channelId,
    startedByUserId: userId,
    youtubeLinkUserId: userId,
    privacyStatus: 'unlisted',
    title: 'Claim test',
  });
  assert(claimed1, 'first claim');

  const claimed2 = await tryClaimStageYoutubeBroadcastStart(pool, {
    serverId,
    channelId,
    startedByUserId: userId,
    youtubeLinkUserId: userId,
    privacyStatus: 'unlisted',
    title: 'Claim test 2',
  });
  assert(!claimed2, 'second claim while starting blocked');

  await updateStageYoutubeBroadcastStatus(pool, serverId, channelId, {
    status: 'ended',
    ended: true,
  });
  await clearStageYoutubeBroadcast(pool, serverId, channelId);

  const claimed3 = await tryClaimStageYoutubeBroadcastStart(pool, {
    serverId,
    channelId,
    startedByUserId: userId,
    youtubeLinkUserId: userId,
    privacyStatus: 'public',
    title: 'After end',
  });
  assert(claimed3, 'claim after ended');

  const row = await getStageYoutubeBroadcast(pool, serverId, channelId);
  assert(row?.privacyStatus === 'public', 'privacy updated');

  await clearStageYoutubeBroadcast(pool, serverId, channelId);
  await pool.query(`DELETE FROM auth_users WHERE id = $1`, [userId]);

  console.log('stageYoutubeBroadcast.claim.test: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
