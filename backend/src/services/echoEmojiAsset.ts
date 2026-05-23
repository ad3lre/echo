import path from 'path';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { FastifyReply } from 'fastify';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '../../../shared/echoS3ReadThrough';
import { config } from '../config';
import { sendError } from '../api/errors';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  getEchoUploadPublicUrlPrefixes,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import {
  ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX,
  resolveLocalUploadFilePath,
} from './localUploadDisk';

/** Same-origin path clients use for cross-guild custom emoji bytes. */
export const ECHO_CUSTOM_EMOJI_ASSET_PATH_PREFIX = '/api/v1/echo/emoji/';

export function buildEchoCustomEmojiAssetPath(emojiId: string): string {
  const id = emojiId.trim();
  return `${ECHO_CUSTOM_EMOJI_ASSET_PATH_PREFIX}${encodeURIComponent(id)}/asset`;
}

function decodeStorageKeyPath(encodedPath: string): string | null {
  try {
    const segments = encodedPath.split('/').filter((s) => s.length > 0);
    if (!segments.length) return null;
    return segments.map((seg) => decodeURIComponent(seg)).join('/');
  } catch {
    return null;
  }
}

/**
 * Recover S3/local storage key from a persisted custom-emoji `image_url`.
 */
export function extractStorageKeyFromEchoMediaUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;

  if (t.startsWith('echo/') && !/^https?:\/\//i.test(t)) {
    return t.replace(/^\/+/, '');
  }

  const tryPathSuffix = (pathname: string, prefix: string): string | null => {
    if (!pathname.startsWith(prefix)) return null;
    return decodeStorageKeyPath(pathname.slice(prefix.length));
  };

  if (t.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX)) {
    return decodeStorageKeyPath(
      t.slice(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX.length),
    );
  }
  if (t.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)) {
    return decodeStorageKeyPath(
      t.slice(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX.length),
    );
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromReadThrough = tryPathSuffix(
        u.pathname,
        ECHO_S3_PUBLIC_READ_THROUGH_PREFIX,
      );
      if (fromReadThrough) return fromReadThrough;

      const barePath = u.pathname.replace(/^\/+/, '');
      if (barePath.startsWith('echo/')) return barePath;

      if (u.hostname.toLowerCase().endsWith('.r2.dev')) {
        if (barePath.startsWith('echo/')) return barePath;
      }

      for (const prefix of getEchoUploadPublicUrlPrefixes()) {
        if (!prefix.startsWith('http')) continue;
        if (t.startsWith(prefix)) {
          return decodeStorageKeyPath(t.slice(prefix.length));
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

/** True when bytes are stored under server-scoped emoji upload ACL. */
export function customEmojiStoredUrlNeedsAssetProxy(imageUrl: string): boolean {
  const key = extractStorageKeyFromEchoMediaUrl(imageUrl);
  return !!key?.startsWith('echo/emoji/');
}

export function clientImageUrlForResolvedEmoji(
  emojiId: string,
  storedImageUrl: string,
): { imageUrl: string; assetUrl?: string } {
  if (customEmojiStoredUrlNeedsAssetProxy(storedImageUrl)) {
    const assetUrl = buildEchoCustomEmojiAssetPath(emojiId);
    return { imageUrl: assetUrl, assetUrl };
  }
  return { imageUrl: storedImageUrl };
}

export type EchoCustomEmojiRow = {
  id: string;
  server_id: string;
  name: string;
  animated: boolean;
  image_url: string;
  discord_source_emoji_id: string | null;
};

export async function getEchoCustomEmojiById(
  pool: pg.Pool,
  emojiId: string,
): Promise<EchoCustomEmojiRow | null> {
  const id = emojiId.trim();
  if (!id || !/^\d+$/.test(id) || id.length > 64) return null;
  const res = await pool.query<EchoCustomEmojiRow>(
    `SELECT id, server_id, name, animated, image_url, discord_source_emoji_id
     FROM echo_server_custom_emojis
     WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

function guessContentTypeFromPath(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  const m: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return m[ext] ?? 'application/octet-stream';
}

async function servedContentTypeForStorageKey(
  pool: pg.Pool,
  storageKey: string,
  fallback: string,
): Promise<string> {
  try {
    const r = await pool.query<{ content_type: string }>(
      `SELECT content_type FROM echo_upload_served_content_type WHERE storage_key = $1 LIMIT 1`,
      [storageKey],
    );
    const rowCt = r.rows[0]?.content_type;
    if (typeof rowCt === 'string' && rowCt.trim()) return rowCt.trim();
  } catch {
    /* optional table */
  }
  return fallback;
}

/**
 * Stream custom emoji bytes for any authenticated Echo user (cross-guild).
 * Does not require membership in the emoji's home server.
 */
export async function sendEchoCustomEmojiAsset(
  pool: pg.Pool,
  reply: FastifyReply,
  emojiId: string,
): Promise<void> {
  const row = await getEchoCustomEmojiById(pool, emojiId);
  if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Emoji not found');

  const stored = row.image_url?.trim() ?? '';
  if (!stored) return sendError(reply, 404, 'NOT_FOUND', 'Emoji has no image');

  const storageKey = extractStorageKeyFromEchoMediaUrl(stored);
  if (!storageKey)
    return sendError(reply, 404, 'NOT_FOUND', 'Emoji asset not available');

  if (config.echoLocalUploadDir) {
    const abs = resolveLocalUploadFilePath(storageKey);
    if (!abs) return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    try {
      await stat(abs);
    } catch {
      return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    }
    const ct = await servedContentTypeForStorageKey(
      pool,
      storageKey,
      guessContentTypeFromPath(abs),
    );
    const stream = createReadStream(abs);
    return reply
      .header('Cache-Control', 'private, max-age=300')
      .header('Vary', 'Cookie, Authorization')
      .type(ct)
      .send(stream);
  }

  if (!config.echoS3PublicReadThroughApi || !isEchoS3UploadConfigured()) {
    return sendError(reply, 404, 'NOT_FOUND', 'Not found');
  }

  const client = createEchoS3UploadClient();
  const bucket = getEchoS3UploadBucket();
  if (!client || !bucket) {
    return sendError(reply, 503, 'UPLOADS_NOT_CONFIGURED', 'S3 not configured');
  }

  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    const body = obj.Body;
    if (!body || typeof body !== 'object' || !('pipe' in body)) {
      return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    }
    const ct =
      (typeof obj.ContentType === 'string' && obj.ContentType.trim()) ||
      guessContentTypeFromPath(storageKey);
    const servedCt = await servedContentTypeForStorageKey(pool, storageKey, ct);
    return reply
      .header('Cache-Control', 'private, max-age=300')
      .header('Vary', 'Cookie, Authorization')
      .type(servedCt)
      .send(body as import('stream').Readable);
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 404) return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    return sendError(reply, 500, 'INTERNAL', 'Failed to read object');
  }
}
