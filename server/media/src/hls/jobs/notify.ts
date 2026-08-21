import type pg from 'pg';
import { config } from '../../../../backend/src/config';

export const ECHO_VIDEO_HLS_NOTIFY_CHANNEL = 'echo_video_hls';

export function shouldNotifyEchoVideoHlsWorker(
  worker: 'embedded' | 'standalone' = config.echoVideoHlsWorker,
): boolean {
  return worker === 'standalone';
}

/** Wake standalone worker(s) after a job is enqueued (no-op in embedded mode). */
export async function notifyEchoVideoHlsJobEnqueued(
  pool: pg.Pool,
  storageKey: string,
): Promise<void> {
  if (!shouldNotifyEchoVideoHlsWorker()) return;
  const payload = storageKey.slice(0, 8000);
  await pool.query(`SELECT pg_notify($1, $2)`, [
    ECHO_VIDEO_HLS_NOTIFY_CHANNEL,
    payload,
  ]);
}
