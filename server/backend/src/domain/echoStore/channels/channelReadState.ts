import type pg from 'pg';
export { upsertEchoChannelReadState } from '../../echoMessagesDal';

export async function getEchoChannelReadState(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT last_read_message_id FROM echo_channel_read_state WHERE user_id = $1 AND channel_id = $2`,
    [userId, channelId],
  );
  const row = r.rows[0];
  return row ? String(row.last_read_message_id) : null;
}

export async function listEchoChannelReadStatesForUsersOnChannel(
  pool: pg.Pool,
  channelId: string,
  userIds: string[],
): Promise<Record<string, string | null>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const ch = channelId.trim();
  const out: Record<string, string | null> = {};
  if (!ch || ids.length === 0) return out;
  for (const uid of ids) out[uid] = null;
  const r = await pool.query(
    `
    SELECT user_id, last_read_message_id
    FROM echo_channel_read_state
    WHERE channel_id = $1
      AND user_id = ANY($2::text[])
    `,
    [ch, ids],
  );
  for (const row of r.rows) {
    out[String(row.user_id)] =
      row.last_read_message_id != null
        ? String(row.last_read_message_id)
        : null;
  }
  return out;
}

export async function listEchoChannelReadStatesForUser(
  pool: pg.Pool,
  userId: string,
  channelIds?: string[],
): Promise<Record<string, string | null>> {
  const ids = Array.isArray(channelIds)
    ? [...new Set(channelIds.map((id) => id.trim()).filter(Boolean))]
    : null;
  const r = ids
    ? await pool.query(
        `
        SELECT channel_id, last_read_message_id
        FROM echo_channel_read_state
        WHERE user_id = $1
          AND channel_id = ANY($2::text[])
        `,
        [userId, ids],
      )
    : await pool.query(
        `
        SELECT channel_id, last_read_message_id
        FROM echo_channel_read_state
        WHERE user_id = $1
        `,
        [userId],
      );
  const out: Record<string, string | null> = {};
  if (ids) {
    for (const channelId of ids) out[channelId] = null;
  }
  for (const row of r.rows) {
    out[String(row.channel_id)] =
      row.last_read_message_id != null
        ? String(row.last_read_message_id)
        : null;
  }
  return out;
}
