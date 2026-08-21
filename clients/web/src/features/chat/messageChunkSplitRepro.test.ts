import { describe, expect, it } from 'vitest';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';
import { preparePlainTextChunks } from '@shared/messageChunkLimits';

const body = `## 9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly harms the community even if it is not explicitly listed here.

## 10. Staff Decisions

Staff are expected to be fair and consistent`;

describe('message chunk split styling repro', () => {
  it('split mid-word: chunk2 ms line should not get heading decoration', () => {
    const idx = body.indexOf('harms');
    const splitAt = idx + 3;
    const c2 = body.slice(splitAt);
    const segs = findComposerMarkdownStyleRanges(c2, []);
    const msIdx = c2.indexOf('ms the community');
    const headingOnMs = segs.some(
      (s) =>
        s.class.includes('composer-md-h') &&
        s.start <= msIdx &&
        s.end > msIdx + 2,
    );
    expect(headingOnMs).toBe(false);
  });

  it('preparePlainTextChunks should not start chunks mid-word when avoidable', () => {
    const long = body.repeat(20);
    const plan = preparePlainTextChunks(long, 2000);
    expect(plan).not.toBeNull();
    for (let i = 1; i < plan!.chunks.length; i++) {
      const prev = plan!.chunks[i - 1]!;
      const cur = plan!.chunks[i]!;
      const prevLast = prev.slice(-1);
      const curFirst = cur.slice(0, 1);
      const midWord = /[^\s\n]/.test(prevLast) && /[^\s\n]/.test(curFirst);
      expect(midWord).toBe(false);
    }
  });
});
