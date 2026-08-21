import { describe, expect, it } from 'vitest';
import {
  applyPaperSmartEmDashToMarkdown,
  applyPaperSmartTypographyToMarkdown,
  findPaperEmDashStyleRanges,
  findPaperSmartQuoteStyleRanges,
  nextTypedDoubleQuote,
  nextTypedSingleQuote,
  PAPER_APOS_OR_CLOSE_SINGLE,
  PAPER_CLOSE_DOUBLE_QUOTE,
  PAPER_EM_DASH,
  PAPER_OPEN_DOUBLE_QUOTE,
  PAPER_OPEN_SINGLE_QUOTE,
} from '@/features/paper/editor/paperSmartTypography';

describe('applyPaperSmartEmDashToMarkdown', () => {
  it('replaces double hyphens with an em dash in prose', () => {
    expect(applyPaperSmartEmDashToMarkdown('Hello -- world')).toBe(
      `Hello ${PAPER_EM_DASH} world`,
    );
  });

  it('leaves horizontal rules and longer hyphen runs alone', () => {
    expect(applyPaperSmartEmDashToMarkdown('---\n\nBody')).toBe('---\n\nBody');
    expect(applyPaperSmartEmDashToMarkdown('four----dashes')).toBe(
      'four----dashes',
    );
  });

  it('skips fenced and inline code', () => {
    expect(applyPaperSmartEmDashToMarkdown('`code -- here` and -- prose')).toBe(
      `\`code -- here\` and ${PAPER_EM_DASH} prose`,
    );
    expect(applyPaperSmartEmDashToMarkdown('```\n-- stay\n```\n\n-- go')).toBe(
      `\`\`\`\n-- stay\n\`\`\`\n\n${PAPER_EM_DASH} go`,
    );
  });
});

describe('applyPaperSmartTypographyToMarkdown', () => {
  it('curlies straight double quotes in prose', () => {
    expect(applyPaperSmartTypographyToMarkdown('He said "hello" to me.')).toBe(
      `He said ${PAPER_OPEN_DOUBLE_QUOTE}hello${PAPER_CLOSE_DOUBLE_QUOTE} to me.`,
    );
  });

  it('curlies apostrophes inside words', () => {
    expect(applyPaperSmartTypographyToMarkdown("It's fine.")).toBe(
      `It${PAPER_APOS_OR_CLOSE_SINGLE}s fine.`,
    );
  });

  it('skips quotes inside inline code', () => {
    expect(applyPaperSmartTypographyToMarkdown('Run `echo "hi"` now')).toBe(
      'Run `echo "hi"` now',
    );
  });

  it('applies em dashes and quotes together', () => {
    expect(
      applyPaperSmartTypographyToMarkdown('She said "wait -- really?"'),
    ).toBe(
      `She said ${PAPER_OPEN_DOUBLE_QUOTE}wait ${PAPER_EM_DASH} really?${PAPER_CLOSE_DOUBLE_QUOTE}`,
    );
  });
});

describe('findPaperEmDashStyleRanges', () => {
  it('finds em dash candidates outside code spans', () => {
    const segs = findPaperEmDashStyleRanges('Say -- hi and `code -- no`');
    expect(segs).toEqual([{ start: 4, end: 6, class: 'paper-md-em-dash' }]);
  });
});

describe('findPaperSmartQuoteStyleRanges', () => {
  it('marks straight quotes outside code spans', () => {
    const segs = findPaperSmartQuoteStyleRanges('Say "hi" and `code "no"`');
    expect(segs).toEqual([
      { start: 4, end: 5, class: 'paper-md-curly-dquote-open' },
      { start: 7, end: 8, class: 'paper-md-curly-dquote-close' },
    ]);
  });
});

describe('nextTypedDoubleQuote', () => {
  it('alternates opening and closing quotes while typing', () => {
    expect(nextTypedDoubleQuote('')).toBe(PAPER_OPEN_DOUBLE_QUOTE);
    expect(nextTypedDoubleQuote('He said ')).toBe(PAPER_OPEN_DOUBLE_QUOTE);
    expect(nextTypedDoubleQuote(`He said ${PAPER_OPEN_DOUBLE_QUOTE}hi`)).toBe(
      PAPER_CLOSE_DOUBLE_QUOTE,
    );
  });
});

describe('nextTypedSingleQuote', () => {
  it('uses an apostrophe inside words', () => {
    expect(nextTypedSingleQuote('don')).toBe(PAPER_APOS_OR_CLOSE_SINGLE);
  });

  it('alternates single quotes around words', () => {
    expect(nextTypedSingleQuote('')).toBe(PAPER_OPEN_SINGLE_QUOTE);
    expect(nextTypedSingleQuote(`${PAPER_OPEN_SINGLE_QUOTE}90s`)).toBe(
      PAPER_APOS_OR_CLOSE_SINGLE,
    );
  });
});
