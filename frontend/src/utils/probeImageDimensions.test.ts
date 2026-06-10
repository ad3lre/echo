import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedImageDimensions,
  probeImageDimensionsFromUrl,
  rememberImageDimensions,
} from './probeImageDimensions';

describe('probeImageDimensions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches remembered dimensions', () => {
    rememberImageDimensions('https://example.com/a.png', {
      width: 640,
      height: 480,
    });
    expect(getCachedImageDimensions('https://example.com/a.png')).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('probes natural image dimensions from URL', async () => {
    class FakeImage {
      naturalWidth = 800;
      naturalHeight = 600;
      crossOrigin = '';
      referrerPolicy = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        void value;
        this.onload?.();
      }
    }

    vi.stubGlobal('Image', FakeImage);

    const dims = await probeImageDimensionsFromUrl(
      'https://example.com/photo.jpg',
    );
    expect(dims).toEqual({ width: 800, height: 600 });
    expect(getCachedImageDimensions('https://example.com/photo.jpg')).toEqual({
      width: 800,
      height: 600,
    });
  });
});
