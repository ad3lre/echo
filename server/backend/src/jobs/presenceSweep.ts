import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { markStaleEchoPresenceOffline } from '../domain/echoStore';
import { pruneOfflineUsersFromAllVoiceChannels } from '../services/echoVoiceOfflineCleanup';

const PRESENCE_SWEEP_EMIT_CAP = 500;

/**
 * Marks non-offline presence rows stale after `ECHO_PRESENCE_STALE_MINUTES` without an update.
 * Heartbeats (`presence:set` / `presence:heartbeat`) refresh `updated_at`.
 * Emits `presence:update` for swept users so clients converge without polling.
 */
export function startPresenceSweepJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.presenceSweepIntervalMs <= 0) {
    fastify.log.info('Presence sweep disabled (ECHO_PRESENCE_SWEEP_MS=0)');
    return null;
  }
  const intervalMs = config.presenceSweepIntervalMs;
  let running = false;
  return setInterval(() => {
    void (async () => {
      if (running) return;
      running = true;
      const occurredAtMs = Date.now();
      const pool = getPgPool();
      if (!pool) return;
      try {
        await ensureEchoTables(pool);
        const userIds = await markStaleEchoPresenceOffline(
          pool,
          config.presenceStaleAfterMinutes,
        );
        if (userIds.length > 0) {
          fastify.log.info(
            {
              n: userIds.length,
              staleAfterMinutes: config.presenceStaleAfterMinutes,
            },
            'echo.presence.sweep',
          );
          const io = fastify.io;
          const slice = userIds.slice(0, PRESENCE_SWEEP_EMIT_CAP);
          for (const userId of slice) {
            io.emit('presence:update', {
              userId,
              status: 'offline',
              activeClient: 'web',
            });
          }
          if (userIds.length > PRESENCE_SWEEP_EMIT_CAP) {
            fastify.log.warn(
              { total: userIds.length, emitted: PRESENCE_SWEEP_EMIT_CAP },
              'echo.presence.sweep_emit_capped',
            );
          }

          // VC roster cleanup: an offline user must not remain in voice channels.
          // Only prune users that truly have no active Echo sockets (best-effort, adapter dependent).
          const trulyOffline: string[] = [];
          for (const userId of userIds) {
            try {
              const sockets = await io.in(`echo:user:${userId}`).fetchSockets();
              if (sockets.length === 0) trulyOffline.push(userId);
            } catch (e) {
              fastify.log.warn(
                { err: e, userId },
                'echo.presence.sweep_fetchSockets_failed',
              );
            }
          }
          if (trulyOffline.length > 0) {
            await pruneOfflineUsersFromAllVoiceChannels({
              fastify,
              pool,
              userIds: trulyOffline,
              reason: 'presence_sweep',
              occurredAtMs,
              log: fastify.log,
            });
          }
        }
      } catch (e) {
        fastify.log.error(e, 'echo.presence.sweep_failed');
      } finally {
        running = false;
      }
    })();
  }, intervalMs);
}
