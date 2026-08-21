/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/features/chat/markdown/useMarkdown';
import { renderLegalMarkdown } from '@/features/settings/renderLegalMarkdown';

describe('messageBodyMarkdown ordered lists', () => {
  it('preserves explicit start numbers from GFM ordered-list markers', () => {
    const out = parseMessageContent('5. First item\n6. Second item');
    expect(out).toMatch(/<ol[^>]*\bstart="5"/);
    expect(out).toContain('First item');
    expect(out).toContain('Second item');
  });

  it('preserves start on raw HTML ordered lists', () => {
    const out = parseMessageContent(
      '<ol start="12"><li>Twelfth</li><li>Thirteenth</li></ol>',
    );
    expect(out).toMatch(/<ol[^>]*\bstart="12"/);
    expect(out).toContain('Twelfth');
    expect(out).toContain('Thirteenth');
  });

  it('omits start when the list begins at 1', () => {
    const out = parseMessageContent('1. One\n2. Two');
    expect(out).toMatch(/<ol(?![^>]*\bstart=)/);
    expect(out).toContain('One');
    expect(out).toContain('Two');
  });
});

describe('renderLegalMarkdown ordered lists', () => {
  it('preserves explicit start numbers after sanitization', () => {
    const out = renderLegalMarkdown('3. Third\n4. Fourth');
    expect(out).toMatch(/<ol[^>]*\bstart="3"/);
    expect(out).toContain('Third');
    expect(out).toContain('Fourth');
  });
});
