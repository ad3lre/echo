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
