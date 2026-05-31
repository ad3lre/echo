import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  claimNextEchoVideoHlsJob,
  reclaimStaleEchoVideoHlsJobs,
} from '../services/echoVideoOptimizeQueue';
import { processEchoVideoHlsJob } from '../services/echoVideoHlsProcessor';

let activeRunner: (() => void) | null = null;

/**
 * Background chat video HLS packaging after fast client upload.
 * Requires `ffmpeg` + `ffprobe` on PATH (or `FFMPEG_PATH` / `FFPROBE_PATH`). Interval 0 disables.
 */
export function startVideoUploadOptimizeJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoVideoOptimizeIntervalMs <= 0) {
    fastify.log.info(
      'Video HLS transcode job disabled (ECHO_VIDEO_OPTIMIZE_MS=0)',
    );
    return null;
  }
  const intervalMs = config.echoVideoOptimizeIntervalMs;
  let running = false;
  let rerunRequested = false;

  const run = (): void => {
    void (async () => {
      if (running) return;
      running = true;
      const pool = getPgPool();
      if (!pool) {
        running = false;
        return;
      }
      try {
        do {
          rerunRequested = false;
          await ensureEchoTables(pool);
          await reclaimStaleEchoVideoHlsJobs(
            pool,
            config.echoVideoHlsTimeoutMs,
          );
          while (true) {
            const job = await claimNextEchoVideoHlsJob(pool);
            if (!job) break;
            await processEchoVideoHlsJob(pool, job, fastify.log);
          }
        } while (rerunRequested);
      } catch (e) {
        fastify.log.error(e, 'echo.video_hls.tick_failed');
      } finally {
        running = false;
      }
    })();
  };

  const runner = (): void => {
    if (running) {
      rerunRequested = true;
      return;
    }
    run();
  };
  activeRunner = runner;
  const timer = setInterval(runner, intervalMs);
  fastify.addHook('onClose', (_instance, done) => {
    clearInterval(timer);
    if (activeRunner === runner) activeRunner = null;
    done();
  });
  runner();
  return timer;
}

export function kickVideoUploadOptimizeJob(): void {
  activeRunner?.();
}
