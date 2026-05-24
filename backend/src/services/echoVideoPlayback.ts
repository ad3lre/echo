import type pg from 'pg';
import { hlsManifestStorageKeyForSourceKey } from '../../../shared/echoUploadStorageKey';

export type EchoVideoPlaybackRow = {
  source_storage_key: string;
  manifest_storage_key: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  source_size: string;
  source_etag: string | null;
  renditions: unknown;
  last_error: string | null;
};

export type EchoVideoPlaybackRendition = {
  height: number;
  bandwidth: number;
  hasAudio: boolean;
};

export async function upsertEchoVideoPlaybackPending(
  pool: pg.Pool,
  row: {
    sourceStorageKey: string;
    sourceSize: number;
    sourceEtag: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO echo_video_playback
       (source_storage_key, status, source_size, source_etag, updated_at)
     VALUES ($1, 'pending', $2, $3, NOW())
     ON CONFLICT (source_storage_key) DO UPDATE SET
       status = CASE
         WHEN echo_video_playback.status = 'ready'
           AND echo_video_playback.source_etag IS NOT DISTINCT FROM EXCLUDED.source_etag
           AND echo_video_playback.source_size = EXCLUDED.source_size
         THEN echo_video_playback.status
         ELSE 'pending'
       END,
       source_size = EXCLUDED.source_size,
       source_etag = EXCLUDED.source_etag,
       manifest_storage_key = CASE
         WHEN echo_video_playback.status = 'ready'
           AND echo_video_playback.source_etag IS NOT DISTINCT FROM EXCLUDED.source_etag
           AND echo_video_playback.source_size = EXCLUDED.source_size
         THEN echo_video_playback.manifest_storage_key
         ELSE NULL
       END,
       renditions = CASE
         WHEN echo_video_playback.status = 'ready'
           AND echo_video_playback.source_etag IS NOT DISTINCT FROM EXCLUDED.source_etag
           AND echo_video_playback.source_size = EXCLUDED.source_size
         THEN echo_video_playback.renditions
         ELSE NULL
       END,
       last_error = NULL,
       updated_at = NOW()`,
    [row.sourceStorageKey, row.sourceSize, row.sourceEtag],
  );
}

export async function markEchoVideoPlaybackProcessing(
  pool: pg.Pool,
  sourceStorageKey: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_playback
     SET status = 'processing', updated_at = NOW(), last_error = NULL
     WHERE source_storage_key = $1`,
    [sourceStorageKey],
  );
}

export async function markEchoVideoPlaybackReady(
  pool: pg.Pool,
  row: {
    sourceStorageKey: string;
    manifestStorageKey: string;
    renditions: unknown;
  },
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_playback
     SET status = 'ready',
         manifest_storage_key = $2,
         renditions = $3::jsonb,
         last_error = NULL,
         updated_at = NOW()
     WHERE source_storage_key = $1`,
    [
      row.sourceStorageKey,
      row.manifestStorageKey,
      JSON.stringify(row.renditions ?? []),
    ],
  );
}

export async function markEchoVideoPlaybackPendingRetry(
  pool: pg.Pool,
  sourceStorageKey: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_playback
     SET status = 'pending', last_error = NULL, updated_at = NOW()
     WHERE source_storage_key = $1`,
    [sourceStorageKey],
  );
}

export async function markEchoVideoPlaybackFailed(
  pool: pg.Pool,
  sourceStorageKey: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_video_playback
     SET status = 'failed', last_error = $2, updated_at = NOW()
     WHERE source_storage_key = $1`,
    [sourceStorageKey, message.slice(0, 2000)],
  );
}

export async function getEchoVideoPlaybackBySourceKey(
  pool: pg.Pool,
  sourceStorageKey: string,
): Promise<EchoVideoPlaybackRow | null> {
  const r = await pool.query<EchoVideoPlaybackRow>(
    `SELECT source_storage_key, manifest_storage_key, status, source_size,
            source_etag, renditions, last_error
     FROM echo_video_playback
     WHERE source_storage_key = $1
     LIMIT 1`,
    [sourceStorageKey],
  );
  return r.rows[0] ?? null;
}

export async function deleteEchoVideoPlayback(
  pool: pg.Pool,
  sourceStorageKey: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_video_playback WHERE source_storage_key = $1`,
    [sourceStorageKey],
  );
}

export function defaultManifestKeyForSource(sourceStorageKey: string): string {
  return hlsManifestStorageKeyForSourceKey(sourceStorageKey);
}
