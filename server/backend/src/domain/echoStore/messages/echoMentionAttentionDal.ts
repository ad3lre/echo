/** Owns unread-mention / reply-to-self SQL for attention + mention inbox. */
import type pg from 'pg';
import { echoMessageIdPgGreaterThan } from '../../echoMessageIdPgCompare';

const MENTION_SCAN_LIMIT = 500;

function perChannelScanLimit(
  channelCount: number,
  overallLimit: number,
): number {
  return Math.min(
    40,
    Math.max(8, Math.ceil(overallLimit / Math.max(channelCount, 1))),
  );
}

/** Message is strictly after the viewer's last-read cursor (id/time tie-break). */
function sqlMsgAfterRead(alias: string): string {
  const idGt = echoMessageIdPgGreaterThan(
    `${alias}.id`,
    'rs.last_read_message_id',
  );
  return `(
    lr.id IS NULL
    OR ${alias}.created_at > lr.created_at
    OR (${alias}.created_at = lr.created_at AND ${idGt})
  )`;
}

function mapMentionFeedRow(row: Record<string, unknown>): EchoMentionFeedRow {
  return {
    id: String(row.id),
    channel_id: String(row.channel_id),
    server_id: row.server_id != null ? String(row.server_id) : null,
    author_id: String(row.author_id ?? ''),
    content: typeof row.content === 'string' ? row.content : '',
    mentions: row.mentions,
    reply_to: row.reply_to,
    created_at: new Date(row.created_at as string | Date).toISOString(),
    is_reply_to_self: row.is_reply_to_self === true,
    author_display_label: String(row.author_display_label ?? 'Unknown'),
    author_pfp:
      row.author_pfp != null ? String(row.author_pfp).trim() || null : null,
  };
}

/**
 * Bounded scan for mention-bearing unread messages (for ping kind classification).
 * Only returns rows that have non-null, non-empty `mentions` JSONB — at most
 * {@link MENTION_SCAN_LIMIT} per call so the query stays bounded.
 */
export async function selectUnreadMentionRowsForAttention(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<{ channel_id: string; id: string; mentions: unknown }[]> {
  if (channelIds.length === 0) return [];
  const perChannelLimit = perChannelScanLimit(
    channelIds.length,
    MENTION_SCAN_LIMIT,
  );
  const mAfterRead = sqlMsgAfterRead('m');
  const r = await pool.query(
    `
    WITH channels AS (SELECT UNNEST($2::text[]) AS channel_id)
    SELECT unread.channel_id, unread.id, unread.mentions
    FROM channels c
    CROSS JOIN LATERAL (
      SELECT m.channel_id, m.id, m.mentions
      FROM echo_messages m
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = $1 AND rs.channel_id = m.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      WHERE m.channel_id = c.channel_id
        AND m.deleted_at IS NULL
        AND m.author_id <> $1
        AND m.mentions IS NOT NULL
        AND m.mentions <> '[]'::jsonb
        AND m.created_at >= COALESCE(lr.created_at, '-infinity'::timestamptz)
        AND (rs.last_read_message_id IS NULL OR ${mAfterRead})
      ORDER BY m.id DESC
      LIMIT ${perChannelLimit}
    ) unread
    ORDER BY unread.id DESC
    LIMIT ${MENTION_SCAN_LIMIT}
    `,
    [userId, channelIds],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    channel_id: String(row.channel_id),
    id: String(row.id),
    mentions: row.mentions,
  }));
}

/**
 * Bounded scan for unread replies to the viewer (personal ping tier).
 * Joins quoted parent when `reply_to.authorId` is absent (legacy rows).
 */
export async function selectUnreadReplyToSelfRowsForAttention(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<{ channel_id: string; id: string }[]> {
  if (channelIds.length === 0) return [];
  const perChannelLimit = perChannelScanLimit(
    channelIds.length,
    MENTION_SCAN_LIMIT,
  );
  const mAfterRead = sqlMsgAfterRead('m');
  const r = await pool.query(
    `
    WITH channels AS (SELECT UNNEST($2::text[]) AS channel_id)
    SELECT unread.channel_id, unread.id
    FROM channels c
    CROSS JOIN LATERAL (
      SELECT m.channel_id, m.id
      FROM echo_messages m
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = $1 AND rs.channel_id = m.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      LEFT JOIN echo_messages parent
        ON parent.id = NULLIF(m.reply_to->>'messageId', '')
       AND parent.deleted_at IS NULL
      WHERE m.channel_id = c.channel_id
        AND m.deleted_at IS NULL
        AND m.author_id <> $1
        AND m.reply_to IS NOT NULL
        AND m.reply_to <> 'null'::jsonb
        AND (
          NULLIF(m.reply_to->>'authorId', '') = $1
          OR parent.author_id = $1
        )
        AND m.created_at >= COALESCE(lr.created_at, '-infinity'::timestamptz)
        AND (rs.last_read_message_id IS NULL OR ${mAfterRead})
      ORDER BY m.id DESC
      LIMIT ${perChannelLimit}
    ) unread
    ORDER BY unread.id DESC
    LIMIT ${MENTION_SCAN_LIMIT}
    `,
    [userId, channelIds],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    channel_id: String(row.channel_id),
    id: String(row.id),
  }));
}

/** Batched fan-out form of the bounded mention scan, capped per viewer. */
export async function selectUnreadMentionRowsForUsersOnChannel(
  pool: pg.Pool,
  channelId: string,
  userIds: string[],
): Promise<{ user_id: string; id: string; mentions: unknown }[]> {
  const ch = channelId.trim();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ch || ids.length === 0) return [];
  const mAfterRead = sqlMsgAfterRead('m');
  const r = await pool.query(
    `
    WITH viewers AS (SELECT UNNEST($2::text[]) AS user_id)
    SELECT v.user_id, unread.id, unread.mentions
    FROM viewers v
    CROSS JOIN LATERAL (
      SELECT m.id, m.mentions
      FROM echo_messages m
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = v.user_id AND rs.channel_id = m.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      WHERE m.channel_id = $1
        AND m.deleted_at IS NULL
        AND m.author_id <> v.user_id
        AND m.mentions IS NOT NULL
        AND m.mentions <> '[]'::jsonb
        AND m.created_at >= COALESCE(lr.created_at, '-infinity'::timestamptz)
        AND (
          rs.last_read_message_id IS NULL OR lr.id IS NULL
          OR ${mAfterRead}
        )
      ORDER BY m.id DESC
      LIMIT ${MENTION_SCAN_LIMIT}
    ) unread
    `,
    [ch, ids],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    user_id: String(row.user_id),
    id: String(row.id),
    mentions: row.mentions,
  }));
}

/** Batched per-viewer existence check for unread replies to that viewer. */
export async function selectUnreadReplyingUsersOnChannel(
  pool: pg.Pool,
  channelId: string,
  userIds: string[],
): Promise<string[]> {
  const ch = channelId.trim();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ch || ids.length === 0) return [];
  const mAfterRead = sqlMsgAfterRead('m');
  const r = await pool.query<{ user_id: string }>(
    `
    WITH viewers AS (SELECT UNNEST($2::text[]) AS user_id)
    SELECT v.user_id
    FROM viewers v
    WHERE EXISTS (
      SELECT 1
      FROM echo_messages m
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = v.user_id AND rs.channel_id = m.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      LEFT JOIN echo_messages parent
        ON parent.id = NULLIF(m.reply_to->>'messageId', '')
       AND parent.deleted_at IS NULL
      WHERE m.channel_id = $1
        AND m.deleted_at IS NULL
        AND m.author_id <> v.user_id
        AND m.reply_to IS NOT NULL
        AND m.reply_to <> 'null'::jsonb
        AND (
          NULLIF(m.reply_to->>'authorId', '') = v.user_id
          OR parent.author_id = v.user_id
        )
        AND m.created_at >= COALESCE(lr.created_at, '-infinity'::timestamptz)
        AND (
          rs.last_read_message_id IS NULL OR lr.id IS NULL
          OR ${mAfterRead}
        )
    )
    `,
    [ch, ids],
  );
  return r.rows.map((row) => String(row.user_id));
}

/** One hydrated unread mention/reply row for the server-side mention inbox feed. */
export type EchoMentionFeedRow = {
  id: string;
  channel_id: string;
  server_id: string | null;
  author_id: string;
  content: string;
  mentions: unknown;
  reply_to: unknown;
  created_at: string;
  is_reply_to_self: boolean;
  author_display_label: string;
  author_pfp: string | null;
};

function buildMentionFeedSql(
  perChannelLimit: number,
  cappedLimit: number,
): string {
  const msgAfterRead = sqlMsgAfterRead('msg');
  const replyToSelf = `(
    m.reply_to IS NOT NULL
    AND m.reply_to <> 'null'::jsonb
    AND (
      NULLIF(m.reply_to->>'authorId', '') = $1
      OR parent.author_id = $1
    )
  )`;
  // Keep SQL nesting shallow for the new-code charter (template indent counts).
  const lateralReplyPing = `(
    msg.reply_to IS NOT NULL
    AND msg.reply_to <> 'null'::jsonb
    AND (
      NULLIF(msg.reply_to->>'authorId', '') = $1
      OR parent_inner.author_id = $1
    )
  )`;
  return `
    WITH channels AS (SELECT UNNEST($2::text[]) AS channel_id)
    SELECT
      m.id,
      m.channel_id,
      ch.server_id,
      m.author_id,
      m.content,
      m.mentions,
      m.reply_to,
      m.created_at,
      ${replyToSelf} AS is_reply_to_self,
      COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown') AS author_display_label,
      TRIM(u.pfp) AS author_pfp
    FROM channels c
    CROSS JOIN LATERAL (
      SELECT
        msg.id, msg.channel_id, msg.author_id, msg.content,
        msg.mentions, msg.reply_to, msg.created_at
      FROM echo_messages msg
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = $1 AND rs.channel_id = msg.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      LEFT JOIN echo_messages parent_inner
        ON parent_inner.id = NULLIF(msg.reply_to->>'messageId', '')
       AND parent_inner.deleted_at IS NULL
      WHERE msg.channel_id = c.channel_id
        AND msg.deleted_at IS NULL
        AND msg.author_id <> $1
        AND (
          (msg.mentions IS NOT NULL AND msg.mentions <> '[]'::jsonb)
          OR ${lateralReplyPing}
        )
        AND msg.created_at >= COALESCE(lr.created_at, '-infinity'::timestamptz)
        AND (rs.last_read_message_id IS NULL OR ${msgAfterRead})
      ORDER BY msg.id DESC
      LIMIT ${perChannelLimit}
    ) m
    INNER JOIN echo_channels ch ON ch.id = m.channel_id
    LEFT JOIN auth_users u ON u.id = m.author_id
    LEFT JOIN echo_messages parent
      ON parent.id = NULLIF(m.reply_to->>'messageId', '')
     AND parent.deleted_at IS NULL
    ORDER BY m.id DESC
    LIMIT ${cappedLimit}
  `;
}

/**
 * Bounded scan returning hydrated unread rows that either mention the viewer or
 * reply to them, across the given channels. Powers `GET /attention/mentions` so
 * the client renders the mention inbox without per-channel message prefetch.
 */
export async function selectUnreadMentionFeedRowsForUser(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
  limit: number = MENTION_SCAN_LIMIT,
): Promise<EchoMentionFeedRow[]> {
  if (channelIds.length === 0) return [];
  const cappedLimit = Math.min(Math.max(limit, 1), MENTION_SCAN_LIMIT);
  const perChannelLimit = perChannelScanLimit(channelIds.length, cappedLimit);
  const r = await pool.query(
    buildMentionFeedSql(perChannelLimit, cappedLimit),
    [userId, channelIds],
  );
  return r.rows.map((row: Record<string, unknown>) => mapMentionFeedRow(row));
}
