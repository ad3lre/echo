import type pg from 'pg';
import { config } from '../../../../backend/src/config';
import { runWithPgQueryContext } from '../../../../backend/src/db/pgQueryContext';
import { ensureEchoTables } from '../../../../backend/src/db/echoTables';
import {
  claimNextEchoVideoHlsJob,
  reclaimStaleEchoVideoHlsJobs,
} from '../../../../backend/src/services/echoVideoOptimizeQueue';
import { processEchoVideoHlsJob } from '../processor';

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
  await runWithPgQueryContext(
    { scope: 'job', label: 'video_hls_reclaim' },
    () => reclaimStaleEchoVideoHlsJobs(pool, config.echoVideoHlsTimeoutMs),
  );
  while (true) {
    const job = await runWithPgQueryContext(
      { scope: 'job', label: 'video_hls_claim' },
      () => claimNextEchoVideoHlsJob(pool),
    );
    if (!job) break;
    await runWithPgQueryContext(
      { scope: 'job', label: 'video_hls_process' },
      () => processEchoVideoHlsJob(pool, job, log),
    );
  }
}
