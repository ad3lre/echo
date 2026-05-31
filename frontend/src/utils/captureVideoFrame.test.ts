// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeVideoBlobUrl } from './captureVideoFrame';

describe('probeVideoBlobUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when video metadata fails to load', async () => {
    const blobUrl = 'blob:broken-video';
    vi.spyOn(HTMLVideoElement.prototype, 'addEventListener').mockImplementation(
      function (this: HTMLVideoElement, type, listener) {
        if (type === 'error') {
          queueMicrotask(() => {
            (listener as EventListener).call(this, new Event('error'));
          });
        }
      },
    );

    const result = await probeVideoBlobUrl(blobUrl, 1);
    expect(result).toBeNull();
  });

  it('captures dimensions and a data-url frame when metadata and seek succeed', async () => {
    const blobUrl = 'blob:ok-video';
    const videoProto = HTMLVideoElement.prototype;

    vi.spyOn(videoProto, 'addEventListener').mockImplementation(function (
      this: HTMLVideoElement,
      type,
      listener,
    ) {
      if (type === 'loadedmetadata') {
        Object.defineProperty(this, 'videoWidth', {
          configurable: true,
          value: 640,
        });
        Object.defineProperty(this, 'videoHeight', {
          configurable: true,
          value: 360,
        });
        Object.defineProperty(this, 'duration', {
          configurable: true,
          value: 10,
        });
        queueMicrotask(() => {
          (listener as EventListener).call(this, new Event('loadedmetadata'));
        });
      }
      if (type === 'seeked') {
        queueMicrotask(() => {
          (listener as EventListener).call(this, new Event('seeked'));
        });
      }
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,frame',
    );

    const result = await probeVideoBlobUrl(blobUrl, 1);
    expect(result).toEqual({
      width: 640,
      height: 360,
      aspectRatio: '640 / 360',
      frameUrl: 'data:image/jpeg;base64,frame',
    });
  });
});
