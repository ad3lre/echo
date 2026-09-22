import { stat } from 'fs/promises';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { config } from '../../config';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from './s3UploadPresign';
import { resolveLocalUploadFilePath } from './localUploadDisk';
import { readEchoUploadObjectBytes } from '../csamScan/readUploadObjectBytes';

/**
 * Decode image uploads during registration. This bounds the synchronous memory
 * cost of the verification step while still rejecting a claimed image that is
 * actually arbitrary bytes. Large video/audio/document uploads are checked by
 * their declared type and exact object length and are handled by their media
 * processing pipelines.
 */
const MAX_IMAGE_VERIFY_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_VERIFY_PIXELS = 40_000_000;

export type EchoStoredUploadVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'NOT_FOUND'
        | 'SIZE_MISMATCH'
        | 'TYPE_MISMATCH'
        | 'CONTENT_INVALID'
        | 'CONTENT_TOO_LARGE_TO_VERIFY'
        | 'NOT_CONFIGURED'
        | 'INVALID_KEY';
    };

/** Verify a stored Echo upload object matches presign/register intent. */
export async function verifyEchoStoredUploadObject(opts: {
  storageKey: string;
  expectedByteLength: number;
  expectedContentType: string;
}): Promise<EchoStoredUploadVerifyResult> {
  const storageKey = opts.storageKey.trim();
  const expectedType = opts.expectedContentType.trim().toLowerCase();
  const expectedSize = Math.floor(opts.expectedByteLength);
  if (!storageKey || expectedSize < 1 || !expectedType) {
    return { ok: false, reason: 'INVALID_KEY' };
  }

  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const bucket = getEchoS3UploadBucket();
    const s3 = createEchoS3UploadClient();
    if (!bucket || !s3) {
      return { ok: false, reason: 'NOT_CONFIGURED' };
    }

    let head;
    try {
      head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
    } catch {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (Number(head.ContentLength ?? -1) !== expectedSize) {
      return { ok: false, reason: 'SIZE_MISMATCH' };
    }
    const headType = String(head.ContentType ?? '')
      .trim()
      .toLowerCase();
    if (!headType || headType !== expectedType) {
      return { ok: false, reason: 'TYPE_MISMATCH' };
    }
    return verifyImageBytesIfNeeded(storageKey, expectedSize, expectedType);
  }

  if (config.echoLocalUploadDir) {
    const abs = resolveLocalUploadFilePath(storageKey);
    if (!abs) return { ok: false, reason: 'INVALID_KEY' };
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (info.size !== expectedSize) {
      return { ok: false, reason: 'SIZE_MISMATCH' };
    }
    return verifyImageBytesIfNeeded(storageKey, expectedSize, expectedType);
  }

  return { ok: false, reason: 'NOT_CONFIGURED' };
}

async function verifyImageBytesIfNeeded(
  storageKey: string,
  expectedSize: number,
  expectedType: string,
): Promise<EchoStoredUploadVerifyResult> {
  if (!expectedType.startsWith('image/')) return { ok: true };
  if (expectedSize > MAX_IMAGE_VERIFY_BYTES) {
    return { ok: false, reason: 'CONTENT_TOO_LARGE_TO_VERIFY' };
  }

  let bytes: Buffer;
  try {
    bytes = await readEchoUploadObjectBytes({
      storageKey,
      byteLength: expectedSize,
    });
    const meta = await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_VERIFY_PIXELS,
    }).metadata();
    if (!meta.format || !meta.width || !meta.height) {
      return { ok: false, reason: 'CONTENT_INVALID' };
    }
    if (meta.width * meta.height > MAX_IMAGE_VERIFY_PIXELS) {
      return { ok: false, reason: 'CONTENT_INVALID' };
    }
    const actualType = imageContentTypeForSharpFormat(meta.format);
    if (!actualType || actualType !== expectedType) {
      return { ok: false, reason: 'CONTENT_INVALID' };
    }
  } catch {
    return { ok: false, reason: 'CONTENT_INVALID' };
  }
  return { ok: true };
}

function imageContentTypeForSharpFormat(format: string): string | null {
  switch (format.toLowerCase()) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'tiff':
      return 'image/tiff';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    case 'heif':
      return 'image/heif';
    default:
      return null;
  }
}

/** Best-effort object presence check (no size/type validation). */
export async function echoUploadObjectExists(
  storageKey: string,
): Promise<'exists' | 'missing' | 'not_configured'> {
  const key = storageKey.trim();
  if (!key) return 'missing';

  if (echoUploadPrefersS3ObjectStore(key)) {
    const bucket = getEchoS3UploadBucket();
    const s3 = createEchoS3UploadClient();
    if (!bucket || !s3) return 'not_configured';
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return 'exists';
    } catch {
      return 'missing';
    }
  }

  if (config.echoLocalUploadDir) {
    const abs = resolveLocalUploadFilePath(key);
    if (!abs) return 'missing';
    const info = await stat(abs).catch(() => null);
    return info?.isFile() ? 'exists' : 'missing';
  }

  return 'not_configured';
}
