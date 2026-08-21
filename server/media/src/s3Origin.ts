import path from 'node:path';
import https from 'node:https';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Readable } from 'node:stream';
import { isMediaCdnS3Configured, mediaCdnConfig } from './config';

let cachedClient: S3Client | null | undefined;

export function getMediaCdnS3Client(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  if (!isMediaCdnS3Configured()) {
    cachedClient = null;
    return null;
  }
  cachedClient = new S3Client({
    region: mediaCdnConfig.s3Region!,
    endpoint: mediaCdnConfig.s3Endpoint || undefined,
    credentials: {
      accessKeyId: mediaCdnConfig.s3AccessKey!,
      secretAccessKey: mediaCdnConfig.s3SecretKey!,
    },
    forcePathStyle: !!mediaCdnConfig.s3Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({
        maxSockets: 500,
        keepAlive: true,
        keepAliveMsecs: 1000,
        timeout: 30000,
      }),
      connectionTimeout: 5000,
      requestTimeout: 30000,
      socketAcquisitionWarningTimeout: 60000,
    }),
  });
  return cachedClient;
}

export function guessContentTypeFromStorageKey(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  const m: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.m4s': 'video/iso.segment',
    '.ts': 'video/mp2t',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  if (ext === '.mp4' && storageKey.includes('/hls/')) return 'video/mp4';
  return m[ext] ?? 'application/octet-stream';
}

export async function sendS3Object(
  reply: FastifyReply,
  req: FastifyRequest,
  storageKey: string,
): Promise<void> {
  const client = getMediaCdnS3Client();
  const bucket = mediaCdnConfig.s3Bucket;
  if (!client || !bucket) {
    return reply.code(503).send({ error: 's3_not_configured' });
  }
  const rangeHeader =
    typeof req.headers.range === 'string' ? req.headers.range : undefined;
  const obj = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Range: rangeHeader,
    }),
  );
  const body = obj.Body;
  if (!body || typeof body !== 'object' || !('pipe' in body)) {
    return reply.code(404).send();
  }
  const size = typeof obj.ContentLength === 'number' ? obj.ContentLength : 0;
  const contentRange =
    typeof obj.ContentRange === 'string' ? obj.ContentRange : undefined;
  const code = rangeHeader && contentRange ? 206 : 200;
  const replyChain = reply.code(code).header('Accept-Ranges', 'bytes');
  if (contentRange) replyChain.header('Content-Range', contentRange);
  if (size > 0) replyChain.header('Content-Length', String(size));
  return replyChain
    .type(guessContentTypeFromStorageKey(storageKey))
    .send(body as Readable);
}
