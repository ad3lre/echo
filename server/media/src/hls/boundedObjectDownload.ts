import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function assertHlsSourceSize(size: number, maxBytes: number): void {
  if (size < 1) throw new Error('Empty source file');
  if (!Number.isFinite(size) || size > maxBytes)
    throw new Error('Source exceeds max input bytes');
}

export async function writeBoundedObjectToFile(
  body: unknown,
  destPath: string,
  maxBytes: number,
): Promise<void> {
  if (!body || typeof body !== 'object' || !('pipe' in body))
    throw new Error('invalid object stream');
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      done(
        bytes > maxBytes ? new Error('Source exceeds max input bytes') : null,
        chunk,
      );
    },
  });
  try {
    await pipeline(
      body as NodeJS.ReadableStream,
      limiter,
      createWriteStream(destPath, { flags: 'w' }),
    );
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }
}
