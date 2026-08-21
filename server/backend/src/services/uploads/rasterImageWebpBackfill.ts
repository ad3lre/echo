import { createReadStream } from 'node:fs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { config } from '../../config';
import {
  ECHO_MEDIA_AVATAR_MAX_DIMENSION,
  ECHO_MEDIA_UPLOAD_MAX_DIMENSION,
  isRasterImageStorageKey,
} from '../../../../../contracts/mediaCdnVariants';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import { deleteEchoUploadObjectKey } from '../../../../media/src/hls/objectStore';
import { resolveLocalUploadFilePath } from './localUploadDisk';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { prepareRasterForEchoStorage } from './rasterImageTranscode';
import { storeEchoUploadBuffer } from './echoUploadStoreBuffer';
import { replaceEchoMessageStorageKeyReferences } from '../../domain/echoMessagesDal';

const READ_MAX_BYTES = 100 * 1024 * 1024;

const RASTER_BACKFILL_EXTENSION_RE = /\.(png|jpe?g|bmp|tiff?|heic|heif)$/i;

export type RasterWebpBackfillCandidate = {
  storageKey: string;
  byteLength: number | null;
  contentType: string | null;
};

export type RasterWebpBackfillResult =
  | {
      ok: true;
      action: 'transcoded' | 'skipped';
      reason?: string;
      newKey?: string;
    }
  | { ok: false; error: string };

function isBackfillEligibleStorageKey(storageKey: string): boolean {
  const key = storageKey.trim();
  if (!key || !isRasterImageStorageKey(key)) return false;
  if (key.toLowerCase().endsWith('.webp')) return false;
  if (key.toLowerCase().endsWith('.gif')) return false;
  if (key.includes('/hls/')) return false;
  return RASTER_BACKFILL_EXTENSION_RE.test(key);
}

export function webpStorageKeyForRasterKey(storageKey: string): string | null {
  const key = storageKey.trim();
  if (!isBackfillEligibleStorageKey(key)) return null;
  const ext = path.extname(key);
  if (!ext) return `${key}.webp`;
  return `${key.slice(0, -ext.length)}.webp`;
}

function maxDimensionForStorageKey(storageKey: string): number {
  if (storageKey.startsWith('echo/avatars/')) {
    return ECHO_MEDIA_AVATAR_MAX_DIMENSION;
  }
  return ECHO_MEDIA_UPLOAD_MAX_DIMENSION;
}

function replacementVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const encoded = trimmed.split('/').map(encodeURIComponent).join('/');
  return encoded === trimmed ? [trimmed] : [trimmed, encoded];
}

function buildReferenceReplacements(
  oldKey: string,
  newKey: string,
): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (const from of replacementVariants(oldKey)) {
    for (const to of replacementVariants(newKey)) {
      out.push({ from, to });
    }
  }
  const oldUrl = buildEchoUploadPublicUrlForStorageKey(oldKey);
  const newUrl = buildEchoUploadPublicUrlForStorageKey(newKey);
  if (oldUrl && newUrl && oldUrl !== newUrl) {
    for (const from of replacementVariants(oldUrl)) {
      for (const to of replacementVariants(newUrl)) {
        out.push({ from, to });
      }
    }
  }
  return out;
}

async function readEchoUploadObjectBufferLoose(
  storageKey: string,
): Promise<Buffer | null> {
  try {
    if (echoUploadPrefersS3ObjectStore(storageKey)) {
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) return null;
      const obj = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
      const body = obj.Body;
      if (!body || typeof body !== 'object' || !('pipe' in body)) return null;
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > READ_MAX_BYTES) return null;
        chunks.push(buf);
      }
      return Buffer.concat(chunks);
    }

    const abs = resolveLocalUploadFilePath(storageKey);
    if (!abs) return null;
    const stream = createReadStream(abs, { flags: 'r' });
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > READ_MAX_BYTES) return null;
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function objectExists(storageKey: string): Promise<boolean> {
  const buf = await readEchoUploadObjectBufferLoose(storageKey);
  return !!buf?.length;
}

export async function listRasterWebpBackfillCandidates(
  pool: pg.Pool,
  opts?: { prefix?: string; limit?: number },
): Promise<RasterWebpBackfillCandidate[]> {
  const prefix = opts?.prefix?.trim() ?? '';
  const limit =
    opts?.limit != null && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.floor(opts.limit)
      : null;

  const params: unknown[] = [];
  let where = `WHERE (
      r.storage_key ~* '\\.(png|jpe?g|bmp|tiff?|heic|heif)$'
      AND r.storage_key !~* '\\.webp$'
      AND r.storage_key !~* '\\.gif$'
      AND r.storage_key NOT LIKE '%/hls/%'
      AND r.purge_status = 'active'
    )`;
  if (prefix) {
    params.push(`${prefix}%`);
    where += ` AND r.storage_key LIKE $${params.length}`;
  }

  const limitSql = limit != null ? ` LIMIT ${limit}` : '';
  const { rows } = await pool.query<{
    storage_key: string;
    byte_length: string | number | null;
    content_type: string | null;
  }>(
    `SELECT r.storage_key, r.byte_length, c.content_type
     FROM echo_chat_upload_retention r
     LEFT JOIN echo_upload_served_content_type c
       ON c.storage_key = r.storage_key
     ${where}
     ORDER BY r.created_at ASC${limitSql}`,
    params,
  );

  return rows
    .filter((row) => isBackfillEligibleStorageKey(row.storage_key))
    .map((row) => ({
      storageKey: row.storage_key,
      byteLength:
        row.byte_length == null ? null : Number(row.byte_length) || null,
      contentType: row.content_type,
    }));
}

async function rewriteStorageKeyReferences(
  pool: pg.Pool,
  oldKey: string,
  newKey: string,
): Promise<{ messages: number; users: number; intents: number }> {
  const replacements = buildReferenceReplacements(oldKey, newKey);
  const likeNeedle = `%${oldKey}%`;

  let messagesUpdated = 0;
  for (const rep of replacements) {
    messagesUpdated += await replaceEchoMessageStorageKeyReferences(
      pool,
      rep.from,
      rep.to,
    );
  }

  let usersUpdated = 0;
  for (const col of ['pfp', 'banner_image'] as const) {
    for (const rep of replacements) {
      const res = await pool.query(
        `UPDATE auth_users
         SET ${col} = replace(${col}, $1, $2), updated_at = NOW()
         WHERE ${col} IS NOT NULL AND ${col} LIKE $3`,
        [rep.from, rep.to, likeNeedle],
      );
      usersUpdated += res.rowCount ?? 0;
    }
  }

  let intentsUpdated = 0;
  for (const rep of replacements) {
    const res = await pool.query(
      `UPDATE echo_upload_intent
       SET storage_key = replace(storage_key, $1, $2)
       WHERE storage_key LIKE $3`,
      [rep.from, rep.to, likeNeedle],
    );
    intentsUpdated += res.rowCount ?? 0;
  }

  return {
    messages: messagesUpdated,
    users: usersUpdated,
    intents: intentsUpdated,
  };
}

async function migrateRetentionAndContentType(
  pool: pg.Pool,
  oldKey: string,
  newKey: string,
  byteLength: number,
  contentType: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_upload_served_content_type WHERE storage_key = $1`,
    [oldKey],
  );
  await pool.query(
    `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
     VALUES ($1, $2)
     ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
    [newKey, contentType],
  );

  await pool.query(
    `UPDATE echo_chat_upload_retention
     SET storage_key = $2, byte_length = $3
     WHERE storage_key = $1`,
    [oldKey, newKey, byteLength],
  );
}

function guessContentType(storageKey: string, hinted: string | null): string {
  if (hinted?.trim()) return hinted.trim().toLowerCase();
  const ext = path.extname(storageKey).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  return map[ext] ?? 'image/png';
}

export async function backfillRasterStorageKeyToWebp(
  pool: pg.Pool,
  storageKey: string,
  opts: {
    execute: boolean;
    contentType?: string | null;
    log?: FastifyBaseLogger;
  },
): Promise<RasterWebpBackfillResult> {
  const oldKey = storageKey.trim();
  const newKey = webpStorageKeyForRasterKey(oldKey);
  if (!newKey) {
    return { ok: true, action: 'skipped', reason: 'ineligible_key' };
  }
  if (newKey === oldKey) {
    return { ok: true, action: 'skipped', reason: 'already_webp' };
  }

  if (!isEchoS3UploadConfigured() && !config.echoLocalUploadDir) {
    return { ok: false, error: 'storage_not_configured' };
  }

  if (await objectExists(newKey)) {
    return { ok: true, action: 'skipped', reason: 'webp_key_exists', newKey };
  }

  const sourceBuf = await readEchoUploadObjectBufferLoose(oldKey);
  if (!sourceBuf?.length) {
    return { ok: false, error: 'source_missing' };
  }

  const sourceCt = guessContentType(oldKey, opts.contentType ?? null);
  const prepared = await prepareRasterForEchoStorage(sourceBuf, sourceCt, {
    maxDimension: maxDimensionForStorageKey(oldKey),
  });

  if (
    !prepared.transcoded &&
    prepared.ext === '.webp' &&
    newKey.endsWith('.webp')
  ) {
    // Still migrate key suffix when bytes are already webp-sized.
  }

  if (!opts.execute) {
    return {
      ok: true,
      action: 'transcoded',
      reason: 'dry_run',
      newKey,
    };
  }

  const stored = await storeEchoUploadBuffer({
    pool,
    storageKey: newKey,
    buf: prepared.buf,
    contentType: prepared.contentType,
  });
  if (!stored.ok) {
    return { ok: false, error: stored.reason };
  }

  const refs = await rewriteStorageKeyReferences(pool, oldKey, newKey);
  await migrateRetentionAndContentType(
    pool,
    oldKey,
    newKey,
    prepared.buf.length,
    prepared.contentType,
  );

  await deleteEchoUploadObjectKey(oldKey).catch((err) => {
    opts.log?.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        oldKeyHead: oldKey.slice(0, 40),
        msg: 'raster_webp_backfill.delete_old_failed',
      },
      'Failed to delete old raster object after webp migration',
    );
  });

  opts.log?.info(
    {
      oldKeyHead: oldKey.slice(0, 48),
      newKeyHead: newKey.slice(0, 48),
      refs,
      msg: 'raster_webp_backfill.transcoded',
    },
    'Raster image migrated to WebP storage key',
  );

  return { ok: true, action: 'transcoded', newKey };
}

export async function runRasterWebpBackfill(
  pool: pg.Pool,
  opts: {
    execute: boolean;
    prefix?: string;
    limit?: number;
    log?: FastifyBaseLogger;
  },
): Promise<{
  scanned: number;
  transcoded: number;
  skipped: number;
  failed: number;
}> {
  const candidates = await listRasterWebpBackfillCandidates(pool, {
    prefix: opts.prefix,
    limit: opts.limit,
  });

  let transcoded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const result = await backfillRasterStorageKeyToWebp(pool, row.storageKey, {
      execute: opts.execute,
      contentType: row.contentType,
      log: opts.log,
    });
    if (!result.ok) {
      failed += 1;
      opts.log?.warn(
        {
          storageKeyHead: row.storageKey.slice(0, 48),
          error: result.error,
          msg: 'raster_webp_backfill.failed',
        },
        'Raster webp backfill failed for key',
      );
      continue;
    }
    if (result.action === 'skipped') {
      skipped += 1;
    } else {
      transcoded += 1;
    }
  }

  return {
    scanned: candidates.length,
    transcoded,
    skipped,
    failed,
  };
}
