import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  claimNextDiscordImportMediaMirrorJob,
  discordImportMediaEchoStorageReady,
  enqueueUnqueuedDiscordImportMediaMirrorJobs,
  type DiscordImportMediaMirrorJobRow,
} from './discordImportMediaMirrorQueue';
import { processDiscordImportMediaMirrorJob } from './discordImportMediaMirrorProcessor';

let runtimeIo: Server | undefined;
let runtimeLog: FastifyBaseLogger | undefined;
let tickInProgress = false;
let kickTimer: NodeJS.Timeout | null = null;
let lastQueueReconcileAt = 0;
const QUEUE_RECONCILE_INTERVAL_MS = 60_000;

export function registerDiscordImportMediaMirrorRuntime(
  io: Server | undefined,
  log: FastifyBaseLogger,
): void {
  runtimeIo = io;
  runtimeLog = log;
}

/**
 * After enqueueing mirror work, nudge the background drain so Discord CDN URLs are
 * rewritten to Echo-hosted URLs without waiting for the next poll interval.
 */
export function kickDiscordImportMediaMirrorDrain(): void {
  if (config.echoDiscordImportMediaMirrorIntervalMs <= 0) return;
  if (!runtimeLog) return;
  const debounceMs = config.echoDiscordImportMediaMirrorKickDebounceMs;
  if (kickTimer) clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void runDiscordImportMediaMirrorDrain(runtimeLog!);
  }, debounceMs);
}

export async function runDiscordImportMediaMirrorDrain(
  log: FastifyBaseLogger,
): Promise<void> {
  if (tickInProgress) return;
  if (config.echoDiscordImportMediaMirrorIntervalMs <= 0) return;
  if (!discordImportMediaEchoStorageReady()) return;
  const pool = getPgPool();
  if (!pool) return;

  tickInProgress = true;
  try {
    await ensureEchoTables(pool);
    const batch = Math.max(1, config.echoDiscordImportMediaMirrorBatchSize);
    if (Date.now() - lastQueueReconcileAt >= QUEUE_RECONCILE_INTERVAL_MS) {
      await enqueueUnqueuedDiscordImportMediaMirrorJobs(pool, batch * 4);
      lastQueueReconcileAt = Date.now();
    }
    const jobs: DiscordImportMediaMirrorJobRow[] = [];
    for (let i = 0; i < batch; i++) {
      const job = await claimNextDiscordImportMediaMirrorJob(pool);
      if (!job) break;
      jobs.push(job);
    }
    // A message's URLs remain serialized inside its own job, but independent
    // messages should not make the whole queue wait on one slow Discord CDN
    // fetch. The configured batch size is the concurrency bound.
    await Promise.all(
      jobs.map((job) => processOneDiscordImportMediaMirrorJob(pool, log, job)),
    );
  } catch (e) {
    log.error(e, 'echo.discord_import_media_mirror.drain_failed');
  } finally {
    tickInProgress = false;
  }
}

async function processOneDiscordImportMediaMirrorJob(
  pool: NonNullable<ReturnType<typeof getPgPool>>,
  log: FastifyBaseLogger,
  job: DiscordImportMediaMirrorJobRow,
): Promise<void> {
  await processDiscordImportMediaMirrorJob(pool, runtimeIo, log, job);
}
