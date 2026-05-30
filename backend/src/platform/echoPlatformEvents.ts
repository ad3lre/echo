import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { EchoWorkspaceEvent } from '../../../shared/types/socket';
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
  const occurredAt = new Date().toISOString();
  publishEchoWorkspaceEvent(
    fastify,
    {
      kind: 'voice_roster_delta',
      version: auditVersion,
      serverId,
      voiceRosterDelta: {
        ...delta,
        serverId,
        workspaceVersion: auditVersion,
        occurredAt,
      },
    },
    { serverId },
  );
}
