import type pg from 'pg';
import { echoDirectoryExcludedNamesSql } from './constants';

/** Public-facing member row for invite / directory join previews (no user ids). */
export type EchoServerMemberHighlight = {
  name: string;
  pfp: string;
};

/**
 * Notable members for pre-join social proof: owner first, then highest role position.
 */
export async function listEchoServerMemberHighlights(
  pool: pg.Pool,
  serverId: string,
  limit = 4,
): Promise<EchoServerMemberHighlight[]> {
  const sid = serverId.trim();
  if (!sid) return [];
  const cap = Math.min(8, Math.max(1, Math.floor(limit)));
  const r = await pool.query(
    `
    WITH ranked AS (
      SELECT m.user_id,
        COALESCE(
          NULLIF(TRIM(m.nickname), ''),
          NULLIF(TRIM(u.display_name), ''),
          NULLIF(TRIM(u.username), ''),
          'Unknown'
        ) AS name,
        COALESCE(u.pfp, '') AS pfp,
        CASE WHEN m.user_id = s.owner_id THEN 1 ELSE 0 END AS is_owner,
        COALESCE(
          MAX(r.position) FILTER (WHERE r.name IS DISTINCT FROM '@everyone'),
          0
        ) AS max_role_pos
      FROM echo_server_members m
      INNER JOIN auth_users u ON u.id = m.user_id
      INNER JOIN echo_servers s ON s.id = m.server_id
      LEFT JOIN echo_member_roles mr
        ON mr.server_id = m.server_id AND mr.user_id = m.user_id
      LEFT JOIN echo_roles r ON r.id = mr.role_id AND r.server_id = m.server_id
      WHERE m.server_id = $1
      GROUP BY m.user_id, m.nickname, u.display_name, u.username, u.pfp, s.owner_id
    )
    SELECT name, pfp
    FROM ranked
    ORDER BY is_owner DESC, max_role_pos DESC, LOWER(name) ASC, user_id ASC
    LIMIT $2
    `,
    [sid, cap],
  );
  const out: EchoServerMemberHighlight[] = [];
  for (const row of r.rows as Record<string, unknown>[]) {
    const name = String(row.name ?? 'Unknown').trim() || 'Unknown';
    const pfp = String(row.pfp ?? '').trim();
    out.push({ name, pfp });
  }
  return out;
}

/** Same as {@link listEchoServerMemberHighlights} but only for Explore-listed servers. */
export async function listEchoDirectoryServerMemberHighlights(
  pool: pg.Pool,
  serverId: string,
  limit = 4,
): Promise<EchoServerMemberHighlight[] | null> {
  const sid = serverId.trim();
  if (!sid) return null;
  const exclude = echoDirectoryExcludedNamesSql();
  const r = await pool.query(
    `
    SELECT id FROM echo_servers
    WHERE id = $1 AND listed_in_directory = true AND ${exclude}
    LIMIT 1
    `,
    [sid],
  );
  if (!r.rows[0]) return null;
  return listEchoServerMemberHighlights(pool, sid, limit);
}
