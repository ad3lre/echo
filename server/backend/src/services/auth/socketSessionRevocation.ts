import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { appendBackendDiagnostic } from '../../observability/sessionDiagnostics';

function userRoom(userId: string): string {
  return `echo:user:${userId}`;
}

function getSocketServer(fastify: FastifyInstance): Server | null {
  const candidate = (fastify as FastifyInstance & { io?: Server }).io;
  return candidate ?? null;
}

async function disconnectMatchingSockets(
  fastify: FastifyInstance,
  userId: string,
  predicate: (socket: {
    data: { authSessionId?: string; authenticated?: boolean };
    disconnect: (close?: boolean) => void;
  }) => boolean,
): Promise<number> {
  const io = getSocketServer(fastify);
  if (!io) return 0;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  let disconnected = 0;
  for (const socket of sockets) {
    if (!predicate(socket)) continue;
    disconnected += 1;
    socket.disconnect(true);
  }
  return disconnected;
}

async function logSocketRevocation(
  log: FastifyBaseLogger,
  userId: string,
  reason: string,
  disconnectedCount: number,
): Promise<void> {
  log.info(
    {
      userId,
      disconnectedCount,
      reason,
      msg: 'echo.auth.socket_revocation',
    },
    'Disconnected authenticated sockets after auth session revocation',
  );
  await appendBackendDiagnostic({
    level: 'info',
    domain: 'socket',
    event: 'socket_session_revocation',
    stage: 'success',
    context: {
      userId,
      reason,
      disconnectedCount,
    },
  });
}

export async function disconnectSocketsForAuthSession(
  fastify: FastifyInstance,
  userId: string,
  authSessionId: string,
  reason: string,
): Promise<void> {
  const disconnectedCount = await disconnectMatchingSockets(
    fastify,
    userId,
    (socket) =>
      socket.data.authenticated === true &&
      socket.data.authSessionId === authSessionId,
  );
  await logSocketRevocation(fastify.log, userId, reason, disconnectedCount);
}

export async function disconnectAllSocketsForAuthUser(
  fastify: FastifyInstance,
  userId: string,
  reason: string,
): Promise<void> {
  const disconnectedCount = await disconnectMatchingSockets(
    fastify,
    userId,
    (socket) => socket.data.authenticated === true,
  );
  await logSocketRevocation(fastify.log, userId, reason, disconnectedCount);
}
