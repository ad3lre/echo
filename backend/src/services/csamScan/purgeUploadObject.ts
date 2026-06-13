import { unlink } from 'node:fs/promises';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getPgPool } from '../../db/pg';
import { hlsPackPrefixForSourceKey } from '../../../../shared/echoUploadStorageKey';
import { echoUploadPrefersS3ObjectStore } from '../echoUploadObjectBackend';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from '../s3UploadPresign';
import { resolveLocalUploadFilePath } from '../localUploadDisk';
import { deleteEchoUploadPrefix } from '../echoUploadHlsObjectStore';
import { deleteEchoVideoPlayback } from '../echoVideoPlayback';

/**
 * Remove an upload object after a policy rejection (best-effort; logs are caller’s responsibility).
 */
export async function purgeEchoUploadObject(storageKey: string): Promise<void> {
  const packPrefix = hlsPackPrefixForSourceKey(storageKey);
  await deleteEchoUploadPrefix(packPrefix).catch(() => {});
  await deleteEchoUploadPrefix(`${packPrefix}.staging/`).catch(() => {});

  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
  } else {
    const abs = resolveLocalUploadFilePath(storageKey);
    if (abs) await unlink(abs).catch(() => {});
  }

  const pool = getPgPool();
  if (pool) {
    await deleteEchoVideoPlayback(pool, storageKey).catch(() => {});
  }
}
