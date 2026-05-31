import type pg from 'pg';
import { config } from '../config';
import { notifyEchoVideoHlsJobEnqueued } from '../jobs/videoHls/notify';
import {
  upsertEchoVideoPlaybackPending,
  markEchoVideoPlaybackProcessing,
  markEchoVideoPlaybackReady,
  markEchoVideoPlaybackFailed,
  markEchoVideoPlaybackPendingRetry,
} from './echoVideoPlayback';

async function syncEchoVideoHlsQueueToPendingPlayback(
  pool: pg.Pool,
  storageKey: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_hls_queue q
     SET status = 'pending',
         last_error = NULL,
         attempts = 0,
         updated_at = NOW()
     FROM echo_video_playback p
     WHERE q.storage_key = $1
       AND p.source_storage_key = q.storage_key
       AND p.status = 'pending'
       AND q.status IN ('done', 'failed')`,
    [storageKey],
  );
}

export async function enqueueEchoChatVideoHls(
  pool: pg.Pool,
  row: {
    storageKey: string;
    publicUrl: string;
    sourceContentType: string;
    sourceSize: number;
    sourceEtag: string | null;
  },
): Promise<void> {
  if (!row.storageKey.startsWith('echo/channels/')) return;
  const ct = row.sourceContentType.trim().toLowerCase();
  if (!ct.startsWith('video/')) return;

  await pool.query(
    `INSERT INTO echo_video_hls_queue (storage_key, public_url, source_content_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (storage_key) DO UPDATE SET
       public_url = EXCLUDED.public_url,
       source_content_type = EXCLUDED.source_content_type,
       status = CASE
         WHEN echo_video_hls_queue.status = 'failed' THEN 'pending'
         ELSE echo_video_hls_queue.status
       END,
       last_error = CASE
         WHEN echo_video_hls_queue.status = 'failed' THEN NULL
         ELSE echo_video_hls_queue.last_error
       END,
       attempts = CASE
         WHEN echo_video_hls_queue.status = 'failed' THEN 0
         ELSE echo_video_hls_queue.attempts
       END,
       updated_at = NOW()`,
    [row.storageKey, row.publicUrl, row.sourceContentType],
  );

  await upsertEchoVideoPlaybackPending(pool, {
    sourceStorageKey: row.storageKey,
    sourceSize: row.sourceSize,
    sourceEtag: row.sourceEtag,
  });

  await syncEchoVideoHlsQueueToPendingPlayback(pool, row.storageKey);
  await notifyEchoVideoHlsJobEnqueued(pool, row.storageKey);
}

export type VideoHlsJobRow = {
  id: string;
  storage_key: string;
  public_url: string;
  source_content_type: string;
};

export async function reclaimStaleEchoVideoHlsJobs(
  pool: pg.Pool,
  staleAfterMs: number,
): Promise<number> {
  const ms = Math.max(1, Math.floor(staleAfterMs));
  const r = await pool.query(
    `UPDATE echo_video_hls_queue
     SET status = 'pending', updated_at = NOW()
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
    [ms],
  );
  return r.rowCount ?? 0;
}

export async function claimNextEchoVideoHlsJob(
  pool: pg.Pool,
): Promise<VideoHlsJobRow | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const sel = await c.query(
      `SELECT id, storage_key, public_url, source_content_type
       FROM echo_video_hls_queue
       WHERE status = 'pending'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    if (sel.rows.length === 0) {
      await c.query('COMMIT');
      return null;
    }
    const row = sel.rows[0] as VideoHlsJobRow;
    await c.query(
      `UPDATE echo_video_hls_queue
       SET status = 'processing', updated_at = NOW()
       WHERE id = $1`,
      [row.id],
    );
    await markEchoVideoPlaybackProcessing(pool, row.storage_key);
    await c.query('COMMIT');
    return row;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function markEchoVideoHlsJobDone(
  pool: pg.Pool,
  jobId: string,
  opts: {
    sourceStorageKey: string;
    manifestStorageKey: string;
    renditions: unknown;
  },
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_hls_queue
     SET status = 'done',
         attempts = 0,
         updated_at = NOW(),
         last_error = NULL
     WHERE id = $1`,
    [jobId],
  );
  await markEchoVideoPlaybackReady(pool, {
    sourceStorageKey: opts.sourceStorageKey,
    manifestStorageKey: opts.manifestStorageKey,
    renditions: opts.renditions,
  });
}

export async function markEchoVideoHlsJobFailed(
  pool: pg.Pool,
  jobId: string,
  sourceStorageKey: string,
  message: string,
): Promise<void> {
  const err = message.slice(0, 2000);
  const maxAttempts = config.echoVideoHlsMaxAttempts;
  const r = await pool.query<{ status: string }>(
    `UPDATE echo_video_hls_queue
     SET attempts = attempts + 1,
         status = CASE
           WHEN attempts + 1 < $3 THEN 'pending'
           ELSE 'failed'
         END,
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING status`,
    [jobId, err, maxAttempts],
  );
  const row = r.rows[0];
  if (!row) return;
  if (row.status === 'pending') {
    await markEchoVideoPlaybackPendingRetry(pool, sourceStorageKey);
  } else {
    await markEchoVideoPlaybackFailed(pool, sourceStorageKey, err);
  }
}
