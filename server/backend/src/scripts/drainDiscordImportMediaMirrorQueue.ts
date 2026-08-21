/**
 * Process pending Discord import media mirror jobs until the queue is idle.
 *
 * Usage (from server/backend/):
 *   npx ts-node src/scripts/drainDiscordImportMediaMirrorQueue.ts
 *   npx ts-node src/scripts/drainDiscordImportMediaMirrorQueue.ts --requeue-failed
 *   npx ts-node src/scripts/drainDiscordImportMediaMirrorQueue.ts --clear-failed
 */
import { closePgPool, getPgPool } from '../db/pg';
import {
  registerDiscordImportMediaMirrorRuntime,
  runDiscordImportMediaMirrorDrain,
} from '../services/discordImport/discordImportMediaMirrorScheduler';

const requeueFailed = process.argv.includes('--requeue-failed');
const clearFailed = process.argv.includes('--clear-failed');
const DRAIN_TICK_DELAY_MS = 250;

const log = {
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: () => {},
  child: () => log,
} as unknown as import('fastify').FastifyBaseLogger;

async function queueCounts(pool: import('pg').Pool) {
  const { rows } = await pool.query<{ status: string; n: number }>(
    `SELECT status, COUNT(*)::int AS n
     FROM echo_discord_import_media_mirror_queue
     GROUP BY status
     ORDER BY status`,
  );
  return rows;
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  registerDiscordImportMediaMirrorRuntime(undefined, log);

  if (clearFailed) {
    const cleared = await pool.query<{ message_id: string }>(
      `UPDATE echo_discord_import_media_mirror_queue
       SET status = 'done', last_error = NULL, updated_at = NOW()
       WHERE status = 'failed' AND attempts >= 12
       RETURNING message_id`,
    );
    console.log(
      `Cleared ${cleared.rowCount ?? 0} exhausted failed job(s) from the mirror queue.`,
    );
    console.log('Queue after cleanup:', await queueCounts(pool));
    await closePgPool();
    return;
  }

  if (requeueFailed) {
    const requeued = await pool.query(
      `UPDATE echo_discord_import_media_mirror_queue
       SET status = 'pending', last_error = NULL, attempts = 0, updated_at = NOW()
       WHERE status = 'failed'
       RETURNING message_id`,
    );
    console.log(
      `Requeued ${requeued.rowCount ?? 0} failed job(s) for another mirror pass.`,
    );
  }

  console.log('Queue before drain:', await queueCounts(pool));

  let ticks = 0;
  const maxTicks = 500;
  while (ticks < maxTicks) {
    const before = await queueCounts(pool);
    const pending =
      before.find((r) => r.status === 'pending')?.n ??
      before.find((r) => r.status === 'processing')?.n ??
      0;
    const processing = before.find((r) => r.status === 'processing')?.n ?? 0;
    if (pending === 0 && processing === 0) break;

    await runDiscordImportMediaMirrorDrain(log);
    ticks += 1;
    await new Promise((r) => setTimeout(r, DRAIN_TICK_DELAY_MS));
  }

  console.log(`Drain finished after ${ticks} tick(s).`);
  console.log('Queue after drain:', await queueCounts(pool));

  const { rows: failedSample } = await pool.query<{
    message_id: string;
    last_error: string | null;
    attempts: number;
  }>(
    `SELECT message_id, last_error, attempts
     FROM echo_discord_import_media_mirror_queue
     WHERE status = 'failed'
     ORDER BY updated_at DESC
     LIMIT 15`,
  );
  if (failedSample.length > 0) {
    console.log('\nSample failed jobs:');
    for (const row of failedSample) {
      console.log(
        `  ${row.message_id} attempts=${row.attempts} err=${(row.last_error ?? '').slice(0, 120)}`,
      );
    }
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
