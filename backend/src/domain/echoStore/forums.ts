import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { boundedInteger } from '../../shared/numberParsing';

export type EchoForumPostListSort = 'latest_activity' | 'creation_date';

export type EchoForumPostRow = {
  id: string;
  forumChannelId: string;
  title: string;
  tagIds: string[];
  pinned: boolean;
  locked: boolean;
  archivedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  lastMessagePreview: string;
  messageCount: number;
  coverImageUrl: string | null;
  /** Echo user id of the member who created this post (forum thread). */
  createdByUserId: string | null;
};

export function validateEchoForumPostCreateFirstMessagePoll(
  poll: unknown,
): { ok: true } | { ok: false; error: string } {
  if (poll === undefined || poll === null) return { ok: true };
  return {
    ok: false,
    error:
      'Polls are not allowed in the first message of a forum post. Create the post, then add a poll in a reply.',
  };
}

export async function getEchoForumChannelRow(
  pool: pg.Pool,
  forumChannelId: string,
): Promise<null | {
  id: string;
  serverId: string;
  categoryId: string | null;
  type: string;
  permissionOverrides: unknown;
  forumAvailableTags: unknown;
}> {
  const r = await pool.query(
    `SELECT id, server_id, category_id, type, permission_overrides, forum_available_tags
     FROM echo_channels
     WHERE id = $1
     LIMIT 1`,
    [forumChannelId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    categoryId: row.category_id != null ? String(row.category_id) : null,
    type: String(row.type),
    permissionOverrides: row.permission_overrides ?? null,
    forumAvailableTags: row.forum_available_tags ?? null,
  };
}

export async function listEchoForumPosts(
  pool: pg.Pool,
  forumChannelId: string,
  opts?: {
    sort?: EchoForumPostListSort;
    includeArchived?: boolean;
    limit?: number;
  },
): Promise<EchoForumPostRow[]> {
  const sort =
    opts?.sort === 'creation_date' ? 'creation_date' : 'latest_activity';
  const includeArchived = opts?.includeArchived === true;
  const limit = boundedInteger(opts?.limit, 50, 1, 200);

  const whereArchived = includeArchived
    ? ``
    : `AND ch.forum_post_archived_at IS NULL`;

  const order =
    sort === 'creation_date'
      ? `ch.forum_post_pinned DESC, ch.created_at DESC, ch.id DESC`
      : `ch.forum_post_pinned DESC, COALESCE(last_msg.last_message_at, ch.created_at) DESC, ch.id DESC`;

  const r = await pool.query(
    `
    SELECT
      ch.id,
      ch.parent_channel_id,
      ch.name,
      ch.created_at,
      ch.forum_post_tag_ids,
      ch.forum_post_pinned,
      ch.forum_post_locked,
      ch.forum_post_archived_at,
      ch.forum_post_creator_user_id,
      COALESCE(last_msg.last_message_at, ch.created_at) AS last_activity_at,
      COALESCE(last_msg.last_message_preview, '') AS last_message_preview,
      COALESCE(last_msg.message_count, 0) AS message_count,
      cover.cover_image_url AS cover_image_url
    FROM echo_channels ch
    LEFT JOIN LATERAL (
      SELECT
        MAX(m.created_at) AS last_message_at,
        (SELECT m2.search_index_text
          FROM echo_messages m2
          WHERE m2.channel_id = ch.id AND m2.deleted_at IS NULL
          ORDER BY m2.created_at DESC
          LIMIT 1) AS last_message_preview,
        COUNT(*)::int AS message_count
      FROM echo_messages m
      WHERE m.channel_id = ch.id AND m.deleted_at IS NULL
    ) last_msg ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          NULLIF(BTRIM(m.image_url), ''),
          (
            SELECT a->>'url'
            FROM jsonb_array_elements(m.attachments) a
            WHERE a->>'kind' = 'image' AND NULLIF(BTRIM(a->>'url'), '') IS NOT NULL
            LIMIT 1
          )
        ) AS cover_image_url
      FROM echo_messages m
      WHERE
        m.channel_id = ch.id
        AND m.deleted_at IS NULL
        AND (
          (m.image_url IS NOT NULL AND BTRIM(m.image_url) <> '')
          OR (
            m.attachments IS NOT NULL
            AND jsonb_typeof(m.attachments) = 'array'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(m.attachments) a2
              WHERE a2->>'kind' = 'image' AND NULLIF(BTRIM(a2->>'url'), '') IS NOT NULL
            )
          )
        )
      ORDER BY m.created_at ASC
      LIMIT 1
    ) cover ON true
    WHERE ch.parent_channel_id = $1
      ${whereArchived}
    ORDER BY ${order}
    LIMIT $2
    `,
    [forumChannelId, limit],
  );

  return r.rows.map((row: any) => ({
    id: String(row.id),
    forumChannelId: String(row.parent_channel_id),
    title: String(row.name),
    tagIds: Array.isArray(row.forum_post_tag_ids)
      ? row.forum_post_tag_ids.filter((x: any) => typeof x === 'string')
      : [],
    pinned: row.forum_post_pinned === true,
    locked: row.forum_post_locked === true,
    archivedAt:
      row.forum_post_archived_at != null
        ? new Date(String(row.forum_post_archived_at)).toISOString()
        : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastActivityAt: new Date(String(row.last_activity_at)).toISOString(),
    lastMessagePreview: String(row.last_message_preview ?? ''),
    messageCount: Number(row.message_count ?? 0),
    coverImageUrl:
      typeof row.cover_image_url === 'string' && row.cover_image_url.trim()
        ? String(row.cover_image_url)
        : null,
    createdByUserId:
      row.forum_post_creator_user_id != null &&
      String(row.forum_post_creator_user_id).trim()
        ? String(row.forum_post_creator_user_id)
        : null,
  }));
}

export async function patchEchoForumPost(
  pool: pg.Pool,
  postChannelId: string,
  patch: {
    tagIds?: unknown;
    pinned?: boolean;
    locked?: boolean;
    archivedAt?: string | null;
  },
): Promise<'ok' | 'not_found'> {
  const tagIds = patch.tagIds;
  const pinned = patch.pinned === true;
  const locked = patch.locked === true;
  const archivedAt =
    patch.archivedAt === null
      ? null
      : typeof patch.archivedAt === 'string' && patch.archivedAt.trim()
        ? new Date(patch.archivedAt.trim())
        : undefined;

  const r = await pool.query(
    `
    UPDATE echo_channels
    SET
      forum_post_tag_ids = COALESCE($2, forum_post_tag_ids),
      forum_post_pinned = COALESCE($3, forum_post_pinned),
      forum_post_locked = COALESCE($4, forum_post_locked),
      forum_post_archived_at = COALESCE($5, forum_post_archived_at)
    WHERE id = $1
    RETURNING server_id
    `,
    [
      postChannelId,
      tagIds === undefined ? null : tagIds,
      patch.pinned === undefined ? null : pinned,
      patch.locked === undefined ? null : locked,
      patch.archivedAt === undefined ? null : archivedAt,
    ],
  );
  if (r.rows.length === 0) return 'not_found';
  const sid = String(r.rows[0]!.server_id);
  invalidateEchoPermissionCacheForServer(sid);
  return 'ok';
}

export async function copyEchoChannelPermissionOverwrites(
  pool: pg.Pool,
  serverId: string,
  fromChannelId: string,
  toChannelId: string,
): Promise<void> {
  const base = await pool.query(
    `SELECT permission_overrides FROM echo_channels WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, fromChannelId],
  );
  const perm = base.rows[0]?.permission_overrides ?? null;
  await pool.query(
    `UPDATE echo_channels SET permission_overrides = $1 WHERE server_id = $2 AND id = $3`,
    [perm, serverId, toChannelId],
  );

  const rows = await pool.query(
    `SELECT target_type, target_id, partial
     FROM echo_channel_permission_overwrite_rows
     WHERE server_id = $1 AND channel_id = $2`,
    [serverId, fromChannelId],
  );
  if (rows.rows.length === 0) return;

  for (const row of rows.rows) {
    await pool.query(
      `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        nextEchoSnowflakeId(),
        serverId,
        toChannelId,
        String(row.target_type),
        row.target_id != null ? String(row.target_id) : null,
        row.partial ?? {},
      ],
    );
  }
}
