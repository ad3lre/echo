import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import type { Readable } from 'stream';
import { normalizeEchoUploadStorageKeyPath } from '../../../../../contracts/echoUploadStorageKey';
import { config } from '../../config';

/** Public URL path prefix (same origin as the SPA; Vite proxies `/api` to Echo). */
export const ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX = '/api/v1/echo/uploads/files/';

export function getLocalUploadPublicPathPrefix(): string {
  return ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX;
}

function assertUnderRoot(abs: string, root: string): boolean {
  const normRoot = path.normalize(root + path.sep);
  const normAbs = path.normalize(abs);
  return normAbs.startsWith(normRoot);
}

export async function writeLocalEchoUploadFile(
  storageKey: string,
  buf: Buffer,
): Promise<void> {
  const root = config.echoLocalUploadDir;
  if (!root) throw new Error('Local uploads are not enabled');
  const safeKey = normalizeEchoUploadStorageKeyPath(storageKey);
  if (!safeKey) throw new Error('Invalid storage key');
  const abs = path.join(root, safeKey);
  if (!assertUnderRoot(abs, root)) throw new Error('Invalid storage key');
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
}

/**
 * Stream upload body to disk (bounded). Enforces exact byte count match to `expectedBytes`.
 * Never buffers the full file in memory.
 */
export async function writeLocalEchoUploadFileStream(
  storageKey: string,
  body: Readable,
  expectedBytes: number,
  maxBytes: number,
): Promise<void> {
  if (
    typeof expectedBytes !== 'number' ||
    !Number.isFinite(expectedBytes) ||
    !Number.isInteger(expectedBytes) ||
    expectedBytes < 1
  ) {
    throw new Error('Invalid content length');
  }
  if (expectedBytes > maxBytes) {
    throw new Error('Declared content length exceeds upload limit');
  }
  const root = config.echoLocalUploadDir;
  if (!root) throw new Error('Local uploads are not enabled');
  const safeKey = normalizeEchoUploadStorageKeyPath(storageKey);
  if (!safeKey) throw new Error('Invalid storage key');
  const abs = path.join(root, safeKey);
  if (!assertUnderRoot(abs, root)) throw new Error('Invalid storage key');
  await fs.mkdir(path.dirname(abs), { recursive: true });

  let received = 0;
  const cap = expectedBytes;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > cap) {
        cb(new Error('Upload body exceeds declared content length'));
        return;
      }
      cb(null, chunk);
    },
  });

  const ws = createWriteStream(abs, { flags: 'wx' });
  try {
    await pipeline(body, meter, ws);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw new Error('Upload destination already exists');
    }
    await fs.unlink(abs).catch(() => {});
    throw e;
  }
  if (received !== expectedBytes) {
    await fs.unlink(abs).catch(() => {});
    throw new Error('Body size does not match declared content length');
  }
}

export function resolveLocalUploadFilePath(key: string): string | null {
  const root = config.echoLocalUploadDir;
  if (!root) return null;
  const safeKey = normalizeEchoUploadStorageKeyPath(key);
  if (!safeKey) return null;
  const abs = path.join(root, safeKey);
  if (!assertUnderRoot(abs, root)) return null;
  return abs;
}
