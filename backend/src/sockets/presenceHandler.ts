import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import type { Server } from 'socket.io';
import type { AuthUser } from '../auth/types';
import { config } from '../config';
import { resolveSocketPresenceSetState } from '../domain/echoPresenceAuthority';
import {
  filterEchoViewersWhoCanSeeSubject,
  getEchoPresenceState,
  getEchoStore,
  touchEchoPresence,
  upsertEchoPresence,
} from '../domain/echoStore';
import { getAllConnectedUserIds } from './userSocketIndex';

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

function normalizePresenceActiveClient(payload: unknown): 'web' | 'mobile' {
  if (!payload || typeof payload !== 'object') return 'web';
  const c = (payload as { client?: unknown }).client;
  return c === 'mobile' ? 'mobile' : 'web';
}

function emitPresenceUpdate(
  io: Server,
  viewerUserId: string,
  userId: string,
  status: string,
  activeClient: 'web' | 'mobile',
): void {
  io.to(`echo:user:${viewerUserId}`).emit('presence:update', {
    userId,
    status,
    activeClient,
  });
}

async function emitPresenceUpdateScoped(
  io: Server,
  userId: string,
  status: string,
  activeClient: 'web' | 'mobile',
): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return;
  const viewerIds = [...getAllConnectedUserIds()];
  const visibleViewerIds = await filterEchoViewersWhoCanSeeSubject(
    pool,
    userId,
    viewerIds,
  );
  for (const viewerId of visibleViewerIds) {
    emitPresenceUpdate(io, viewerId, userId, status, activeClient);
  }
}

export function registerPresenceHandler(
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean; profileStatus?: AuthUser['status'] },
): void {
  const { authenticated, profileStatus } = options;

  const persistPresence = (
    payload: unknown,
    source: 'presence:set' | 'presence:heartbeat',
  ) => {
    void (async () => {
      if (!payload || typeof payload !== 'object') return;
      const activeClient = normalizePresenceActiveClient(payload);
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) return;
      if (!authenticated || isAnonymousSocketUser(userId)) return;
      try {
        if (source === 'presence:heartbeat') {
          const touched = await touchEchoPresence(pool, userId);
          if (touched) return;
          // No `echo_presence` row yet (e.g. client missed initial `presence:set`) — bootstrap like `presence:set`.
          const occurredAtMsHb = Date.now();
          const existingHb = await getEchoPresenceState(pool, userId);
          const nextHb = resolveSocketPresenceSetState(
            existingHb
              ? {
                  status: existingHb.status as AuthUser['status'],
                  updatedAtMs: existingHb.updatedAtMs,
                }
              : undefined,
            {
              payloadStatus: (payload as { status?: string }).status,
              authenticatedStatus: profileStatus,
              occurredAtMs: occurredAtMsHb,
              staleAfterMinutes: config.presenceStaleAfterMinutes,
            },
          );
          if (!nextHb) return;
          await upsertEchoPresence(pool, userId, nextHb.status, activeClient);
          await emitPresenceUpdateScoped(
            io,
            userId,
            nextHb.status,
            activeClient,
          );
          return;
        }
        const occurredAtMs = Date.now();
        const existing = await getEchoPresenceState(pool, userId);
        const next = resolveSocketPresenceSetState(
          existing
            ? {
                status: existing.status as AuthUser['status'],
                updatedAtMs: existing.updatedAtMs,
              }
            : undefined,
          {
            payloadStatus: (payload as { status?: string }).status,
            authenticatedStatus: profileStatus,
            occurredAtMs,
            staleAfterMinutes: config.presenceStaleAfterMinutes,
          },
        );
        if (!next) {
          log.warn({ userId, payload, profileStatus }, 'invalid presence set');
          return;
        }
        await upsertEchoPresence(pool, userId, next.status, activeClient);
        await emitPresenceUpdateScoped(io, userId, next.status, activeClient);
      } catch (e) {
        log.error(e, `${source} failed`);
      }
    })();
  };

  socket.on('presence:set', (p) => persistPresence(p, 'presence:set'));
  socket.on('presence:heartbeat', (p) =>
    persistPresence(p, 'presence:heartbeat'),
  );
}
