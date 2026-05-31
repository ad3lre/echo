/**
 * Standalone chat video HLS worker. Run when API uses ECHO_VIDEO_HLS_WORKER=standalone.
 *
 *   npm run worker:video-hls -w backend
 */
import pino from 'pino';
import { config } from '../config';
import { closePgPool, getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { startEchoVideoHlsListen } from '../jobs/videoHls/listen';
import { createEchoVideoHlsScheduler } from '../jobs/videoHls/scheduler';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'echo-video-hls-worker' },
});

/** Wait for in-flight ffmpeg at most one job timeout plus a small buffer. */
function shutdownIdleTimeoutMs(): number {
  return config.echoVideoHlsTimeoutMs + 30_000;
}

async function main(): Promise<void> {
  if (config.backendStorageMode !== 'postgres' || !config.databaseUrl) {
    log.error(
      'Video HLS worker requires ECHO_BACKEND_STORAGE=postgres and DATABASE_URL',
    );
    process.exitCode = 1;
    return;
  }
  if (config.echoVideoOptimizeIntervalMs <= 0) {
    log.error('Video HLS worker disabled (ECHO_VIDEO_OPTIMIZE_MS=0)');
    process.exitCode = 1;
    return;
  }

  const pool = getPgPool();
  if (!pool) {
    log.error('Failed to open Postgres pool');
    process.exitCode = 1;
    return;
  }

  await ensureEchoTables(pool);
  log.info(
    {
      intervalMs: config.echoVideoOptimizeIntervalMs,
      database: config.databaseUrl.replace(/:[^:@/]+@/, ':***@'),
    },
    'echo.video_hls.worker_started',
  );

  const scheduler = createEchoVideoHlsScheduler({
    intervalMs: config.echoVideoOptimizeIntervalMs,
    log,
    getPool: getPgPool,
  });
  if (!scheduler) {
    log.error('Scheduler not created (ECHO_VIDEO_OPTIMIZE_MS=0)');
    process.exitCode = 1;
    return;
  }

  const stopListen = await startEchoVideoHlsListen(scheduler, log);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'echo.video_hls.worker_shutting_down');
    scheduler.stop();
    const idleMs = shutdownIdleTimeoutMs();
    await scheduler.whenIdle(idleMs);
    await stopListen();
    await closePgPool();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'echo.video_hls.worker_failed');
  process.exitCode = 1;
});
