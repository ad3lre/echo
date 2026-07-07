import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareRasterForEchoStorage } from '../services/rasterImageTranscode';

async function loadFixture(name: string): Promise<Buffer> {
  return readFile(
    path.join(__dirname, '..', '..', '..', 'scripts', 'fixtures', name),
  );
}

async function testPngTranscodesToWebp() {
  let buf: Buffer;
  try {
    buf = await loadFixture('1x1-red.png');
  } catch {
    // Minimal PNG if fixture missing
    buf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
  }
  const out = await prepareRasterForEchoStorage(buf, 'image/png');
  assert.equal(out.contentType, 'image/webp');
  assert.equal(out.ext, '.webp');
  assert.equal(out.transcoded, true);
  assert.ok(out.buf.length > 0);
}

async function testGifPassthrough() {
  const buf = Buffer.from('GIF89a', 'ascii');
  const out = await prepareRasterForEchoStorage(buf, 'image/gif');
  assert.equal(out.contentType, 'image/gif');
  assert.equal(out.transcoded, false);
}

async function main() {
  await testPngTranscodesToWebp();
  await testGifPassthrough();
  console.log('rasterImageTranscode.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
