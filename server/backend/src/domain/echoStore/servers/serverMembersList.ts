import type pg from 'pg';

export async function listEchoServerMembers(
  pool: pg.Pool,
  serverId: string,
): Promise<
  {
    userId: string;
    name: string;
    pfp: string;
    /** IANA zone from the member’s account (Magic Time). */
    timeZone: string | null;
  }[]
> {
  const r = await pool.query(
    `
    SELECT m.user_id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown') AS name,
           COALESCE(u.pfp, '') AS pfp,
           NULLIF(TRIM(u.time_zone), '') AS time_zone
    FROM echo_server_members m
    INNER JOIN auth_users u ON u.id = m.user_id
    WHERE m.server_id = $1
    ORDER BY LOWER(COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown')) ASC, m.user_id ASC
    `,
    [serverId],
  );
  return r.rows.map((row: Record<string, unknown>) => {
    const tzRaw = row.time_zone;
    const timeZone =
      typeof tzRaw === 'string' && tzRaw.trim()
        ? tzRaw.trim().slice(0, 64)
        : null;
    return {
      userId: String(row.user_id),
      name: String(row.name ?? 'Unknown'),
      pfp: String(row.pfp ?? ''),
      timeZone,
    };
  });
}
