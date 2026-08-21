import type pg from 'pg';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from './s3UploadPresign';

export type StoreEchoUploadBufferResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_CONFIGURED' };

export async function storeEchoUploadBuffer(opts: {
  pool: pg.Pool;
  storageKey: string;
  buf: Buffer;
  contentType: string;
}): Promise<StoreEchoUploadBufferResult> {
  const { pool, storageKey, buf, contentType } = opts;
  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return { ok: false, reason: 'NOT_CONFIGURED' };
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buf,
        ContentType: contentType,
      }),
    );
    return { ok: true };
  }
  if (config.echoLocalUploadDir) {
    await writeLocalEchoUploadFile(storageKey, buf);
    await pool.query(
      `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
       VALUES ($1, $2)
       ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
      [storageKey, contentType],
    );
    return { ok: true };
  }
  return { ok: false, reason: 'NOT_CONFIGURED' };
}
