import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { resolveLocalUploadFilePath } from './localUploadDisk';
import type { EchoUploadContentTypeSanitizeResult } from './echoUploadContentTypePolicy';

export function applyEchoUploadServeSecurityHeaders(
  reply: FastifyReply,
  serve: EchoUploadContentTypeSanitizeResult,
): FastifyReply {
  reply.header('X-Content-Type-Options', 'nosniff');
  if (serve.coerced || serve.contentType === 'application/octet-stream') {
    reply.header('Content-Disposition', 'attachment');
  }
  return reply;
}

export function guessEchoUploadContentTypeFromKey(storageKey: string): string {
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
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  if (ext === '.mp4' && storageKey.includes('/hls/')) return 'video/mp4';
  return m[ext] ?? 'application/octet-stream';
}

type ParsedRange = { start: number; end: number };

function parseRangeHeader(
  raw: string | undefined,
  size: number,
): ParsedRange | null | 'unsatisfiable' {
  if (!raw || !raw.startsWith('bytes=')) return null;
  const spec = raw.slice('bytes='.length).trim();
  const [startStr, endStr] = spec.split('-');
  if (startStr === undefined) return null;
  if (startStr === '' && endStr) {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0) return 'unsatisfiable';
  const end = endStr && endStr.length > 0 ? parseInt(endStr, 10) : size - 1;
  if (!Number.isFinite(end) || end < start || start >= size)
    return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

export async function sendLocalEchoUploadFile(
  reply: FastifyReply,
  req: FastifyRequest,
  absPath: string,
  contentType: string,
  serveMeta?: EchoUploadContentTypeSanitizeResult,
): Promise<void> {
  if (serveMeta) applyEchoUploadServeSecurityHeaders(reply, serveMeta);
  const st = await stat(absPath);
  const size = st.size;
  const range = parseRangeHeader(
    typeof req.headers.range === 'string' ? req.headers.range : undefined,
    size,
  );
  if (range === 'unsatisfiable') {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  }
  if (range) {
    const len = range.end - range.start + 1;
    return reply
      .code(206)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', String(len))
      .type(contentType)
      .send(createReadStream(absPath, { start: range.start, end: range.end }));
  }
  return reply
    .header('Accept-Ranges', 'bytes')
    .header('Content-Length', String(size))
    .type(contentType)
    .send(createReadStream(absPath));
}

export async function sendS3EchoUploadObject(
  reply: FastifyReply,
  req: FastifyRequest,
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  totalSize?: number,
  serveMeta?: EchoUploadContentTypeSanitizeResult,
): Promise<void> {
  if (serveMeta) applyEchoUploadServeSecurityHeaders(reply, serveMeta);
  const rangeHeader =
    typeof req.headers.range === 'string' ? req.headers.range : undefined;
  const obj = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: rangeHeader,
    }),
  );
  const body = obj.Body;
  if (!body || typeof body !== 'object' || !('pipe' in body)) {
    return reply.code(404).send();
  }
  const size =
    typeof obj.ContentLength === 'number'
      ? obj.ContentLength
      : (totalSize ?? 0);
  const contentRange =
    typeof obj.ContentRange === 'string' ? obj.ContentRange : undefined;
  const code = rangeHeader && contentRange ? 206 : 200;
  const replyChain = reply.code(code).header('Accept-Ranges', 'bytes');
  if (contentRange) {
    replyChain.header('Content-Range', contentRange);
  }
  if (size > 0) replyChain.header('Content-Length', String(size));
  return replyChain.type(contentType).send(body as Readable);
}

export async function statLocalEchoUploadFileSize(
  absPath: string,
): Promise<number> {
  const st = await stat(absPath);
  return st.size;
}
