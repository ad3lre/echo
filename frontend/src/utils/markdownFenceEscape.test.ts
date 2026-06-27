import { describe, expect, it } from 'vitest';
import {
  isEscapedMarkdownFenceOpenerLine,
  stripEscapedMarkdownFenceMarkers,
} from '@/utils/markdownFenceEscape';

describe('markdownFenceEscape', () => {
  it('detects !-prefixed fence openers', () => {
    expect(isEscapedMarkdownFenceOpenerLine('!```')).toBe(true);
    expect(isEscapedMarkdownFenceOpenerLine('!```js')).toBe(true);
    expect(isEscapedMarkdownFenceOpenerLine('!~~~')).toBe(true);
    expect(isEscapedMarkdownFenceOpenerLine('```')).toBe(false);
    expect(isEscapedMarkdownFenceOpenerLine('!``')).toBe(false);
  });

  it('strips opener and closer while keeping inner markdown', () => {
    const raw = '!```\n## Title\n**bold**\n```';
    expect(stripEscapedMarkdownFenceMarkers(raw)).toBe('## Title\n**bold**');
  });

  it('leaves content after unclosed escaped opener', () => {
    const raw = '!```\nline one\nline two';
    expect(stripEscapedMarkdownFenceMarkers(raw)).toBe('line one\nline two');
  });

  it('does not strip normal fenced blocks', () => {
    const raw = '```\ncode\n```';
    expect(stripEscapedMarkdownFenceMarkers(raw)).toBe(raw);
  });
});
