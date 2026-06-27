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

  it('styles __underscore underline__', () => {
    const segs = findComposerMarkdownStyleRanges('__z__', []);
    expect(
      segs.some(
        (s) => s.class === 'composer-md-underline' && s.end - s.start === 1,
      ),
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

  it('prepended char before fence does not hang (regression)', () => {
    const segs = findComposerMarkdownStyleRanges('!```\n**a** `b` *c*', []);
    expect(segs.some((s) => s.class === 'composer-md-code-block')).toBe(false);
  });

  it('styles markdown inside !-escaped fence region', () => {
    const segs = findComposerMarkdownStyleRanges(
      '!```\n## Title\n**bold**\n```',
      [],
    );
    expect(segs.some((s) => s.class === 'composer-md-code-block')).toBe(false);
    expect(segs.some((s) => s.class === 'composer-md-h2')).toBe(true);
    expect(segs.some((s) => s.class === 'composer-md-bold')).toBe(true);
  });

  it('does not style a wrapped continuation line as heading after mid-word break', () => {
    const text = `## 9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

## 10. Staff Decisions`;
    const segs = findComposerMarkdownStyleRanges(text, []);
    const msIdx = text.indexOf('ms the community');
    const headingOnMs = segs.some(
      (s) =>
        s.class.includes('composer-md-h') &&
        s.start <= msIdx &&
        s.end > msIdx + 1,
    );
    expect(headingOnMs).toBe(false);
  });

  it('does not treat numbered section body continuation as a new list heading', () => {
    const text = `9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

10. Staff Decisions`;
    const segs = findComposerMarkdownStyleRanges(text, []);
    const msIdx = text.indexOf('ms the community');
    const styledOnMs = segs.some((s) => s.start <= msIdx && s.end > msIdx + 1);
    expect(styledOnMs).toBe(false);
  });
});
