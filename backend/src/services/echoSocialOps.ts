import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { applyPresenceSignal } from '../domain/echoPresenceAuthority';
import {
  upsertEchoPresence,
  addEchoFriendRequest,
  type AddEchoFriendRequestResult,
  acceptEchoFriendship,
  declineEchoPendingFriendRequest,
  cancelEchoPendingFriendRequest,
  filterVisibleEchoUserIds,
  removeEchoAcceptedFriendship,
} from '../domain/echoStore';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { publishEchoWorkspaceEvent } from '../platform/echoPlatformEvents';
import { getAllConnectedUserIds } from '../sockets/userSocketIndex';

export function publishFriendRequestsChanged(
  fastify: FastifyInstance,
  userIds: string[],
): void {
  const version = nextEchoSnowflakeId();
  for (const uid of new Set(userIds.map((id) => id.trim()).filter(Boolean))) {
    publishEchoWorkspaceEvent(
      fastify,
      { kind: 'friend_requests_changed', version },
      { userId: uid },
    );
  }
}

export async function updateEchoPresenceAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  status: string,
  activeClient: 'web' | 'mobile' = 'web',
): Promise<void> {
  const next = applyPresenceSignal(undefined, {
    source: 'http',
    status,
    occurredAtMs: Date.now(),
  });
  if (!next) return;
  await upsertEchoPresence(pool, userId, next.status, activeClient);
  const viewerIds = getAllConnectedUserIds();
  for (const viewerId of viewerIds) {
    if (viewerId === userId) {
      fastify.io.to(`echo:user:${viewerId}`).emit('presence:update', {
        userId,
        status: next.status,
        activeClient,
      });
      continue;
    }
    const visible = await filterVisibleEchoUserIds(pool, viewerId, [userId]);
    if (visible.includes(userId)) {
      fastify.io.to(`echo:user:${viewerId}`).emit('presence:update', {
        userId,
        status: next.status,
        activeClient,
      });
    }
  }
}

export async function addEchoFriendRequestAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<AddEchoFriendRequestResult> {
  const r = await addEchoFriendRequest(pool, userId, peerId);
  if (r === 'created') {
    publishFriendRequestsChanged(fastify, [userId, peerId]);
  }
  return r;
}

export async function acceptEchoFriendshipAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const ok = await acceptEchoFriendship(pool, userId, peerId);
  if (ok) {
    publishFriendRequestsChanged(fastify, [userId, peerId]);
  }
  return ok;
}

export async function declineEchoFriendRequestAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const ok = await declineEchoPendingFriendRequest(pool, userId, peerId);
  if (ok) {
    publishFriendRequestsChanged(fastify, [userId, peerId]);
  }
  return ok;
}

export async function cancelEchoFriendRequestAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const ok = await cancelEchoPendingFriendRequest(pool, userId, peerId);
  if (ok) {
    publishFriendRequestsChanged(fastify, [userId, peerId]);
  }
  return ok;
}

export async function removeEchoFriendshipAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const ok = await removeEchoAcceptedFriendship(pool, userId, peerId);
  if (ok) {
    publishFriendRequestsChanged(fastify, [userId, peerId]);
  }
  return ok;
}
