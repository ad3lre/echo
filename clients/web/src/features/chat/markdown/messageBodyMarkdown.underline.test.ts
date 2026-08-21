/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/features/chat/markdown/useMarkdown';

describe('parseMessageContent Discord underline', () => {
  it('renders __text__ as underline, not bold', () => {
    const out = parseMessageContent('__underlined__');
    expect(out).toContain('<u>underlined</u>');
    expect(out).not.toMatch(/<strong>underlined<\/strong>/);
  });

  it('keeps **text** as bold alongside underline', () => {
    const out = parseMessageContent('**bold** and __under__');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<u>under</u>');
  });

  it('supports nested __**bold underline**__', () => {
    const out = parseMessageContent('__**both**__');
    expect(out).toContain('<u><strong>both</strong></u>');
  });

  it('does not underline inside inline code', () => {
    const out = parseMessageContent('`__literal__`');
    expect(out).toContain('__literal__');
    expect(out).not.toContain('<u>literal</u>');
  });
});
