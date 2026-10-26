import { afterEach, expect, test } from 'bun:test';
import { assertHlsVideoDimensions, hlsMaxPixels } from '../../hls/processor';

const ORIGINAL = process.env.ECHO_VIDEO_HLS_MAX_PIXELS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ECHO_VIDEO_HLS_MAX_PIXELS;
  else process.env.ECHO_VIDEO_HLS_MAX_PIXELS = ORIGINAL;
});

test('accepts 1080p and 4K by default', () => {
  delete process.env.ECHO_VIDEO_HLS_MAX_PIXELS;
  expect(hlsMaxPixels()).toBe(3840 * 2160);
  expect(() => assertHlsVideoDimensions(1920, 1080)).not.toThrow();
  expect(() => assertHlsVideoDimensions(3840, 2160)).not.toThrow();
});

test('rejects dimensions above 8192 on either axis', () => {
  expect(() => assertHlsVideoDimensions(8193, 16, Infinity)).toThrow(
    /dimensions/,
  );
  expect(() => assertHlsVideoDimensions(16, 9000, Infinity)).toThrow(
    /dimensions/,
  );
});

test('rejects pixel counts above the cap (8K)', () => {
  expect(() => assertHlsVideoDimensions(7680, 4320)).toThrow(/pixel/);
});

test('ECHO_VIDEO_HLS_MAX_PIXELS overrides the default; invalid falls back', () => {
  process.env.ECHO_VIDEO_HLS_MAX_PIXELS = String(1280 * 720);
  expect(() => assertHlsVideoDimensions(1920, 1080)).toThrow(/pixel/);
  process.env.ECHO_VIDEO_HLS_MAX_PIXELS = 'nope';
  expect(hlsMaxPixels()).toBe(3840 * 2160);
});
