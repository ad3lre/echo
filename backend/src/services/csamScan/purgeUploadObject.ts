import { unlink } from 'node:fs/promises';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from '../s3UploadPresign';
import { resolveLocalUploadFilePath } from '../localUploadDisk';

/**
 * Remove an upload object after a policy rejection (best-effort; logs are caller’s responsibility).
 */
export async function purgeEchoUploadObject(storageKey: string): Promise<void> {
  if (isEchoS3UploadConfigured()) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    return;
  }
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) return;
  await unlink(abs).catch(() => {});
}
