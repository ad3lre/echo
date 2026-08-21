import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { createEchoVideoHlsScheduler } from '../../../media/src/hls/jobs/scheduler';

let embeddedScheduler: ReturnType<typeof createEchoVideoHlsScheduler> | null =
  null;

function shutdownIdleTimeoutMs(): number {
  return config.echoVideoHlsTimeoutMs + 30_000;
}

/**
 * Background chat video HLS packaging after fast client upload (embedded in API process).
 * Requires `ffmpeg` + `ffprobe` on PATH. Disabled when `ECHO_VIDEO_HLS_WORKER=standalone`
 * or `ECHO_VIDEO_OPTIMIZE_MS=0`.
 */
export function startVideoUploadOptimizeJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoVideoHlsWorker !== 'embedded') {
    fastify.log.warn(
      { echo_video_hls_worker: config.echoVideoHlsWorker },
      'Video HLS transcode not started on API (ECHO_VIDEO_HLS_WORKER=standalone); run the video-hls worker process',
    );
    return null;
  }
  if (config.echoVideoOptimizeIntervalMs <= 0) {
    fastify.log.info(
      'Video HLS transcode job disabled (ECHO_VIDEO_OPTIMIZE_MS=0)',
    );
    return null;
  }

  const scheduler = createEchoVideoHlsScheduler({
    intervalMs: config.echoVideoOptimizeIntervalMs,
    log: fastify.log,
    getPool: getPgPool,
  });
  if (!scheduler) return null;

  embeddedScheduler = scheduler;
  fastify.addHook('onClose', async () => {
    scheduler.stop();
    await scheduler.whenIdle(shutdownIdleTimeoutMs());
    if (embeddedScheduler === scheduler) embeddedScheduler = null;
  });

  return null;
}

export function kickVideoUploadOptimizeJob(): void {
  embeddedScheduler?.kick();
}
