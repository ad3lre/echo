import type pg from 'pg';
import { serializeUser } from '../serializers';

export type DiscordApiAuthorRow = {
  id: string;
  username: string;
  displayName: string;
  pfp?: string;
};

/** Batch-load auth users for Discord API message serialization (avoids sequential N+1). */
export async function loadDiscordApiAuthorsByIds(
  pool: pg.Pool,
  authorIds: string[],
): Promise<Map<string, ReturnType<typeof serializeUser>>> {
  const ids = [...new Set(authorIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, ReturnType<typeof serializeUser>>();
  if (ids.length === 0) return out;
  const r = await pool.query<{
    id: string;
    username: string;
    display_name: string | null;
    pfp: string | null;
  }>(
    `SELECT id, username, display_name, pfp FROM auth_users WHERE id = ANY($1::text[])`,
    [ids],
  );
  for (const row of r.rows) {
    out.set(
      String(row.id),
      serializeUser({
        id: String(row.id),
        username: String(row.username),
        displayName: String(row.display_name ?? row.username),
        pfp: row.pfp ?? undefined,
      }),
    );
  }
  return out;
}
