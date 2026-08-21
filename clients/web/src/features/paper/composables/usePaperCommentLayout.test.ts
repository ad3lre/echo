import { describe, expect, it } from 'vitest';
import { stackCommentTops } from '@/features/paper/composables/usePaperCommentLayout';

describe('stackCommentTops', () => {
  it('offsets overlapping comment tops', () => {
    const tops = stackCommentTops(
      [
        { id: 'a', top: 100 },
        { id: 'b', top: 105 },
        { id: 'c', top: 300 },
      ],
      100,
      8,
    );
    expect(tops.get('a')).toBe(100);
    expect(tops.get('b')).toBe(208);
    expect(tops.get('c')).toBe(316);
  });
});
