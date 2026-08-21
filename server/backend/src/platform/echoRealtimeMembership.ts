import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Server } from 'socket.io';

function getIo(fastify: FastifyInstance): Server | null {
  return (fastify as FastifyInstance & { io?: Server }).io ?? null;
}

/**
 * Best-effort realtime cleanup after a member is removed from a server.
 * The user stays connected globally, but loses server and channel room fan-out.
 */
export async function evictUserFromEchoServerRealtimeScopes(
  fastify: FastifyInstance,
  pool: pg.Pool,
  input: { serverId: string; userId: string },
): Promise<void> {
  const io = getIo(fastify);
  if (!io) return;
  const { serverId, userId } = input;
  const userRoom = `echo:user:${userId}`;
  try {
    io.in(userRoom).socketsLeave(`echo:server:${serverId}`);
    const channels = await pool.query(
      `SELECT id FROM echo_channels WHERE server_id = $1`,
      [serverId],
    );
    for (const row of channels.rows as { id: unknown }[]) {
      const channelId = String(row.id ?? '').trim();
      if (!channelId) continue;
      io.in(userRoom).socketsLeave(channelId);
    }
  } catch (err) {
    fastify.log.warn(
      {
        err,
        serverId,
        userId,
      },
      'Failed to evict Echo member from realtime scopes',
    );
  }
}

/**
 * Best-effort channel room reset after authorization graph changes.
 * Forces clients to re-join channels under fresh permission checks.
 */
export function evictAllUsersFromEchoChannelRealtimeScope(
  fastify: FastifyInstance,
  channelId: string,
): void {
  const io = getIo(fastify);
  if (!io) return;
  const cid = channelId.trim();
  if (!cid) return;
  try {
    io.in(cid).socketsLeave(cid);
  } catch (err) {
    fastify.log.warn(
      {
        err,
        channelId: cid,
      },
      'Failed to evict channel realtime scope',
    );
  }
}

/**
 * Best-effort channel room reset for every channel in a category after category-level
 * permission graph changes. Forces clients to re-join under fresh permission checks.
 */
export async function evictAllUsersFromEchoCategoryChannelRealtimeScopes(
  fastify: FastifyInstance,
  pool: pg.Pool,
  categoryId: string,
): Promise<void> {
  const io = getIo(fastify);
  if (!io) return;
  const cid = categoryId.trim();
  if (!cid) return;
  try {
    const channels = await pool.query(
      `SELECT id FROM echo_channels WHERE category_id = $1`,
      [cid],
    );
    for (const row of channels.rows as { id: unknown }[]) {
      const channelId = String(row.id ?? '').trim();
      if (!channelId) continue;
      io.in(channelId).socketsLeave(channelId);
    }
  } catch (err) {
    fastify.log.warn(
      { err, categoryId: cid },
      'Failed to evict category channel realtime scopes',
    );
  }
}

/**
 * Best-effort server-wide channel room reset.
 */
export async function evictAllUsersFromEchoServerChannelRealtimeScopes(
  fastify: FastifyInstance,
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  const io = getIo(fastify);
  if (!io) return;
  const sid = serverId.trim();
  if (!sid) return;
  try {
    const channels = await pool.query(
      `SELECT id FROM echo_channels WHERE server_id = $1`,
      [sid],
    );
    for (const row of channels.rows as { id: unknown }[]) {
      const channelId = String(row.id ?? '').trim();
      if (!channelId) continue;
      io.in(channelId).socketsLeave(channelId);
    }
  } catch (err) {
    fastify.log.warn(
      {
        err,
        serverId: sid,
      },
      'Failed to evict server channel realtime scopes',
    );
  }
}
