import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  deleteEchoVoiceParticipantsForUsers,
  insertEchoAudit,
} from '../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../platform/echoPlatformEvents';
import { vcTrace } from '../observability/voiceTraceLog';

export async function pruneOfflineUsersFromAllVoiceChannels(opts: {
  fastify: FastifyInstance;
  pool: pg.Pool;
  userIds: string[];
  reason: 'socket_disconnect' | 'presence_sweep';
  occurredAtMs: number;
  log?: FastifyBaseLogger;
}): Promise<{ deletedRows: number; affectedServers: number }> {
  const { fastify, pool, userIds, reason, occurredAtMs } = opts;
  const log = opts.log ?? fastify.log;
  const ids = userIds.map((x) => x.trim()).filter(Boolean);
  if (ids.length === 0) return { deletedRows: 0, affectedServers: 0 };

  vcTrace(log, 'voice.offline_prune:start', {
    reason,
    occurredAtMs,
    userCount: ids.length,
  });

  const deleted = await deleteEchoVoiceParticipantsForUsers(pool, ids);
  if (deleted.length === 0) {
    vcTrace(log, 'voice.offline_prune:no_rows', { reason, occurredAtMs });
    return { deletedRows: 0, affectedServers: 0 };
  }

  const byServer = new Map<string, typeof deleted>();
  for (const row of deleted) {
    if (!byServer.has(row.serverId)) byServer.set(row.serverId, []);
    byServer.get(row.serverId)!.push(row);
  }

  let affectedServers = 0;
  for (const [serverId, rowsForServer] of byServer) {
    if (rowsForServer.length === 0) continue;
    affectedServers += 1;
    for (const row of rowsForServer) {
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        row.userId,
        'voice.leave_offline_prune',
        'channel',
        row.channelId,
        { reason, occurredAtMs },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'workspace_invalidated', version: auditId, serverId },
        { serverId },
      );
    }
  }

  vcTrace(log, 'voice.offline_prune:done', {
    reason,
    occurredAtMs,
    deletedRows: deleted.length,
    affectedServers,
    serverCount: byServer.size,
  });

  return { deletedRows: deleted.length, affectedServers };
}
