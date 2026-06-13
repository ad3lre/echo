import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { sendMetricsDigestEmail } from '../services/email/echoMetricsDigestEmail';

/** Postgres advisory lock id so only one replica sends the digest per tick. */
const METRICS_DIGEST_ADVISORY_LOCK = 872_341_010;

/** Cap the internal check cadence so restarts never delay a due send by long. */
const MAX_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Emails a digest of all recorded Prometheus metrics to
 * {@link config.echoMetricsDigestEmail} once per
 * {@link config.echoMetricsDigestIntervalMs} (default weekly).
 *
 * Ticks more frequently than the send period and persists the last-sent time in
 * `echo_metrics_digest_state`, gated by a Postgres advisory lock, so the email
 * is sent at most once per period across replicas and process restarts.
 *
 * Interval 0 disables. Requires postgres storage; in-memory mode is skipped.
 */
export function startMetricsWeeklyDigestJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  const periodMs = config.echoMetricsDigestIntervalMs;
  if (periodMs <= 0) {
    fastify.log.info(
      'Metrics weekly digest job disabled (ECHO_METRICS_DIGEST_INTERVAL_MS=0)',
    );
    return null;
  }

  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    const pool = getPgPool();
    if (!pool) {
      running = false;
      return;
    }
    let lockHeld = false;
    try {
      await ensureEchoTables(pool);
      const lockRes = await pool.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_lock($1) AS locked`,
        [METRICS_DIGEST_ADVISORY_LOCK],
      );
      lockHeld = lockRes.rows[0]?.locked === true;
      if (!lockHeld) {
        running = false;
        return;
      }

      const dueRes = await pool.query<{ last_sent_at: Date | null }>(
        `SELECT last_sent_at FROM echo_metrics_digest_state WHERE id = 1`,
      );
      const lastSentAt = dueRes.rows[0]?.last_sent_at ?? null;
      const due =
        lastSentAt === null ||
        Date.now() - new Date(lastSentAt).getTime() >= periodMs;
      if (!due) return;

      await sendMetricsDigestEmail(fastify.log);

      await pool.query(
        `INSERT INTO echo_metrics_digest_state (id, last_sent_at)
         VALUES (1, NOW())
         ON CONFLICT (id) DO UPDATE SET last_sent_at = NOW()`,
      );
    } catch (e) {
      fastify.log.error(e, 'echo.metrics.digest_tick_failed');
    } finally {
      if (pool && lockHeld) {
        try {
          await pool.query(`SELECT pg_advisory_unlock($1)`, [
            METRICS_DIGEST_ADVISORY_LOCK,
          ]);
        } catch {
          /* connection may be closing */
        }
      }
      running = false;
    }
  };

  const checkIntervalMs = Math.min(periodMs, MAX_CHECK_INTERVAL_MS);
  // Defer the first check so it never fires during boot bring-up.
  return setInterval(() => {
    void tick();
  }, checkIntervalMs);
}
