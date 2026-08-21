import { describe, it, expect } from 'vitest';
import { parseGifOneLoopDurationMs } from './gifOneLoopDuration';

/** 1×1 transparent GIF (single frame), same payload as `safeImageUrl` fallback. */
const TINY_GIF_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const v = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) v[i] = binary.charCodeAt(i);
  return buf;
}

describe('parseGifOneLoopDurationMs', () => {
  it('returns null for non-GIF data', () => {
    expect(parseGifOneLoopDurationMs(new ArrayBuffer(0))).toBeNull();
    expect(
      parseGifOneLoopDurationMs(new Uint8Array([0, 1, 2, 3]).buffer),
    ).toBeNull();
  });

  it('returns a positive duration for a minimal GIF buffer', () => {
    const ms = parseGifOneLoopDurationMs(base64ToArrayBuffer(TINY_GIF_B64));
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(50);
  });
});
