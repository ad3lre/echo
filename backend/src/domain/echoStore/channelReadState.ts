import type pg from 'pg';
export { upsertEchoChannelReadState } from '../echoMessagesDal';

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
