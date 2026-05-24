import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { stat } from 'node:fs/promises';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { resolveLocalUploadFilePath } from './localUploadDisk';

export type EchoUploadSourceMetadata = {
  size: number;
  etag: string;
};

export async function readEchoUploadSourceMetadata(
  storageKey: string,
): Promise<EchoUploadSourceMetadata | null> {
  if (isEchoS3UploadConfigured()) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return null;
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
      const size =
        typeof head.ContentLength === 'number' ? head.ContentLength : 0;
      const etag =
        typeof head.ETag === 'string' ? head.ETag.replace(/"/g, '') : '';
      if (size < 1 || !etag) return null;
      return { size, etag };
    } catch {
      return null;
    }
  }
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) return null;
  try {
    const st = await stat(abs);
    if (st.size < 1) return null;
    return {
      size: st.size,
      etag: `${Math.trunc(st.mtimeMs)}-${st.size}`,
    };
  } catch {
    return null;
  }
}

export function localSourceFingerprint(mtimeMs: number, size: number): string {
  return `${Math.trunc(mtimeMs)}-${size}`;
}
