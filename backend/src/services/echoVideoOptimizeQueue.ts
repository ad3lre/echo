import type pg from 'pg';

export async function enqueueEchoChatVideoOptimize(
  pool: pg.Pool,
  row: { storageKey: string; publicUrl: string; sourceContentType: string },
): Promise<void> {
  if (!row.storageKey.startsWith('echo/channels/')) return;
  const ct = row.sourceContentType.trim().toLowerCase();
  if (!ct.startsWith('video/')) return;
  if (ct.includes('webm')) return;

  await pool.query(
    `INSERT INTO echo_video_optimize_queue (storage_key, public_url, source_content_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (storage_key) DO NOTHING`,
    [row.storageKey, row.publicUrl, row.sourceContentType],
  );
}

export type VideoOptimizeJobRow = {
  id: string;
  storage_key: string;
  public_url: string;
  source_content_type: string;
};

export async function claimNextEchoVideoOptimizeJob(
  pool: pg.Pool,
): Promise<VideoOptimizeJobRow | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const sel = await c.query(
      `SELECT id, storage_key, public_url, source_content_type
       FROM echo_video_optimize_queue
       WHERE status = 'pending'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    if (sel.rows.length === 0) {
      await c.query('COMMIT');
      return null;
    }
    const row = sel.rows[0] as VideoOptimizeJobRow;
    await c.query(
      `UPDATE echo_video_optimize_queue
       SET status = 'processing', updated_at = NOW()
       WHERE id = $1`,
      [row.id],
    );
    await c.query('COMMIT');
    return row;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function markEchoVideoOptimizeDone(
  pool: pg.Pool,
  jobId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_optimize_queue
     SET status = 'done', updated_at = NOW(), last_error = NULL
     WHERE id = $1`,
    [jobId],
  );
}

export async function markEchoVideoOptimizeFailed(
  pool: pg.Pool,
  jobId: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_optimize_queue
     SET status = 'failed', updated_at = NOW(), last_error = $2
     WHERE id = $1`,
    [jobId, message.slice(0, 2000)],
  );
}
