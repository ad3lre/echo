import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { insertEchoAudit } from '../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../platform/echoPlatformEvents';

/**
 * After a user changes profile fields that other members see (banner, pfp, etc.),
 * bump audit + emit `workspace_invalidated` on each guild they belong to so peers
 * refetch workspace (new `workspaceVersion`) and apply member rows with fresh data.
 */
export async function fanoutUserProfileChangeToEchoServers(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  const r = await pool.query(
    `SELECT server_id FROM echo_server_members WHERE user_id = $1`,
    [userId],
  );
  for (const row of r.rows as { server_id?: unknown }[]) {
    const serverId = String(row.server_id ?? '').trim();
    if (!serverId) continue;
    const auditId = await insertEchoAudit(
      pool,
      serverId,
      userId,
      'user.profile',
      'user',
      userId,
      null,
    );
    publishEchoWorkspaceEvent(
      fastify,
      {
        kind: 'workspace_invalidated',
        version: auditId,
        serverId,
      },
      { serverId },
    );
  }
}
