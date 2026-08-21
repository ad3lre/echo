import path from 'path';
import { createReadStream } from 'fs';
import { stat, copyFile, mkdir } from 'fs/promises';
import type { FastifyReply } from 'fastify';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '../../../../contracts/echoEmojiCdn';
import { extractStorageKeyFromEchoMediaUrl as extractStorageKeyShared } from '../../../../contracts/echoUploadStorageKey';
import { config } from '../config';
import { sendError } from '../api/errors';
import { sanitizePublicCdnUrlForClient } from './echoEmojiCdnUrlPolicy';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  getEchoUploadPublicUrlPrefixes,
  isEchoS3UploadConfigured,
} from './uploads/s3UploadPresign';
import { resolveLocalUploadFilePath } from './uploads/localUploadDisk';

/** @deprecated Prefer {@link ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX} for resolve/display URLs. */
export const ECHO_CUSTOM_EMOJI_ASSET_PATH_PREFIX = '/api/v1/echo/emoji/';

export function buildEchoCustomEmojiAssetPath(emojiId: string): string {
  const id = emojiId.trim();
  return `${ECHO_CUSTOM_EMOJI_ASSET_PATH_PREFIX}${encodeURIComponent(id)}/asset`;
}

export function buildEchoPublicEmojiCdnPath(emojiId: string): string {
  const id = emojiId.trim();
  return `${ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX}${encodeURIComponent(id)}`;
}

/** Absolute URL for clients when `ECHO_EMOJI_PUBLIC_BASE_URL` / `ECHO_API_PUBLIC_URL` is configured. */
export function buildEchoPublicEmojiCdnUrl(
  emojiId: string,
  cacheVersion?: string | number | null,
): string {
  const rel = buildEchoPublicEmojiCdnPath(emojiId);
  const base = (
    config.echoEmojiPublicBaseUrl?.trim() ??
    config.echoApiPublicUrl?.trim() ??
    ''
  ).replace(/\/$/, '');
  if (!base) return rel;
  const url = new URL(rel, `${base}/`);
  if (cacheVersion != null && String(cacheVersion).trim() !== '') {
    url.searchParams.set('v', String(cacheVersion).trim());
  }
  return url.href;
}

/**
 * Recover S3/local storage key from a persisted custom-emoji `image_url`.
 */
export function extractStorageKeyFromEchoMediaUrl(url: string): string | null {
  return extractStorageKeyShared(url, {
    httpPublicUrlPrefixes: getEchoUploadPublicUrlPrefixes().filter((p) =>
      p.startsWith('http'),
    ),
    httpMediaCdnBaseUrls: config.echoMediaCdnBaseUrl
      ? [config.echoMediaCdnBaseUrl]
      : [],
  });
}

/** True when bytes are stored under server-scoped emoji upload ACL. */
export function customEmojiStoredUrlNeedsAssetProxy(imageUrl: string): boolean {
  const key = extractStorageKeyFromEchoMediaUrl(imageUrl);
  return !!key?.startsWith('echo/emoji/');
}

export function clientImageUrlForResolvedEmoji(
  emojiId: string,
  storedImageUrl: string,
  options?: {
    publicCdnUrl?: string | null;
    cacheVersion?: string | number | null;
  },
): { imageUrl: string; assetUrl?: string } {
  const published = sanitizePublicCdnUrlForClient(options?.publicCdnUrl);
  if (published) {
    return { imageUrl: published, assetUrl: published };
  }
  if (customEmojiStoredUrlNeedsAssetProxy(storedImageUrl)) {
    const assetUrl = buildEchoPublicEmojiCdnUrl(emojiId, options?.cacheVersion);
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
  created_at: Date;
  updated_at: Date;
  public_cdn_url: string | null;
};

export async function getEchoCustomEmojiById(
  pool: pg.Pool,
  emojiId: string,
): Promise<EchoCustomEmojiRow | null> {
  const id = emojiId.trim();
  if (!id || !/^\d+$/.test(id) || id.length > 64) return null;
  const res = await pool.query<EchoCustomEmojiRow>(
    `SELECT id, server_id, name, animated, image_url, discord_source_emoji_id,
            created_at, updated_at, public_cdn_url
     FROM echo_server_custom_emojis
     WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

/** Emoji asset routes: emoji rows only (not stickers). */
export async function getEchoPublicCustomEmojiById(
  pool: pg.Pool,
  emojiId: string,
): Promise<EchoCustomEmojiRow | null> {
  const id = emojiId.trim();
  if (!id || !/^\d+$/.test(id) || id.length > 64) return null;
  const res = await pool.query<EchoCustomEmojiRow>(
    `SELECT id, server_id, name, animated, image_url, discord_source_emoji_id,
            created_at, updated_at, public_cdn_url
     FROM echo_server_custom_emojis
     WHERE id = $1 AND COALESCE(expression_kind, 'emoji') = 'emoji'`,
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

export function emojiCacheVersion(row: EchoCustomEmojiRow): number | undefined {
  const raw = row.updated_at ?? row.created_at;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export function emojiEtag(row: EchoCustomEmojiRow): string {
  const v = emojiCacheVersion(row) ?? 0;
  return `"${row.id}-${v}"`;
}

type EmojiAssetCacheMode = 'public' | 'private';

function applyEmojiAssetCacheHeaders(
  reply: FastifyReply,
  mode: EmojiAssetCacheMode,
  statusOk: boolean,
  etag?: string,
): void {
  if (mode === 'public') {
    if (statusOk) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      if (etag) reply.header('ETag', etag);
    } else {
      reply.header('Cache-Control', 'public, max-age=60');
    }
    return;
  }
  reply
    .header('Cache-Control', 'private, max-age=300')
    .header('Vary', 'Cookie, Authorization');
}

function ifNoneMatchMatches(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch?.trim()) return false;
  const tags = ifNoneMatch.split(',').map((t) => t.trim());
  return tags.some((t) => t === etag || t === '*');
}

async function streamEchoCustomEmojiBytes(
  pool: pg.Pool,
  reply: FastifyReply,
  row: EchoCustomEmojiRow,
  mode: EmojiAssetCacheMode,
  opts?: { ifNoneMatch?: string },
): Promise<void> {
  const stored = row.image_url?.trim() ?? '';
  if (!stored) {
    applyEmojiAssetCacheHeaders(reply, mode, false);
    return sendError(reply, 404, 'NOT_FOUND', 'Emoji has no image');
  }

  const storageKey = extractStorageKeyFromEchoMediaUrl(stored);
  if (!storageKey) {
    applyEmojiAssetCacheHeaders(reply, mode, false);
    return sendError(reply, 404, 'NOT_FOUND', 'Emoji asset not available');
  }

  const etag = mode === 'public' ? emojiEtag(row) : undefined;
  if (
    mode === 'public' &&
    etag &&
    ifNoneMatchMatches(opts?.ifNoneMatch, etag)
  ) {
    applyEmojiAssetCacheHeaders(reply, mode, true, etag);
    return reply.code(304).send();
  }

  if (config.echoLocalUploadDir) {
    const abs = resolveLocalUploadFilePath(storageKey);
    if (!abs) {
      applyEmojiAssetCacheHeaders(reply, mode, false);
      return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    }
    try {
      await stat(abs);
    } catch {
      applyEmojiAssetCacheHeaders(reply, mode, false);
      return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    }
    const ct = await servedContentTypeForStorageKey(
      pool,
      storageKey,
      guessContentTypeFromPath(abs),
    );
    const stream = createReadStream(abs);
    applyEmojiAssetCacheHeaders(reply, mode, true, etag);
    return reply.type(ct).send(stream);
  }

  if (!isEchoS3UploadConfigured()) {
    applyEmojiAssetCacheHeaders(reply, mode, false);
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
      applyEmojiAssetCacheHeaders(reply, mode, false);
      return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    }
    const ct =
      (typeof obj.ContentType === 'string' && obj.ContentType.trim()) ||
      guessContentTypeFromPath(storageKey);
    const servedCt = await servedContentTypeForStorageKey(pool, storageKey, ct);
    applyEmojiAssetCacheHeaders(reply, mode, true, etag);
    return reply.type(servedCt).send(body as import('stream').Readable);
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    applyEmojiAssetCacheHeaders(reply, mode, false);
    if (status === 404) return sendError(reply, 404, 'NOT_FOUND', 'Not found');
    return sendError(reply, 500, 'INTERNAL', 'Failed to read object');
  }
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
  const row = await getEchoPublicCustomEmojiById(pool, emojiId);
  if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Emoji not found');
  return streamEchoCustomEmojiBytes(pool, reply, row, 'private');
}

/**
 * Public cacheable emoji bytes for cross-guild `<img src>` (no auth).
 */
export async function sendEchoPublicCustomEmojiAsset(
  pool: pg.Pool,
  reply: FastifyReply,
  emojiId: string,
  opts?: { ifNoneMatch?: string },
): Promise<void> {
  const row = await getEchoPublicCustomEmojiById(pool, emojiId);
  if (!row) {
    applyEmojiAssetCacheHeaders(reply, 'public', false);
    return sendError(reply, 404, 'NOT_FOUND', 'Emoji not found');
  }

  const published = sanitizePublicCdnUrlForClient(row.public_cdn_url);
  const cdnBase = (
    config.echoEmojiCdnBaseUrl?.trim() || config.s3UploadPublicBaseUrl?.trim()
  )?.replace(/\/$/, '');
  if (published && cdnBase && published.startsWith(cdnBase)) {
    const etag = emojiEtag(row);
    if (ifNoneMatchMatches(opts?.ifNoneMatch, etag)) {
      applyEmojiAssetCacheHeaders(reply, 'public', true, etag);
      return reply.code(304).send();
    }
    applyEmojiAssetCacheHeaders(reply, 'public', true, etag);
    return reply.code(302).header('Location', published).send();
  }

  return streamEchoCustomEmojiBytes(pool, reply, row, 'public', opts);
}

/** Copy published emoji object on local disk (dev fallback when S3 CDN is off). */
export async function copyLocalPublishedEmojiObject(
  sourceStorageKey: string,
  destStorageKey: string,
): Promise<void> {
  const root = config.echoLocalUploadDir;
  if (!root) return;
  const srcAbs = resolveLocalUploadFilePath(sourceStorageKey);
  const destAbs = resolveLocalUploadFilePath(destStorageKey);
  if (!srcAbs || !destAbs) return;
  await mkdir(path.dirname(destAbs), { recursive: true });
  await copyFile(srcAbs, destAbs);
}
