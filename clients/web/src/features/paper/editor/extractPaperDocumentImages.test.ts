// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractPaperDocumentImages } from '@/features/paper/editor/extractPaperDocumentImages';

describe('extractPaperDocumentImages', () => {
  it('collects unique image src values in order', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi' }],
        },
        {
          type: 'image',
          attrs: { src: 'https://a.example/1.png', paperBlockId: 'b1' },
        },
        {
          type: 'image',
          attrs: { src: 'https://a.example/1.png' },
        },
        {
          type: 'image',
          attrs: { src: 'https://b.example/2.jpg' },
        },
      ],
    };
    const images = extractPaperDocumentImages(doc);
    expect(images).toHaveLength(2);
    expect(images[0].src).toBe('https://a.example/1.png');
    expect(images[0].blockId).toBe('b1');
    expect(images[1].src).toBe('https://b.example/2.jpg');
  });

  it('returns empty for missing doc', () => {
    expect(extractPaperDocumentImages(null)).toEqual([]);
  });
});
