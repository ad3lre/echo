import type pg from 'pg';
import { ECHO_DM_REALM_SERVER_ID } from './dmThreads';

export type EchoMutualServerSummary = {
  id: string;
  name: string;
  iconUrl: string;
};

/**
 * Servers both users belong to (excluding the legacy `echo` id and the DM
 * realm). Used by profile mutual-servers — far cheaper than shipping a full
 * workspace roster to the client.
 */
export async function listEchoMutualServers(
  pool: pg.Pool,
  viewerId: string,
  peerId: string,
): Promise<EchoMutualServerSummary[]> {
  const viewer = viewerId.trim();
  const peer = peerId.trim();
  if (!viewer || !peer || viewer === peer) return [];

  const r = await pool.query<{
    id: string;
    name: string;
    icon_url: string | null;
  }>(
    `
    SELECT s.id, s.name, COALESCE(s.icon_url, '') AS icon_url
    FROM echo_servers s
    INNER JOIN echo_server_members mine
      ON mine.server_id = s.id AND mine.user_id = $1
    INNER JOIN echo_server_members theirs
      ON theirs.server_id = s.id AND theirs.user_id = $2
    WHERE s.id <> 'echo'
      AND s.id <> $3
    ORDER BY LOWER(s.name) ASC, s.id ASC
    `,
    [viewer, peer, ECHO_DM_REALM_SERVER_ID],
  );

  return r.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    iconUrl: String(row.icon_url ?? '').trim(),
  }));
}
