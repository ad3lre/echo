import { stat } from 'fs/promises';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from './s3UploadPresign';
import { resolveLocalUploadFilePath } from './localUploadDisk';

export type EchoStoredUploadVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'NOT_FOUND'
        | 'SIZE_MISMATCH'
        | 'TYPE_MISMATCH'
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
    return { ok: true };
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
    return { ok: true };
  }

  return { ok: false, reason: 'NOT_CONFIGURED' };
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
