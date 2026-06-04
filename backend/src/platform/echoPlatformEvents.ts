import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { EchoWorkspaceEvent } from '../../../shared/types/socket';
import { canUserAccessChannel } from '../domain/echoPermissions';
import { getPgPool } from '../db/pg';
import { echoWorkspaceEventPublishedTotal } from '../observability/echoMetrics';
import { botEventBus } from './botEventBus';

function getIo(fastify: FastifyInstance): Server | null {
  return (fastify as FastifyInstance & { io?: Server }).io ?? null;
}

/** Platform-level publisher for versioned Echo workspace/server-state events. */
export function publishEchoWorkspaceEvent(
  fastify: FastifyInstance,
  payload: EchoWorkspaceEvent,
  targets?: { serverId?: string; userId?: string },
): void {
  const io = getIo(fastify);
  if (!io) return;
  echoWorkspaceEventPublishedTotal.inc({ kind: payload.kind });
  if (targets?.serverId) {
    io.to(`echo:server:${targets.serverId}`).emit(
      'echo:workspace_event',
      payload,
    );
  }
  if (targets?.userId) {
    io.to(`echo:user:${targets.userId}`).emit('echo:workspace_event', payload);
  }
  if (!targets?.serverId && !targets?.userId) {
    io.emit('echo:workspace_event', payload);
  }
  botEventBus.emitBotEvent({ kind: 'workspace', payload });
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
