// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';
import { parseMessageContent } from '@/features/chat/viewModel/messageBodyMarkdown';
import {
  preparePlainTextChunks,
  type PlainTextChunkPlan,
} from '@shared/messageChunkLimits';

function splitAt(body: string, maxChunk: number): PlainTextChunkPlan | null {
  return preparePlainTextChunks(body, maxChunk);
}

describe('message chunk split styling', () => {
  it('does not apply heading decoration to ms continuation after har split', () => {
    const pad = 'a'.repeat(1953);
    const suffix =
      'Staff may act against behavior that clearly harms the community even if it is not explicitly listed here.\n\n## 10. Staff Decisions';
    const body = pad + suffix;
    const splitIdx = body.indexOf('harms') + 3;
    const c2 = body.slice(splitIdx);
    expect(c2.startsWith('ms')).toBe(true);
    const msIdx = c2.indexOf('ms');
    const segs = findComposerMarkdownStyleRanges(c2, []);
    const headingOnMs = segs.some(
      (s) =>
        s.class.includes('composer-md-h') &&
        s.start <= msIdx &&
        s.end > msIdx + 1,
    );
    expect(headingOnMs).toBe(false);

    const html = parseMessageContent(c2);
    expect(html).toMatch(/<p>ms the community/i);
    expect(html).not.toMatch(/<h[1-6][^>]*>ms the community/i);
  });

  it('prefers newline and word boundaries over the max size guideline', () => {
    const body = `${'word '.repeat(450)}tail`;
    const plan = splitAt(body, 2000);
    expect(plan).not.toBeNull();
    for (let i = 1; i < plan!.chunks.length; i++) {
      const prev = plan!.chunks[i - 1]!;
      const cur = plan!.chunks[i]!;
      const prevLast = prev.slice(-1);
      const curFirst = cur.slice(0, 1);
      expect(/[^\s\n]/.test(prevLast) && /[^\s\n]/.test(curFirst)).toBe(false);
      expect(cur.length).toBeLessThanOrEqual(2000);
    }
    expect(plan!.chunks.every((c) => c.length > 0)).toBe(true);
    expect(plan!.chunks.join('')).toBe(
      body.slice(plan!.trimStart, plan!.trimEnd),
    );
  });
});
