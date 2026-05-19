import { describe, expect, it } from 'vitest';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';

describe('findComposerMarkdownStyleRanges', () => {
  it('styles **bold** delimiters and inner span', () => {
    const segs = findComposerMarkdownStyleRanges('a **bold** b', []);
    const classes = segs.map((s) => ({ ...s, len: s.end - s.start }));
    expect(
      classes.some((c) => c.class === 'composer-md-bold' && c.len === 4),
    ).toBe(true);
    expect(
      classes.filter((c) => c.class === 'composer-md-delim').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('skips ranges overlapping mentions', () => {
    const segs = findComposerMarkdownStyleRanges('**x** @u **y**', [
      { start: 6, end: 9 },
    ]);
    expect(
      segs.some(
        (s) => s.class === 'composer-md-bold' && s.start >= 6 && s.end <= 9,
      ),
    ).toBe(false);
  });

  it('styles `code`', () => {
    const segs = findComposerMarkdownStyleRanges('`hi`', []);
    expect(segs.some((s) => s.class === 'composer-md-code')).toBe(true);
  });

  it('styles ATX headings', () => {
    const segs = findComposerMarkdownStyleRanges('## Title', []);
    expect(
      segs.some((s) => s.class === 'composer-md-h2' && s.end - s.start === 5),
    ).toBe(true);
  });

  it('styles ==highlight==', () => {
    const segs = findComposerMarkdownStyleRanges('a ==x== b', []);
    expect(segs.some((s) => s.class === 'composer-md-highlight')).toBe(true);
  });

  it('styles __underscore bold__', () => {
    const segs = findComposerMarkdownStyleRanges('__z__', []);
    expect(
      segs.some((s) => s.class === 'composer-md-bold' && s.end - s.start === 1),
    ).toBe(true);
  });

  it('styles fenced code block', () => {
    const segs = findComposerMarkdownStyleRanges('```\na\n```', []);
    expect(segs.some((s) => s.class === 'composer-md-code-block')).toBe(true);
  });

  it('allows inline bold inside list item body', () => {
    const segs = findComposerMarkdownStyleRanges('- **x**', []);
    expect(segs.some((s) => s.class === 'composer-md-bold')).toBe(true);
  });
});
