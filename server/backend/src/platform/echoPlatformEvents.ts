import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { EchoWorkspaceEvent } from '../../../../contracts/types/socket';
import { canUserAccessChannel } from '../domain/permissions/echoPermissions';
import {
  claimEchoWorkspaceEventOutbox,
  insertEchoWorkspaceEventOutboxProcessing,
  markEchoWorkspaceEventOutboxDelivered,
  markEchoWorkspaceEventOutboxFailed,
  pruneEchoWorkspaceEventOutbox,
} from '../domain/echoStore/platform/workspaceEventOutbox';
import { getPgPool } from '../db/pg';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { echoWorkspaceEventPublishedTotal } from '../observability/echoMetrics';
import { botEventBus } from './botEventBus';

function getIo(fastify: FastifyInstance): Server | null {
  return (fastify as FastifyInstance & { io?: Server }).io ?? null;
}

/**
 * Only facts or invalidations with a useful meaning after reconnect belong in
 * the durable outbox. Presence-like snapshots and voice deltas have their own
 * current-state reconciliation paths and must not be replayed stale.
 */
const DURABLE_WORKSPACE_EVENT_KINDS = new Set<EchoWorkspaceEvent['kind']>([
  'workspace_invalidated',
  'membership_changed',
  'role_graph_changed',
  'channel_tree_changed',
  'server_updated',
  'permission_invalidated',
  'friend_requests_changed',
  'discord_export_ready',
  'voice_mls_message',
  'paper_document_updated',
  'paper_comment_updated',
  'ticket_created',
  'ticket_updated',
]);

async function dispatchEchoWorkspaceEvent(
  fastify: FastifyInstance,
  payload: EchoWorkspaceEvent,
  targets?: { serverId?: string; userId?: string },
): Promise<void> {
  const io = getIo(fastify);
  if (!io) return;
  echoWorkspaceEventPublishedTotal.inc({ kind: payload.kind });
  botEventBus.emitBotEvent({ kind: 'workspace', payload });
  if (targets?.serverId) {
    const pool = getPgPool();
    if (pool) {
      const sockets = await io
        .in(`echo:server:${targets.serverId}`)
        .fetchSockets();
      await Promise.all(
        sockets.map(async (socket) => {
          if (!socket.data?.authenticated) return;
          const userId = String(socket.data.userId ?? '').trim();
          if (!userId) return;
          const member = await pool.query(
            `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2 LIMIT 1`,
            [targets.serverId, userId],
          );
          if ((member.rowCount ?? 0) > 0) {
            socket.emit('echo:workspace_event', payload);
          }
        }),
      );
    }
  }
  if (targets?.userId) {
    io.to(`echo:user:${targets.userId}`).emit('echo:workspace_event', payload);
  }
  if (!targets?.serverId && !targets?.userId) {
    io.emit('echo:workspace_event', payload);
  }
}

/** Platform-level publisher for versioned Echo workspace/server-state events. */
export function publishEchoWorkspaceEvent(
  fastify: FastifyInstance,
  payload: EchoWorkspaceEvent,
  targets?: { serverId?: string; userId?: string },
): void {
  // Keep the existing immediate fanout semantics for request paths. The
  // outbox is recorded asynchronously so callers do not need to become async.
  void dispatchEchoWorkspaceEvent(fastify, payload, targets).catch((error) => {
    fastify.log.warn(
      { err: error, kind: payload.kind, targets },
      'echo.workspace_event_dispatch_failed',
    );
  });

  if (!DURABLE_WORKSPACE_EVENT_KINDS.has(payload.kind)) return;
  const pool = getPgPool();
  if (!pool) return;
  const id = nextEchoSnowflakeId();
  void insertEchoWorkspaceEventOutboxProcessing(pool, {
    id,
    payload,
    targets,
  })
    .then(() => markEchoWorkspaceEventOutboxDelivered(pool, id))
    .catch((error) => {
      fastify.log.warn(
        { err: error, eventId: id, kind: payload.kind },
        'echo.workspace_event_outbox_persist_failed',
      );
    });
}

/** Replay events whose immediate publisher was interrupted or failed. */
export async function drainEchoWorkspaceEventOutbox(
  fastify: FastifyInstance,
  limit: number,
): Promise<{ delivered: number; failed: number }> {
  const pool = getPgPool();
  if (!pool || !getIo(fastify)) return { delivered: 0, failed: 0 };
  const rows = await claimEchoWorkspaceEventOutbox(pool, limit);
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await dispatchEchoWorkspaceEvent(fastify, row.payload, {
        ...(row.targetServerId ? { serverId: row.targetServerId } : {}),
        ...(row.targetUserId ? { userId: row.targetUserId } : {}),
      });
      await markEchoWorkspaceEventOutboxDelivered(pool, row.id);
      delivered += 1;
    } catch (error) {
      failed += 1;
      await markEchoWorkspaceEventOutboxFailed(pool, {
        id: row.id,
        attempts: row.attempts,
        error: error instanceof Error ? error.message : String(error),
        maxAttempts: 12,
      });
      fastify.log.warn(
        { err: error, eventId: row.id, kind: row.payload.kind },
        'echo.workspace_event_outbox_delivery_failed',
      );
    }
  }
  return { delivered, failed };
}

export async function pruneEchoWorkspaceEventOutboxRows(): Promise<number> {
  const pool = getPgPool();
  if (!pool) return 0;
  return pruneEchoWorkspaceEventOutbox(pool);
}

/**
 * Publish an immediate voice roster delta to all members of a guild server.
 * This is a Discord-Gateway-style push (like VOICE_STATE_UPDATE) — clients apply it
 * in-place to their cached `voiceParticipantIds` / mute-deaf maps without a full
 * workspace refetch. `workspace_invalidated` is still emitted separately as the
 * eventual-correctness fallback.
 */
/**
 * Notify call participants that a new MLS handshake message (voice E2EE v2) was
 * appended to a channel's delivery log. Guild channels fan out to the server
 * room; DM/group-DM calls fan out to each member's user room (no server room).
 * The payload carries only routing metadata — never key material.
 */
export function publishVoiceMlsMessage(
  fastify: FastifyInstance,
  args: {
    version: string;
    serverId: string;
    channelId: string;
    groupId: string;
    seq: string;
    epoch: string;
    msgType: 'commit' | 'proposal' | 'welcome';
    recipientUserId?: string;
    recipientDeviceId?: string;
    /** When set (DM/group-DM), fan out to these user rooms instead of a server room. */
    dmMemberUserIds?: string[];
  },
): void {
  const event: EchoWorkspaceEvent = {
    kind: 'voice_mls_message',
    version: args.version,
    serverId: args.serverId,
    voiceChannelId: args.channelId,
    voiceMls: {
      serverId: args.serverId,
      channelId: args.channelId,
      groupId: args.groupId,
      seq: args.seq,
      epoch: args.epoch,
      msgType: args.msgType,
      ...(args.recipientUserId
        ? { recipientUserId: args.recipientUserId }
        : {}),
      ...(args.recipientDeviceId
        ? { recipientDeviceId: args.recipientDeviceId }
        : {}),
    },
  };
  if (args.dmMemberUserIds && args.dmMemberUserIds.length > 0) {
    for (const uid of args.dmMemberUserIds) {
      publishEchoWorkspaceEvent(fastify, event, { userId: uid });
    }
    return;
  }
  publishEchoWorkspaceEvent(fastify, event, { serverId: args.serverId });
}

export function publishVoiceRosterDelta(
  fastify: FastifyInstance,
  serverId: string,
  delta: Omit<
    NonNullable<EchoWorkspaceEvent['voiceRosterDelta']>,
    'serverId' | 'workspaceVersion' | 'occurredAt'
  >,
  auditVersion: string,
): void {
  void publishVoiceRosterDeltaFiltered(
    fastify,
    serverId,
    delta,
    auditVersion,
  ).catch(() => {
    /* best-effort realtime; workspace_invalidated remains the correctness fallback */
  });
}

/**
 * Fan out voice roster deltas only to sockets whose user can access the voice channel.
 * Broadcasting to the whole server room would leak private/staff channel attendance.
 */
async function publishVoiceRosterDeltaFiltered(
  fastify: FastifyInstance,
  serverId: string,
  delta: Omit<
    NonNullable<EchoWorkspaceEvent['voiceRosterDelta']>,
    'serverId' | 'workspaceVersion' | 'occurredAt'
  >,
  auditVersion: string,
): Promise<void> {
  const io = getIo(fastify);
  if (!io) return;

  const channelId =
    typeof delta.channelId === 'string' ? delta.channelId.trim() : '';
  if (!channelId) return;

  const occurredAt = new Date().toISOString();
  const payload: EchoWorkspaceEvent = {
    kind: 'voice_roster_delta',
    version: auditVersion,
    serverId,
    voiceRosterDelta: {
      ...delta,
      serverId,
      workspaceVersion: auditVersion,
      occurredAt,
    },
  };

  echoWorkspaceEventPublishedTotal.inc({ kind: payload.kind });
  botEventBus.emitBotEvent({ kind: 'workspace', payload });

  const pool = getPgPool();
  if (!pool) return;

  const room = io.sockets.adapter.rooms.get(`echo:server:${serverId}`);
  if (!room) return;

  await Promise.all(
    [...room].map(async (socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket?.data?.authenticated) return;
      const userId = socket.data.userId;
      if (typeof userId !== 'string' || !userId || userId.startsWith('user_')) {
        return;
      }
      try {
        if (await canUserAccessChannel(pool, userId, channelId)) {
          socket.emit('echo:workspace_event', payload);
        }
      } catch {
        /* skip broken socket evaluation */
      }
    }),
  );
}
