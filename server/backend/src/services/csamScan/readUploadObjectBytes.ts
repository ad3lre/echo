import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';
import { echoUploadPrefersS3ObjectStore } from '../uploads/echoUploadObjectBackend';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from '../uploads/s3UploadPresign';
import { resolveLocalUploadFilePath } from '../uploads/localUploadDisk';

export async function readEchoUploadObjectBytes(opts: {
  storageKey: string;
  byteLength: number;
}): Promise<Buffer> {
  const { storageKey, byteLength } = opts;
  if (
    !Number.isFinite(byteLength) ||
    !Number.isInteger(byteLength) ||
    byteLength < 1
  ) {
    throw new Error('invalid byteLength');
  }

  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) throw new Error('S3 not configured');
    const obj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    const body = obj.Body;
    if (!body || typeof body !== 'object' || !('pipe' in body)) {
      throw new Error('invalid S3 object body');
    }
    return readStreamToExactBuffer(body as Readable, byteLength);
  }

  const root = config.echoLocalUploadDir;
  if (!root) throw new Error('local uploads not configured');
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) throw new Error('invalid storage key');
  const stream = createReadStream(abs, { flags: 'r' });
  return readStreamToExactBuffer(stream, byteLength);
}

async function readStreamToExactBuffer(
  stream: Readable,
  expected: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as unknown as Uint8Array);
    total += b.length;
    if (total > expected) {
      stream.destroy();
      throw new Error('object larger than declared size');
    }
    chunks.push(b);
  }
  if (total !== expected) {
    throw new Error('object smaller than declared size');
  }
  return Buffer.concat(chunks, expected);
}
