import type pg from 'pg';
import { config } from '../../config';
import { ensureEchoTables } from '../../db/echoTables';
import {
  claimNextEchoVideoHlsJob,
  reclaimStaleEchoVideoHlsJobs,
} from '../../services/echoVideoOptimizeQueue';
import { processEchoVideoHlsJob } from '../../services/echoVideoHlsProcessor';

export type EchoVideoHlsLog = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Reclaim stale jobs, then drain the HLS queue until empty.
 */
export async function runEchoVideoHlsDrainTick(
  pool: pg.Pool,
  log: EchoVideoHlsLog,
  opts?: { ensureTables?: boolean },
): Promise<void> {
  if (opts?.ensureTables !== false) {
    await ensureEchoTables(pool);
  }
  await reclaimStaleEchoVideoHlsJobs(pool, config.echoVideoHlsTimeoutMs);
  while (true) {
    const job = await claimNextEchoVideoHlsJob(pool);
    if (!job) break;
    await processEchoVideoHlsJob(pool, job, log);
  }
}
