import { describe, expect, it } from 'vitest';
import { markdownMentionPassTestOnly } from './useMarkdown';

describe('markdown mention shield (post-marked pipeline)', () => {
  it('shields channel spans when data-* attributes precede class (no fragile class= prefix regex)', () => {
    const raw =
      '<p><span data-channel-id="c1" class="mention mention--channel" data-mention-channel>#general</span></p>';
    const { html, slots } =
      markdownMentionPassTestOnly.shieldMentionSpansForMarkdownPass(raw);
    expect(slots).toHaveLength(1);
    expect(html).toContain('__MNSPAN_0__');
    expect(html).not.toContain('#general');
  });

  it('collapses nested channel mention spans', () => {
    const nested =
      '<span class="mention mention--channel"><span class="mention mention--channel">#rules</span></span>';
    const out =
      markdownMentionPassTestOnly.collapseNestedChannelMentionSpans(nested);
    expect(out).toBe('<span class="mention mention--channel">#rules</span>');
  });
});
