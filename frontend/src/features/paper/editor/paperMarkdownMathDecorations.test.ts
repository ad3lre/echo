import { describe, expect, it } from 'vitest';
import { extractMarkdownMathRegions } from '@/composables/markdownMathRegions';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';

function segmentOverlapsMath(
  start: number,
  end: number,
  mathRegions: readonly { start: number; end: number }[],
): boolean {
  return mathRegions.some((r) => start < r.end && r.start < end);
}

describe('paperMarkdownMathDecorations math overlap guards', () => {
  it('skips markdown styling inside inline math delimiters', () => {
    const text = 'See $x_i^2$ here';
    const mathRegions = extractMarkdownMathRegions(text).regions;
    expect(mathRegions).toHaveLength(1);

    const mdSegs = findComposerMarkdownStyleRanges(text, []);
    const insideMath = mdSegs.filter((seg) =>
      segmentOverlapsMath(seg.start, seg.end, mathRegions),
    );
    expect(insideMath).toHaveLength(0);
  });
});
