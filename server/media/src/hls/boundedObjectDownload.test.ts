import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import {
  assertHlsSourceSize,
  writeBoundedObjectToFile,
} from './boundedObjectDownload';

test('rejects oversized metadata and bounds the actual download', async () => {
  assert.throws(() => assertHlsSourceSize(11, 10));
  const dir = await mkdtemp(path.join(os.tmpdir(), 'echo-hls-limit-'));
  const file = path.join(dir, 'source');
  try {
    await writeBoundedObjectToFile(
      Readable.from([Buffer.alloc(5), Buffer.alloc(5)]),
      file,
      10,
    );
    assert.equal((await readFile(file)).length, 10);
    await assert.rejects(
      writeBoundedObjectToFile(
        Readable.from([Buffer.alloc(5), Buffer.alloc(6)]),
        file,
        10,
      ),
      /max input bytes/,
    );
    await assert.rejects(
      access(file),
      'partial file must be removed after a failed transfer',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
