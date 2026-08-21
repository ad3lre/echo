/** Canva-style smart typography for Paper markdown (e.g. `--` → em dash, `"` → curly quotes). */

export const PAPER_EM_DASH = '—';
export const PAPER_OPEN_DOUBLE_QUOTE = '\u201C';
export const PAPER_CLOSE_DOUBLE_QUOTE = '\u201D';
export const PAPER_OPEN_SINGLE_QUOTE = '\u2018';
export const PAPER_APOS_OR_CLOSE_SINGLE = '\u2019';

const STRAIGHT_DOUBLE = '"';
const STRAIGHT_SINGLE = "'";

/** Double hyphen not part of a longer hyphen run (e.g. `---` HR). */
export const PAPER_EM_DASH_SOURCE_RE = /(?<![-])--(?![-])/g;

const CODE_SPLIT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;

type Range = [number, number];

function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  let cur = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next[0] <= cur[1]) cur = [cur[0], Math.max(cur[1], next[1])];
    else {
      out.push(cur);
      cur = next;
    }
  }
  out.push(cur);
  return out;
}

function overlapsRange(
  s: number,
  e: number,
  ranges: readonly Range[],
): boolean {
  return ranges.some(([a, b]) => s < b && a < e);
}

/** GFM fenced code blocks — unclosed fence runs to EOF. */
function findFencedCodeBlockRanges(content: string): Range[] {
  const ranges: Range[] = [];
  let pos = 0;
  let blockStart = -1;
  let fenceChar: '`' | '~' = '`';
  let minCloseLen = 3;

  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(pos, lineEnd);

    if (blockStart < 0) {
      const open = line.match(/^ {0,3}(`{3,}|~{3,})(?:[ \t]+[^\n]*)?$/);
      if (open) {
        const fence = open[1]!;
        fenceChar = fence[0] === '`' ? '`' : '~';
        minCloseLen = fence.length;
        blockStart = pos;
      }
    } else {
      const ok =
        fenceChar === '`'
          ? new RegExp(`^ {0,3}\`{${minCloseLen},}\\s*$`).test(line)
          : new RegExp(`^ {0,3}~{${minCloseLen},}\\s*$`).test(line);
      if (ok) {
        const blockEnd = nl === -1 ? content.length : nl + 1;
        ranges.push([blockStart, blockEnd]);
        blockStart = -1;
      }
    }

    if (nl === -1) break;
    pos = nl + 1;
  }
  if (blockStart >= 0) ranges.push([blockStart, content.length]);
  return ranges;
}

function findInlineCodeRanges(content: string): Range[] {
  const ranges: Range[] = [];
  const re = /`([^`\n]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function protectedMarkdownRanges(content: string): Range[] {
  return mergeRanges([
    ...findFencedCodeBlockRanges(content),
    ...findInlineCodeRanges(content),
  ]);
}

export type PaperSmartTypographySeg = {
  start: number;
  end: number;
  class: string;
};

type QuoteDisplayClass =
  | 'paper-md-curly-dquote-open'
  | 'paper-md-curly-dquote-close'
  | 'paper-md-curly-squote-open'
  | 'paper-md-curly-squote-close'
  | 'paper-md-curly-apostrophe';

type PlannedQuote = {
  start: number;
  end: number;
  replacement: string;
  displayClass: QuoteDisplayClass;
};

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-zA-Z0-9]/.test(ch);
}

function syncDoubleQuoteState(ch: string, nextDoubleOpen: boolean): boolean {
  if (ch === STRAIGHT_DOUBLE || ch === PAPER_OPEN_DOUBLE_QUOTE) return false;
  if (ch === PAPER_CLOSE_DOUBLE_QUOTE) return true;
  return nextDoubleOpen;
}

function syncSingleQuoteState(
  ch: string,
  prev: string | undefined,
  next: string | undefined,
  nextSingleOpen: boolean,
): boolean {
  if (ch === STRAIGHT_SINGLE) {
    if (isWordChar(prev) && isWordChar(next)) return nextSingleOpen;
    return !nextSingleOpen;
  }
  if (ch === PAPER_OPEN_SINGLE_QUOTE) return false;
  if (ch === PAPER_APOS_OR_CLOSE_SINGLE) {
    if (isWordChar(prev) && isWordChar(next)) return nextSingleOpen;
    return true;
  }
  return nextSingleOpen;
}

/** Classify straight ASCII quotes for display / replacement. */
export function planStraightQuoteTransforms(text: string): PlannedQuote[] {
  const planned: PlannedQuote[] = [];
  let nextDoubleOpen = true;
  let nextSingleOpen = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1] : undefined;
    const next = i < text.length - 1 ? text[i + 1] : undefined;

    if (ch === STRAIGHT_DOUBLE) {
      if (nextDoubleOpen) {
        planned.push({
          start: i,
          end: i + 1,
          replacement: PAPER_OPEN_DOUBLE_QUOTE,
          displayClass: 'paper-md-curly-dquote-open',
        });
        nextDoubleOpen = false;
      } else {
        planned.push({
          start: i,
          end: i + 1,
          replacement: PAPER_CLOSE_DOUBLE_QUOTE,
          displayClass: 'paper-md-curly-dquote-close',
        });
        nextDoubleOpen = true;
      }
      continue;
    }

    if (ch === STRAIGHT_SINGLE) {
      if (isWordChar(prev) && isWordChar(next)) {
        planned.push({
          start: i,
          end: i + 1,
          replacement: PAPER_APOS_OR_CLOSE_SINGLE,
          displayClass: 'paper-md-curly-apostrophe',
        });
      } else if (nextSingleOpen) {
        planned.push({
          start: i,
          end: i + 1,
          replacement: PAPER_OPEN_SINGLE_QUOTE,
          displayClass: 'paper-md-curly-squote-open',
        });
        nextSingleOpen = false;
      } else {
        planned.push({
          start: i,
          end: i + 1,
          replacement: PAPER_APOS_OR_CLOSE_SINGLE,
          displayClass: 'paper-md-curly-squote-close',
        });
        nextSingleOpen = true;
      }
      continue;
    }

    nextDoubleOpen = syncDoubleQuoteState(ch, nextDoubleOpen);
    nextSingleOpen = syncSingleQuoteState(ch, prev, next, nextSingleOpen);
  }

  return planned;
}

export function nextTypedDoubleQuote(textBefore: string): string {
  let nextDoubleOpen = true;
  for (const ch of textBefore) {
    nextDoubleOpen = syncDoubleQuoteState(ch, nextDoubleOpen);
  }
  return nextDoubleOpen ? PAPER_OPEN_DOUBLE_QUOTE : PAPER_CLOSE_DOUBLE_QUOTE;
}

export function nextTypedSingleQuote(textBefore: string): string {
  if (textBefore.length > 0) {
    const prev = textBefore[textBefore.length - 1]!;
    if (isWordChar(prev)) return PAPER_APOS_OR_CLOSE_SINGLE;
  }

  let nextSingleOpen = true;
  for (let i = 0; i < textBefore.length; i++) {
    const ch = textBefore[i]!;
    const prev = i > 0 ? textBefore[i - 1] : undefined;
    const next = i < textBefore.length - 1 ? textBefore[i + 1] : undefined;
    nextSingleOpen = syncSingleQuoteState(ch, prev, next, nextSingleOpen);
  }
  return nextSingleOpen ? PAPER_OPEN_SINGLE_QUOTE : PAPER_APOS_OR_CLOSE_SINGLE;
}

function applyPlannedQuotes(text: string, planned: PlannedQuote[]): string {
  if (planned.length === 0) return text;
  let out = text;
  for (let i = planned.length - 1; i >= 0; i--) {
    const hit = planned[i]!;
    out = out.slice(0, hit.start) + hit.replacement + out.slice(hit.end);
  }
  return out;
}

function applySmartTypographyToProseSegment(text: string): string {
  const withQuotes = applyPlannedQuotes(
    text,
    planStraightQuoteTransforms(text),
  );
  return withQuotes.replace(PAPER_EM_DASH_SOURCE_RE, PAPER_EM_DASH);
}

function mapProseSegments(
  markdown: string,
  map: (segment: string) => string,
): string {
  const parts = markdown.split(CODE_SPLIT_RE);
  return parts
    .map((part, index) => (index % 2 === 1 ? part : map(part)))
    .join('');
}

/** Live inline view: style `--` as an em dash while keeping source characters. */
export function findPaperEmDashStyleRanges(
  content: string,
  extraSkip: readonly Range[] = [],
): PaperSmartTypographySeg[] {
  const skip = mergeRanges([...protectedMarkdownRanges(content), ...extraSkip]);
  const segs: PaperSmartTypographySeg[] = [];
  const re = new RegExp(PAPER_EM_DASH_SOURCE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const start = match.index;
    const end = start + 2;
    if (overlapsRange(start, end, skip)) continue;
    segs.push({ start, end, class: 'paper-md-em-dash' });
  }
  return segs;
}

/** Rendered/raw markdown parse: replace eligible `--` with a real em dash. */
export function applyPaperSmartEmDashToMarkdown(markdown: string): string {
  return mapProseSegments(markdown, (part) =>
    part.replace(PAPER_EM_DASH_SOURCE_RE, PAPER_EM_DASH),
  );
}

/** Rendered/raw markdown parse: smart em dashes + curly quotes in prose. */
export function applyPaperSmartTypographyToMarkdown(markdown: string): string {
  return mapProseSegments(markdown, applySmartTypographyToProseSegment);
}

/** Live inline view: style straight quotes as curly while ASCII stays in source. */
export function findPaperSmartQuoteStyleRanges(
  content: string,
  extraSkip: readonly Range[] = [],
): PaperSmartTypographySeg[] {
  const skip = mergeRanges([...protectedMarkdownRanges(content), ...extraSkip]);
  return planStraightQuoteTransforms(content)
    .filter((hit) => !overlapsRange(hit.start, hit.end, skip))
    .map((hit) => ({
      start: hit.start,
      end: hit.end,
      class: hit.displayClass,
    }));
}
