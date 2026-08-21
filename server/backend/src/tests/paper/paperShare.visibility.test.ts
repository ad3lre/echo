/**
 * Run: node --import tsx server/backend/src/tests/paper/paperShare.visibility.test.ts
 * Requires DATABASE_URL.
 */
import { getPgPool } from '../../db/pg';
import { ensureAppSchema } from '../../db/ensureAppSchema';
import {
  assertPaperContentVisibleToUser,
  getPaperShareRow,
  updatePaperShareVisibility,
} from '../../domain/echoStore/paper/paperShare';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function run(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('paperShare.visibility.test: skip (no DATABASE_URL)');
    return;
  }
  await ensureAppSchema(pool);

  const ts = Date.now();
  const serverId = `test-paper-srv-${ts}`;
  const channelId = `test-paper-ch-${ts}`;
  const authorId = `test-paper-author-${ts}`;
  const viewerId = `test-paper-viewer-${ts}`;

  await pool.query(
    `INSERT INTO auth_users (id, username, password_hash, is_guest)
     VALUES ($1, $2, NULL, true), ($3, $4, NULL, true)
     ON CONFLICT (id) DO NOTHING`,
    [authorId, `author_${ts}`, viewerId, `viewer_${ts}`],
  );

  await pool.query(
    `INSERT INTO echo_servers (id, name, owner_id)
     VALUES ($1, 'Paper test', $2)
     ON CONFLICT (id) DO NOTHING`,
    [serverId, authorId],
  );

  await pool.query(
    `INSERT INTO echo_channels (id, server_id, name, type)
     VALUES ($1, $2, 'Test paper', 'paper')
     ON CONFLICT (id) DO NOTHING`,
    [channelId, serverId],
  );

  await pool.query(
    `INSERT INTO echo_paper_documents (channel_id, content_json)
     VALUES ($1, '{"type":"doc","content":[]}'::jsonb)
     ON CONFLICT (channel_id) DO NOTHING`,
    [channelId],
  );

  const updated = await updatePaperShareVisibility(
    pool,
    channelId,
    authorId,
    'private',
  );
  assert(updated.ok, 'manager should update visibility');

  const share = await getPaperShareRow(pool, channelId);
  assert(share?.visibility === 'private', 'visibility should be private');

  const viewerDenied = await assertPaperContentVisibleToUser(
    pool,
    channelId,
    viewerId,
  );
  assert(!viewerDenied.ok, 'non-author should be denied on private paper');

  console.log('paperShare.visibility.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
