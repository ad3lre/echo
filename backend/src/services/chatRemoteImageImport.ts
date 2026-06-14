import path from 'path';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import {
  canSafelyResolveUrlForOutboundFetch,
  ssrfSafeFetch,
} from './linkUnfurl/linkUnfurlFetch';
import { safeFetchAgent } from './linkUnfurl/safeFetchAgent';
import { extractEchoStorageKeyFromPublicUrl } from './echoUploadPublicUrl';
import { resolveEchoUploadStorageKey } from './echoUploadResolveDest';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isAllowedChatUploadContentType,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { registerChatUploadRetention } from './chatUploadRetention';
import { probeImageDimensionsFromBuffer } from './probeImageDimensionsFromBuffer';

const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 30_000;

function coerceAllowedImageContentType(
  headerCt: string | null | undefined,
  filenameHint?: string,
): string | null {
  const fromHeader = headerCt?.trim().toLowerCase();
  if (fromHeader && isAllowedChatUploadContentType(fromHeader)) {
    if (fromHeader.startsWith('image/')) return fromHeader;
    return null;
  }
  const fn = (filenameHint ?? '').toLowerCase();
  const dot = fn.lastIndexOf('.');
  const ext = dot >= 0 ? fn.slice(dot) : '';
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  const guessed = map[ext];
  if (guessed && isAllowedChatUploadContentType(guessed)) return guessed;
  return null;
}

function extForContentType(ct: string): string {
  const t = ct.toLowerCase();
  if (t === 'image/png') return '.png';
  if (t === 'image/jpeg') return '.jpg';
  if (t === 'image/gif') return '.gif';
  if (t === 'image/webp') return '.webp';
  if (t === 'image/bmp') return '.bmp';
  if (t === 'image/tiff') return '.tiff';
  if (t === 'image/heic') return '.heic';
  if (t === 'image/heif') return '.heif';
  return '.jpg';
}

async function fetchRemoteImageBuffer(
  url: string,
  maxBytes: number,
): Promise<{ buf: Buffer; contentType: string; filenameHint: string } | null> {
  let current = url.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await canSafelyResolveUrlForOutboundFetch(current))) return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      const fetchInit: RequestInit = {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          Accept: 'image/*',
          'User-Agent': 'EchoChatRemoteImageImport/1.0',
        },
      };
      Object.assign(fetchInit, { dispatcher: safeFetchAgent });
      res = await ssrfSafeFetch(current, fetchInit);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;

    let filenameHint = 'image.jpg';
    try {
      filenameHint = path.basename(new URL(current).pathname) || filenameHint;
    } catch {
      /* keep default */
    }

    const headerCt = res.headers.get('content-type')?.split(';')[0]?.trim();
    const cl = res.headers.get('content-length');
    if (cl) {
      const n = Number(cl);
      if (Number.isFinite(n) && n > maxBytes) return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength < 1 || ab.byteLength > maxBytes) return null;
    const ct =
      coerceAllowedImageContentType(headerCt, filenameHint) ??
      coerceAllowedImageContentType(null, filenameHint);
    if (!ct) return null;
    return { buf: Buffer.from(ab), contentType: ct, filenameHint };
  }
  return null;
}

export type ImportChatRemoteImageResult =
  | {
      ok: true;
      url: string;
      storageKey: string;
      mimeType: string;
      fileSize: number;
      width?: number;
      height?: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

/** Fetch a public https image and store it as a chat attachment on Echo storage. */
export async function importChatRemoteImage(opts: {
  pool: pg.Pool;
  userId: string;
  channelId: string;
  sourceUrl: string;
  maxBytes: number;
  log?: FastifyBaseLogger;
}): Promise<ImportChatRemoteImageResult> {
  const { pool, userId, channelId, sourceUrl, maxBytes, log } = opts;
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: 'url required',
    };
  }

  const existingKey = extractEchoStorageKeyFromPublicUrl(trimmed);
  if (existingKey) {
    const url = buildEchoUploadPublicUrlForStorageKey(existingKey);
    if (url) {
      return {
        ok: true,
        url,
        storageKey: existingKey,
        mimeType: 'image/jpeg',
        fileSize: 0,
      };
    }
  }

  if (!isEchoS3UploadConfigured() && !config.echoLocalUploadDir) {
    return {
      ok: false,
      status: 503,
      code: 'NOT_CONFIGURED',
      message: 'File storage is not configured on this server.',
    };
  }

  const fetched = await fetchRemoteImageBuffer(trimmed, maxBytes);
  if (!fetched) {
    return {
      ok: false,
      status: 400,
      code: 'REMOTE_IMAGE_FETCH_FAILED',
      message: 'Could not fetch that image URL.',
    };
  }

  const ext =
    (fetched.filenameHint && path.extname(fetched.filenameHint.trim())) ||
    extForContentType(fetched.contentType);
  const objectKey = `remote-image-${nextEchoSnowflakeId()}${ext || '.jpg'}`;
  const dest = await resolveEchoUploadStorageKey(pool, userId, {
    channelId,
    contentType: fetched.contentType,
    objectKey,
  });
  if (!dest.ok) {
    return {
      ok: false,
      status: dest.error.status,
      code: dest.error.code,
      message: dest.error.message,
    };
  }

  try {
    if (config.echoLocalUploadDir) {
      await writeLocalEchoUploadFile(dest.storageKey, fetched.buf);
      await pool.query(
        `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
         VALUES ($1, $2)
         ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
        [dest.storageKey, fetched.contentType],
      );
    } else {
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) {
        return {
          ok: false,
          status: 503,
          code: 'NOT_CONFIGURED',
          message: 'File storage is not configured on this server.',
        };
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: dest.storageKey,
          Body: fetched.buf,
          ContentType: fetched.contentType,
        }),
      );
    }
  } catch (e) {
    log?.warn(
      {
        err: e instanceof Error ? e.message : String(e),
        msg: 'chat.remote_image_import.store_failed',
      },
      'Failed to store imported remote image',
    );
    return {
      ok: false,
      status: 500,
      code: 'STORE_FAILED',
      message: 'Failed to store imported image.',
    };
  }

  const url = buildEchoUploadPublicUrlForStorageKey(dest.storageKey);
  if (!url) {
    return {
      ok: false,
      status: 500,
      code: 'STORE_FAILED',
      message: 'Failed to build public URL for imported image.',
    };
  }

  await registerChatUploadRetention(pool, {
    storageKey: dest.storageKey,
    byteLength: fetched.buf.length,
    sourceType: 'user',
    uploaderId: userId,
  });

  const dims = probeImageDimensionsFromBuffer(fetched.buf, fetched.contentType);

  return {
    ok: true,
    url,
    storageKey: dest.storageKey,
    mimeType: fetched.contentType,
    fileSize: fetched.buf.length,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  };
}
