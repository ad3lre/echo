// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  dataUrlToImageFile,
  extractImageSrcFromClipboardHtml,
  extractPaperClipboardImage,
} from '@/features/paper/composables/extractPaperClipboardImage';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('extractImageSrcFromClipboardHtml', () => {
  it('reads src from img tag', () => {
    const src = extractImageSrcFromClipboardHtml(
      '<meta charset="utf-8"><img src="https://cdn.example/x.png">',
    );
    expect(src).toBe('https://cdn.example/x.png');
  });

  it('returns null when no image', () => {
    expect(extractImageSrcFromClipboardHtml('<p>hello</p>')).toBeNull();
  });
});

describe('dataUrlToImageFile', () => {
  it('decodes raster data URLs', () => {
    const file = dataUrlToImageFile(TINY_PNG);
    expect(file?.type).toBe('image/png');
    expect(file?.name).toMatch(/pasted-image\.png$/);
    expect(file?.size).toBeGreaterThan(0);
  });

  it('rejects non-image data URLs', () => {
    expect(dataUrlToImageFile('data:text/plain;base64,aGVsbG8=')).toBeNull();
  });
});

describe('extractPaperClipboardImage', () => {
  it('prefers clipboard file items', () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', {
      type: 'image/png',
    });
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => png,
          },
        ],
        files: [png],
        getData: () => '',
      },
    } as unknown as ClipboardEvent;

    const payload = extractPaperClipboardImage(event);
    expect(payload).toEqual({ kind: 'file', file: expect.any(File) });
  });

  it('falls back to HTML img src data URLs', () => {
    const event = {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) =>
          type === 'text/html' ? `<img src="${TINY_PNG}">` : '',
      },
    } as unknown as ClipboardEvent;

    expect(extractPaperClipboardImage(event)).toEqual({
      kind: 'dataUrl',
      dataUrl: TINY_PNG,
    });
  });

  it('falls back to trusted http img src', () => {
    const event = {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) =>
          type === 'text/html'
            ? '<img src="https://cdn.example/photo.jpg">'
            : '',
      },
    } as unknown as ClipboardEvent;

    expect(extractPaperClipboardImage(event)).toEqual({
      kind: 'url',
      url: 'https://cdn.example/photo.jpg',
    });
  });
});
