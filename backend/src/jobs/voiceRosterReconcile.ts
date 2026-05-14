import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { reconcileEchoVoiceParticipantsAgainstLiveKit } from '../services/echoVoiceLiveKitReconcile';

/**
 * Background reconcile against LiveKit so missed webhooks / client crashes / network
 * blips cannot leave `echo_voice_participants` holding stale users forever.
 *
 * LiveKit disabled → no-op (boot-time reconcile already wipes on startup; we do not
 * want a periodic wiper if someone intentionally runs without LiveKit).
 */
export function startEchoVoiceRosterReconcileJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoVoiceReconcileIntervalMs <= 0) {
    fastify.log.info(
      'Voice roster reconcile disabled (ECHO_VOICE_RECONCILE_INTERVAL_MS=0)',
    );
    return null;
  }
  if (!config.liveKitEnabled) {
    fastify.log.info(
      'Voice roster reconcile job not started (LiveKit disabled); boot-time wipe still runs',
    );
    return null;
  }
  const intervalMs = config.echoVoiceReconcileIntervalMs;
  let running = false;
  return setInterval(() => {
    void (async () => {
      if (running) return;
      running = true;
      const pool = getPgPool();
      if (!pool) {
        running = false;
        return;
      }
      try {
        await ensureEchoTables(pool);
        const res = await reconcileEchoVoiceParticipantsAgainstLiveKit({
          fastify,
          pool,
          reason: 'periodic',
          log: fastify.log,
        });
        if (res.deletedRows > 0) {
          fastify.log.info(
            {
              deletedRows: res.deletedRows,
              affectedServers: res.affectedServers,
              checkedGroups: res.checkedGroups,
            },
            'echo.voice.roster_reconcile_pruned',
          );
        }
      } catch (e) {
        fastify.log.error(e, 'echo.voice.roster_reconcile_failed');
      } finally {
        running = false;
      }
    })();
  }, intervalMs);
}
