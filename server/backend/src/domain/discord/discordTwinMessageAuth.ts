import type pg from 'pg';

/**
 * True when `actorUserId` may edit/delete a message authored by `messageAuthorId`:
 * same user, or `messageAuthorId` is a Discord import shadow tied to the same
 * Discord account as `actorUserId` via `auth_discord_user_links`.
 */
export async function isEchoMessageAuthorOrLinkedTwin(
  pool: pg.Pool,
  actorUserId: string,
  messageAuthorId: string,
): Promise<boolean> {
  const actor = actorUserId?.trim();
  const author = messageAuthorId?.trim();
  if (!actor || !author) return false;
  if (actor === author) return true;
  const q = await pool.query(
    `SELECT 1
     FROM echo_discord_shadow_users s
     INNER JOIN auth_discord_user_links l
       ON l.discord_user_id = s.discord_user_id
     WHERE s.shadow_user_id = $1 AND l.user_id = $2
     LIMIT 1`,
    [author, actor],
  );
  return q.rows.length > 0;
}
