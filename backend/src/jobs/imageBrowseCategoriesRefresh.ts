import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { refreshImageBrowseCategoriesIfStale } from '../services/googleTrendsImageCategories';

/** Postgres advisory lock id for single-writer image category refresh across API replicas. */
const IMAGE_CATEGORIES_ADVISORY_LOCK = 872_341_011;

/**
 * Refreshes image browse categories from Google Trends when the UTC month changes.
 * Interval 0 disables. Uses `pg_try_advisory_lock` so only one replica fetches at a time.
 */
export function startImageBrowseCategoriesRefreshJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoImageCategoriesRefreshIntervalMs <= 0) {
    fastify.log.info(
      'Image browse categories refresh disabled (ECHO_IMAGE_CATEGORIES_REFRESH_INTERVAL_MS=0)',
    );
    return null;
  }

  const intervalMs = config.echoImageCategoriesRefreshIntervalMs;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    const pool = getPgPool();
    let lockHeld = false;
    try {
      if (pool) {
        const lockRes = await pool.query<{ locked: boolean }>(
          `SELECT pg_try_advisory_lock($1) AS locked`,
          [IMAGE_CATEGORIES_ADVISORY_LOCK],
        );
        lockHeld = lockRes.rows[0]?.locked === true;
        if (!lockHeld) {
          running = false;
          return;
        }
      }

      await refreshImageBrowseCategoriesIfStale(fastify.log);
    } catch (e) {
      fastify.log.error(e, 'echo.image_categories.refresh_tick_failed');
    } finally {
      if (pool && lockHeld) {
        try {
          await pool.query(`SELECT pg_advisory_unlock($1)`, [
            IMAGE_CATEGORIES_ADVISORY_LOCK,
          ]);
        } catch {
          /* connection may be closing */
        }
      }
      running = false;
    }
  };

  void tick();
  return setInterval(() => {
    void tick();
  }, intervalMs);
}
