import assert from 'node:assert/strict';
import { probeImageDimensionsFromBuffer } from '../services/probeImageDimensionsFromBuffer';

function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gifBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0);
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

assert.deepEqual(probeImageDimensionsFromBuffer(pngBuffer(1920, 1080)), {
  width: 1920,
  height: 1080,
});

assert.deepEqual(probeImageDimensionsFromBuffer(gifBuffer(320, 240)), {
  width: 320,
  height: 240,
});

assert.equal(probeImageDimensionsFromBuffer(Buffer.from('not-an-image')), null);

console.log('probeImageDimensionsFromBuffer.test.ts: ok');
