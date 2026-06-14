import type pg from 'pg';
import { buildEchoUploadPublicUrlForStorageKey } from './s3UploadPresign';
import {
  hlsManifestStorageKeyForSourceKey,
  vcWatchTogetherGlobalLibraryPrefix,
} from '../../../shared/echoUploadStorageKey';

export type VcWatchTogetherLibraryItem = {
  storageKey: string;
  sourcePublicUrl: string;
  title: string;
  byteLength: number;
  createdAt: string;
  transcodeStatus: 'pending' | 'processing' | 'ready' | 'failed';
  hlsManifestUrl: string | null;
  transcodeError: string | null;
};

function titleFromStorageKey(storageKey: string): string {
  const base = storageKey.trim().split('/').pop() ?? 'Video';
  try {
    const decoded = decodeURIComponent(base);
    const dash = decoded.indexOf('-');
    if (dash > 0 && dash < decoded.length - 1) {
      return decoded.slice(dash + 1).trim() || 'Video';
    }
    return decoded.trim() || 'Video';
  } catch {
    return base.trim() || 'Video';
  }
}

function mapPlaybackStatus(
  status: string | null | undefined,
): VcWatchTogetherLibraryItem['transcodeStatus'] {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'processing':
      return 'processing';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

/** User-global library: new `echo/vc-watch/u/{userId}/…` plus legacy channel paths. */
export async function listVcWatchTogetherUploadLibrary(
  pool: pg.Pool,
  opts: { userId: string; limit?: number },
): Promise<VcWatchTogetherLibraryItem[]> {
  const userId = opts.userId.trim();
  if (!userId) return [];

  const globalPrefix = vcWatchTogetherGlobalLibraryPrefix(userId);
  const legacyPattern = `echo/vc-watch/%/${userId}/%`;
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 100);

  const r = await pool.query<{
    storage_key: string;
    public_url: string;
    byte_length: string;
    created_at: Date;
    playback_status: string | null;
    manifest_storage_key: string | null;
    last_error: string | null;
  }>(
    `SELECT d.storage_key, d.public_url, d.byte_length, d.created_at,
            p.status AS playback_status,
            p.manifest_storage_key,
            p.last_error
     FROM echo_upload_dedupe d
     LEFT JOIN echo_video_playback p
       ON p.source_storage_key = d.storage_key
     LEFT JOIN echo_chat_upload_retention r
       ON r.storage_key = d.storage_key
     WHERE d.kind = 'video'
       AND d.uploader_id = $1
       AND (
         d.storage_key LIKE $2
         OR d.storage_key LIKE $3 ESCAPE '\\'
       )
       AND (r.storage_key IS NULL OR r.expires_at > NOW())
     ORDER BY d.created_at DESC
     LIMIT $4`,
    [userId, `${globalPrefix}%`, legacyPattern, limit],
  );

  const out: VcWatchTogetherLibraryItem[] = [];
  for (const row of r.rows) {
    const storageKey = row.storage_key.trim();
    if (!storageKey) continue;
    const sourcePublicUrl =
      buildEchoUploadPublicUrlForStorageKey(storageKey) ??
      row.public_url.trim();
    if (!sourcePublicUrl) continue;

    const transcodeStatus = mapPlaybackStatus(row.playback_status);
    let hlsManifestUrl: string | null = null;
    if (transcodeStatus === 'ready') {
      const manifestKey =
        row.manifest_storage_key?.trim() ||
        hlsManifestStorageKeyForSourceKey(storageKey);
      hlsManifestUrl =
        buildEchoUploadPublicUrlForStorageKey(manifestKey) ?? null;
    }

    out.push({
      storageKey,
      sourcePublicUrl,
      title: titleFromStorageKey(storageKey),
      byteLength: Number(row.byte_length) || 0,
      createdAt: row.created_at.toISOString(),
      transcodeStatus,
      hlsManifestUrl,
      transcodeError: row.last_error?.trim() || null,
    });
  }
  return out;
}
