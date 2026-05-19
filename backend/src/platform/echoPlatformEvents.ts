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
