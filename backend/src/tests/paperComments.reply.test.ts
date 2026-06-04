/**
 * Run: node --import tsx backend/src/tests/paperComments.reply.test.ts
 * Requires DATABASE_URL.
 */
import { getPgPool } from '../db/pg';
import { ensureAppSchema } from '../db/ensureAppSchema';
import { createEchoChannel, createEchoServer } from '../domain/echoStore';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import {
  createEchoPaperComment,
  listEchoPaperComments,
} from '../domain/echoStore/paperComments';
import { updatePaperShareVisibility } from '../domain/echoStore/paperShare';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function insertAuthUser(
  pool: Awaited<ReturnType<typeof getPgPool>>,
  id: string,
): Promise<void> {
  await pool!.query(
    `INSERT INTO auth_users (id, username, password_hash, is_guest)
     VALUES ($1, $2, NULL, true)
     ON CONFLICT (id) DO NOTHING`,
    [id, `user_${id.slice(-8)}`],
  );
}

async function run(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('paperComments.reply.test: skip (no DATABASE_URL)');
    return;
  }
  await ensureAppSchema(pool);

  const ts = Date.now();
  const ownerId = `test-paper-reply-owner-${ts}`;

  await insertAuthUser(pool, ownerId);
  const { serverId } = await createEchoServer(
    pool,
    ownerId,
    'Paper reply test',
  );

  const cat = await pool.query(
    `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
    [serverId],
  );
  const categoryId = String(cat.rows[0]!.id);

  const channelId = await createEchoChannel(
    pool,
    serverId,
    'Reply paper',
    'paper',
    categoryId,
  );
  assert(channelId !== 'invalid_category', 'paper channel should be created');

  const blockId = `block-${ts}`;
  const top = await createEchoPaperComment(pool, channelId, ownerId, {
    anchorBlockId: blockId,
    anchorFrom: 0,
    anchorTo: 4,
    anchorQuote: 'hello',
    body: 'Top-level comment',
  });
  assert(
    top.ok,
    `top-level comment should succeed: ${!top.ok ? top.error : ''}`,
  );

  const reply = await createEchoPaperComment(pool, channelId, ownerId, {
    anchorBlockId: '',
    body: 'Reply inherits anchor',
    parentCommentId: top.row.id,
  });
  assert(
    reply.ok,
    `reply without anchor should succeed: ${!reply.ok ? reply.error : ''}`,
  );
  assert(
    reply.row.anchorBlockId === blockId,
    'reply should inherit anchorBlockId',
  );
  assert(reply.row.anchorFrom === 0, 'reply should inherit anchorFrom');
  assert(reply.row.anchorTo === 4, 'reply should inherit anchorTo');
  assert(reply.row.anchorQuote === 'hello', 'reply should inherit anchorQuote');

  const privateVis = await updatePaperShareVisibility(
    pool,
    channelId,
    ownerId,
    'private',
  );
  assert(privateVis.ok, 'owner should set private visibility');

  const parentId = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_paper_comments (
       id, channel_id, anchor_block_id, anchor_from, anchor_to, anchor_quote,
       author_id, body, parent_comment_id
     ) VALUES ($1, $2, $3, 1, 2, 'q', $4, 'parent', NULL)`,
    [parentId, channelId, blockId, ownerId],
  );

  const nested = await createEchoPaperComment(pool, channelId, ownerId, {
    body: 'Nested reply',
    parentCommentId: parentId,
  });
  assert(
    nested.ok,
    `nested reply with omitted anchor should succeed: ${!nested.ok ? nested.error : ''}`,
  );
  assert(nested.row.parentCommentId === parentId, 'parent link preserved');

  const listed = await listEchoPaperComments(pool, channelId);
  assert(listed.length >= 3, 'comments should be listed');

  console.log('paperComments.reply.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
