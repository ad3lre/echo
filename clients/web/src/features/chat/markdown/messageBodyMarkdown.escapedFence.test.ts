/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/features/chat/markdown/useMarkdown';

describe('parseMessageContent escaped markdown fences', () => {
  it('renders headings and emphasis inside !-prefixed fence', () => {
    const out = parseMessageContent('!```\n## Title\n**bold**\n```');
    expect(out).toContain('<h2');
    expect(out).toContain('Title');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).not.toContain('<pre');
  });

  it('does not treat closing fence as a new code block', () => {
    const out = parseMessageContent('!```\nline\n```\n||spoiler||');
    expect(out).toContain('spoiler');
    expect(out).toContain('class="spoiler"');
  });
});
