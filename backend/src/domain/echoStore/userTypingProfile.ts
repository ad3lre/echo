import type pg from 'pg';

/**
 * Minimal profile for typing indicators (display name + avatar URL from `auth_users`).
 */
export async function getEchoUserTypingProfile(
  pool: pg.Pool,
  userId: string,
): Promise<{ displayName: string; avatarUrl: string }> {
  const r = await pool.query(
    `SELECT username,
            COALESCE(NULLIF(TRIM(display_name), ''), '') AS display_name,
            COALESCE(pfp, '') AS pfp
       FROM auth_users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );
  const row = r.rows[0] as
    | { username: string; display_name: string; pfp: string }
    | undefined;
  if (!row) {
    return { displayName: 'Someone', avatarUrl: '' };
  }
  const dn =
    typeof row.display_name === 'string' ? row.display_name.trim() : '';
  const un = typeof row.username === 'string' ? row.username.trim() : '';
  const displayName = dn || un || 'Someone';
  const avatarUrl = typeof row.pfp === 'string' ? row.pfp.trim() : '';
  return { displayName, avatarUrl };
}

export type EchoUserPublicProfileRow = {
  id: string;
  name: string;
  pfp: string;
  username?: string;
};

/** Row shape for GET `/users/:id/profile` when visibility checks pass. */
export async function getEchoUserPublicProfileRow(
  pool: pg.Pool,
  userId: string,
): Promise<EchoUserPublicProfileRow | null> {
  const id = userId.trim();
  if (!id) return null;
  const r = await pool.query(
    `SELECT id, username,
            COALESCE(NULLIF(TRIM(display_name), ''), '') AS display_name,
            COALESCE(pfp, '') AS pfp
       FROM auth_users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0] as
    | { id: string; username: string; display_name: string; pfp: string }
    | undefined;
  if (!row) return null;
  const dn =
    typeof row.display_name === 'string' ? row.display_name.trim() : '';
  const un = typeof row.username === 'string' ? row.username.trim() : '';
  const name = dn || un || 'Someone';
  return {
    id: String(row.id),
    name,
    pfp: typeof row.pfp === 'string' ? row.pfp.trim() : '',
    ...(un ? { username: un } : {}),
  };
}
