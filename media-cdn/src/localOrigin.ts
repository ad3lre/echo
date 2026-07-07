import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { normalizeEchoUploadStorageKeyPath } from '../../shared/echoUploadStorageKey';
import { mediaCdnConfig } from './config';
import { guessContentTypeFromStorageKey } from './s3Origin';

type ParsedRange = { start: number; end: number };

function assertUnderRoot(abs: string, root: string): boolean {
  const normRoot = path.normalize(root + path.sep);
  const normAbs = path.normalize(abs);
  return normAbs.startsWith(normRoot);
}

export function resolveLocalUploadFilePath(storageKey: string): string | null {
  const root = mediaCdnConfig.localUploadDir;
  if (!root) return null;
  const safeKey = normalizeEchoUploadStorageKeyPath(storageKey);
  if (!safeKey) return null;
  const abs = path.join(root, safeKey);
  if (!assertUnderRoot(abs, root)) return null;
  return abs;
}

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

export async function sendLocalObject(
  reply: FastifyReply,
  req: FastifyRequest,
  storageKey: string,
): Promise<void> {
  const absPath = resolveLocalUploadFilePath(storageKey);
  if (!absPath) {
    return reply.code(503).send({ error: 'local_uploads_not_configured' });
  }
  let st;
  try {
    st = await stat(absPath);
  } catch {
    return reply.code(404).send();
  }
  const size = st.size;
  const contentType = guessContentTypeFromStorageKey(storageKey);
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
