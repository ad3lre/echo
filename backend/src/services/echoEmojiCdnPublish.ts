import path from 'path';
import { unlink } from 'fs/promises';
import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { ECHO_PUBLIC_EMOJI_OBJECT_KEY_PREFIX } from '../../../shared/echoEmojiCdn';
import { config } from '../config';
import { sanitizePublicCdnUrlForClient } from './echoEmojiCdnUrlPolicy';
import {
  buildEchoPublicEmojiCdnUrl,
  copyLocalPublishedEmojiObject,
  extractStorageKeyFromEchoMediaUrl,
} from './echoEmojiAsset';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { resolveLocalUploadFilePath } from './localUploadDisk';

function extensionFromStorageKey(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  if (['.png', '.gif', '.webp', '.jpg', '.jpeg'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.webp';
}

/** S3 CopySource: bucket/key with per-segment URI encoding. */
export function encodeS3CopySource(bucket: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${bucket}/${encodedKey}`;
}

export function publicEmojiObjectKeyForEmojiId(
  emojiId: string,
  sourceStorageKey: string,
): string {
  const ext = extensionFromStorageKey(sourceStorageKey);
  return `${ECHO_PUBLIC_EMOJI_OBJECT_KEY_PREFIX}${emojiId.trim()}${ext}`;
}

export function buildDirectEmojiCdnUrlFromObjectKey(
  objectKey: string,
): string | null {
  const base = (
    config.echoEmojiCdnBaseUrl?.trim() || config.s3UploadPublicBaseUrl?.trim()
  )?.replace(/\/$/, '');
  if (!base) return null;
  const encoded = objectKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `${base}/${encoded}`;
  return sanitizePublicCdnUrlForClient(url) ? url : null;
}

/**
 * Copy emoji bytes to `echo/public-emojis/{id}.{ext}` and persist `public_cdn_url`.
 * No-op when `ECHO_EMOJI_PUBLISH_TO_CDN` is false or storage is not configured.
 */
export async function publishEchoCustomEmojiToCdn(
  pool: pg.Pool,
  emojiId: string,
  imageUrl: string,
): Promise<string | null> {
  if (!config.echoEmojiPublishToCdn) return null;
  const storageKey = extractStorageKeyFromEchoMediaUrl(imageUrl.trim());
  if (!storageKey?.startsWith('echo/emoji/')) return null;

  const destKey = publicEmojiObjectKeyForEmojiId(emojiId, storageKey);
  let publicUrl: string | null = null;

  if (isEchoS3UploadConfigured()) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return null;
    const ct = storageKey.endsWith('.gif')
      ? 'image/gif'
      : storageKey.endsWith('.png')
        ? 'image/png'
        : storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'image/webp';
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodeS3CopySource(bucket, storageKey),
        Key: destKey,
        ContentType: ct,
        CacheControl: 'public, max-age=31536000, immutable',
        MetadataDirective: 'REPLACE',
      }),
    );
    publicUrl = buildDirectEmojiCdnUrlFromObjectKey(destKey);
  } else if (config.echoLocalUploadDir) {
    await copyLocalPublishedEmojiObject(storageKey, destKey);
    publicUrl = buildEchoPublicEmojiCdnUrl(emojiId);
  }

  const safe = sanitizePublicCdnUrlForClient(publicUrl);
  if (!safe) return null;

  await pool.query(
    `UPDATE echo_server_custom_emojis SET public_cdn_url = $2, updated_at = NOW() WHERE id = $1`,
    [emojiId.trim(), safe],
  );
  return safe;
}

/** Best-effort publish after insert; logs warning on failure. */
export async function tryPublishEchoCustomEmojiAfterInsert(
  pool: pg.Pool,
  emojiId: string,
  imageUrl: string,
  expressionKind?: 'emoji' | 'sticker' | string,
): Promise<void> {
  if (expressionKind === 'sticker') return;
  try {
    await publishEchoCustomEmojiToCdn(pool, emojiId, imageUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[echo-emoji-cdn] publish failed emojiId=${emojiId.trim()} reason=${msg}`,
    );
  }
}

export async function tryPublishEchoCustomEmojisAfterBulkInsert(
  pool: pg.Pool,
  rows: readonly { id: string; imageUrl: string }[],
): Promise<void> {
  for (const row of rows) {
    await tryPublishEchoCustomEmojiAfterInsert(
      pool,
      row.id,
      row.imageUrl,
      'emoji',
    );
  }
}

/** Remove published CDN object and clear `public_cdn_url`. */
export async function unpublishEchoCustomEmojiFromCdn(
  pool: pg.Pool,
  emojiId: string,
): Promise<void> {
  const id = emojiId.trim();
  const row = await pool.query<{
    public_cdn_url: string | null;
    image_url: string;
  }>(
    `SELECT public_cdn_url, image_url FROM echo_server_custom_emojis WHERE id = $1`,
    [id],
  );
  const stored = row.rows[0];
  if (!stored) return;

  let deleteKey: string | null = null;
  const fromPublic = stored.public_cdn_url?.trim()
    ? extractStorageKeyFromEchoMediaUrl(stored.public_cdn_url)
    : null;
  if (fromPublic?.startsWith(ECHO_PUBLIC_EMOJI_OBJECT_KEY_PREFIX)) {
    deleteKey = fromPublic;
  } else {
    const srcKey = extractStorageKeyFromEchoMediaUrl(
      stored.image_url?.trim() ?? '',
    );
    if (srcKey) deleteKey = publicEmojiObjectKeyForEmojiId(id, srcKey);
  }

  if (deleteKey && isEchoS3UploadConfigured()) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (client && bucket) {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: deleteKey }),
        );
      } catch {
        /* best-effort */
      }
    }
  } else if (deleteKey && config.echoLocalUploadDir) {
    const abs = resolveLocalUploadFilePath(deleteKey);
    if (abs) {
      try {
        await unlink(abs);
      } catch {
        /* best-effort */
      }
    }
  }

  await pool.query(
    `UPDATE echo_server_custom_emojis SET public_cdn_url = NULL, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}
