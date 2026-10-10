import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { runAllStatusProbes } from '../services/statusPage/probe';
import { recordStatusProbes } from '../services/statusPage/store';

/** Postgres advisory lock id for single-writer status probes across API replicas. */
const STATUS_PROBE_ADVISORY_LOCK = 872_341_009;

/**
 * Background probes for the public status page. Writes UTC daily buckets + latest row.
 * Interval 0 disables. Uses `pg_try_advisory_lock` so only one replica probes at a time.
 */
export function startStatusPageProbeJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoStatusProbeIntervalMs <= 0) {
    fastify.log.info(
      'Status page probe job disabled (ECHO_STATUS_PROBE_INTERVAL_MS=0)',
    );
    return null;
  }

  const intervalMs = config.echoStatusProbeIntervalMs;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    const pool = getPgPool();
    let lockClient: pg.PoolClient | null = null;
    let lockHeld = false;
    let unlockFailed = false;
    try {
      if (pool) {
        await ensureEchoTables(pool);
        lockClient = await pool.connect();
        const lockRes = await lockClient.query<{ locked: boolean }>(
          `SELECT pg_try_advisory_lock($1) AS locked`,
          [STATUS_PROBE_ADVISORY_LOCK],
        );
        lockHeld = lockRes.rows[0]?.locked === true;
        if (!lockHeld) return;
      }

      const probes = await runAllStatusProbes(pool);
      await recordStatusProbes(pool, probes);
    } catch (e) {
      fastify.log.error(e, 'echo.status.probe_tick_failed');
    } finally {
      if (lockClient && lockHeld) {
        try {
          await lockClient.query(`SELECT pg_advisory_unlock($1)`, [
            STATUS_PROBE_ADVISORY_LOCK,
          ]);
        } catch {
          unlockFailed = true;
        }
      }
      lockClient?.release(
        unlockFailed
          ? new Error('Failed to release status probe job lock')
          : undefined,
      );
      running = false;
    }
  };

  void tick();
  return setInterval(() => {
    void tick();
  }, intervalMs);
}
