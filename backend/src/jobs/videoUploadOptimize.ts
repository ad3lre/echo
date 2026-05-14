import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { claimNextEchoVideoOptimizeJob } from '../services/echoVideoOptimizeQueue';
import { processEchoVideoOptimizeJob } from '../services/echoVideoOptimizeProcessor';

/**
 * Background chat video re-encode (WebM) after fast client upload.
 * Requires `ffmpeg` on PATH or `FFMPEG_PATH`. Interval 0 disables.
 */
export function startVideoUploadOptimizeJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoVideoOptimizeIntervalMs <= 0) {
    fastify.log.info(
      'Video upload optimize job disabled (ECHO_VIDEO_OPTIMIZE_MS=0)',
    );
    return null;
  }
  const intervalMs = config.echoVideoOptimizeIntervalMs;
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
        const job = await claimNextEchoVideoOptimizeJob(pool);
        if (!job) {
          running = false;
          return;
        }
        await processEchoVideoOptimizeJob(pool, job, fastify.log);
      } catch (e) {
        fastify.log.error(e, 'echo.video_optimize.tick_failed');
      } finally {
        running = false;
      }
    })();
  }, intervalMs);
}
