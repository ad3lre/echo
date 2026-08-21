import { describe, expect, it } from 'vitest';
import { extractPaperDocumentColors } from '@/features/paper/editor/extractPaperDocumentColors';

describe('extractPaperDocumentColors', () => {
  it('collects page attrs and mark colors in document order', () => {
    const doc = {
      attrs: {
        paperPageColorLight: '#faf7f2',
        paperPageColorDark: '#16161c',
      },
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [
                { type: 'textStyle', attrs: { color: '#2563eb' } },
                { type: 'highlight', attrs: { color: '#fef08a' } },
              ],
            },
            {
              type: 'text',
              text: ' world',
              marks: [{ type: 'textStyle', attrs: { color: '#2563eb' } }],
            },
          ],
        },
      ],
    };

    expect(extractPaperDocumentColors(doc)).toEqual({
      text: [{ label: '#2563eb', value: '#2563eb' }],
      highlight: [{ label: '#fef08a', value: '#fef08a' }],
      object: [],
      page: [
        { label: '#faf7f2', value: '#faf7f2' },
        { label: '#16161c', value: '#16161c' },
      ],
    });
  });

  it('collects object fill colors from paperShape nodes', () => {
    const doc = {
      content: [
        {
          type: 'paperShape',
          attrs: {
            shape: 'circle',
            fill: '#22c55e',
            width: '80px',
            height: '80px',
          },
        },
      ],
    };
    expect(extractPaperDocumentColors(doc).object).toEqual([
      { label: '#22c55e', value: '#22c55e' },
    ]);
  });

  it('returns empty buckets for null doc', () => {
    expect(extractPaperDocumentColors(null)).toEqual({
      text: [],
      highlight: [],
      object: [],
      page: [],
    });
  });
});
