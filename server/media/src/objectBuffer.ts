import { readFile } from 'node:fs/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { resolveLocalUploadFilePath } from './localOrigin';
import { getMediaCdnS3Client } from './s3Origin';
import { mediaCdnConfig } from './config';
import { echoUploadPrefersS3ObjectStore } from './uploadBackend';

export async function fetchObjectBuffer(
  storageKey: string,
): Promise<Buffer | null> {
  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = getMediaCdnS3Client();
    const bucket = mediaCdnConfig.s3Bucket;
    if (!client || !bucket) return null;
    const obj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    const body = obj.Body;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const absPath = resolveLocalUploadFilePath(storageKey);
  if (!absPath) return null;
  try {
    return await readFile(absPath);
  } catch {
    return null;
  }
}
