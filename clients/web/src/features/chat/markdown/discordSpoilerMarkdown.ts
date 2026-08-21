/**
 * Pipe-delimited `||spoiler||` on **raw** markdown before marked.parse.
 * Post-HTML regex breaks when marked emits tags (e.g. `||a \`||\` b||` → early close at <code>||</code>).
 */

import {
  createEscapedMarkdownFenceWalkState,
  stepEscapedMarkdownFenceAtLine,
} from '@/features/chat/markdown/markdownFenceEscape';

const MARK_START = '\uFFF0';
const INDEX_BASE = 0xe000;

export type RawSpoilerRegion = { start: number; end: number; inner: string };

function lineEnd(text: string, i: number): number {
  const n = text.indexOf('\n', i);
  return n === -1 ? text.length : n;
}

function isFenceOpenerLine(line: string): RegExpExecArray | null {
  return /^ {0,3}(`{3,}|~{3,})(?:[ \t]+[^\n]*)?$/.exec(line);
}

function isFenceCloserLine(
  line: string,
  fenceChar: '`' | '~',
  minLen: number,
): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (!m) return false;
  const seq = m[1]!;
  if (fenceChar === '`' && !seq.startsWith('`')) return false;
  if (fenceChar === '~' && !seq.startsWith('~')) return false;
  return seq.length >= minLen;
}

/** Skip `inline` / ``doubled`` code; return index after closing run. Opening ` at i. */
function skipInlineBacktickRun(text: string, i: number): number {
  if (text[i] !== '`') return i;
  let j = i;
  while (j < text.length && text[j] === '`') j++;
  const run = j - i;
  // Fence-length runs are not inline code; advance past them. Returning `i` here
  // caused an infinite loop when ``` appeared mid-line (e.g. prepending "!```").
  if (run >= 3) return j;
  let k = j;
  while (k < text.length) {
    const ch = text[k];
    if (ch === '\\' && k + 1 < text.length) {
      k += 2;
      continue;
    }
    if (ch === '`') {
      let closeRun = 0;
      let t = k;
      while (t < text.length && text[t] === '`') {
        closeRun++;
        t++;
      }
      if (closeRun === run) return t;
    }
    k++;
  }
  return text.length;
}

/**
 * First `||` at or after `from`, respecting fences + inline code (not inside fence from outer walk).
 */
function findClosingDoublePipe(text: string, from: number): number {
  let i = from;
  let inFence = false;
  let fenceChar: '`' | '~' = '`';
  let fenceMinLen = 3;
  const escapedFence = createEscapedMarkdownFenceWalkState();

  while (i < text.length) {
    if (!inFence && (i === 0 || text[i - 1] === '\n')) {
      const le = lineEnd(text, i);
      const line = text.slice(i, le);
      if (stepEscapedMarkdownFenceAtLine(line, escapedFence)) {
        i = le === text.length ? text.length : le + 1;
        continue;
      }
      if (!escapedFence.inEscapedFence) {
        const op = isFenceOpenerLine(line);
        if (op) {
          const fence = op[1]!;
          fenceChar = fence[0] === '`' ? '`' : '~';
          fenceMinLen = fence.length;
          inFence = true;
          i = le === text.length ? text.length : le + 1;
          continue;
        }
      }
    }

    if (inFence) {
      const le = lineEnd(text, i);
      const line = text.slice(i, le);
      if (isFenceCloserLine(line, fenceChar, fenceMinLen)) {
        inFence = false;
      }
      i = le === text.length ? text.length : le + 1;
      continue;
    }

    if (text[i] === '`') {
      i = skipInlineBacktickRun(text, i);
      continue;
    }

    if (text[i] === '|' && text[i + 1] === '|') {
      return i;
    }

    i++;
  }
  return -1;
}

const MAX_SPOILERS = 4095;

/**
 * Pairs of `||` outside fenced blocks; inline `code` cannot host closing `||` (skipped).
 */
export function findRawDiscordSpoilerRegions(text: string): RawSpoilerRegion[] {
  const regions: RawSpoilerRegion[] = [];
  let i = 0;
  let inFence = false;
  let fenceChar: '`' | '~' = '`';
  let fenceMinLen = 3;
  const escapedFence = createEscapedMarkdownFenceWalkState();

  while (i < text.length) {
    if (inFence) {
      const le = lineEnd(text, i);
      const line = text.slice(i, le);
      if (isFenceCloserLine(line, fenceChar, fenceMinLen)) {
        inFence = false;
      }
      i = le === text.length ? text.length : le + 1;
      continue;
    }

    if (i === 0 || text[i - 1] === '\n') {
      const le = lineEnd(text, i);
      const line = text.slice(i, le);
      if (stepEscapedMarkdownFenceAtLine(line, escapedFence)) {
        i = le === text.length ? text.length : le + 1;
        continue;
      }
      if (!escapedFence.inEscapedFence) {
        const op = isFenceOpenerLine(line);
        if (op) {
          const fence = op[1]!;
          fenceChar = fence[0] === '`' ? '`' : '~';
          fenceMinLen = fence.length;
          inFence = true;
          i = le === text.length ? text.length : le + 1;
          continue;
        }
      }
    }

    if (text[i] === '`') {
      i = skipInlineBacktickRun(text, i);
      continue;
    }

    if (text[i] === '|' && text[i + 1] === '|') {
      if (regions.length >= MAX_SPOILERS) {
        i += 2;
        continue;
      }
      const open = i;
      const close = findClosingDoublePipe(text, open + 2);
      if (close < 0) {
        i++;
        continue;
      }
      regions.push({
        start: open,
        end: close + 2,
        inner: text.slice(open + 2, close),
      });
      i = close + 2;
      continue;
    }

    i++;
  }

  return regions;
}

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

function strictlyInside(
  s: number,
  e: number,
  innerLo: number,
  innerHi: number,
): boolean {
  return s >= innerLo && e <= innerHi;
}

export function partitionMentionsForSpoilerRegions(
  mentions: readonly { start: number; end: number }[],
  regions: readonly RawSpoilerRegion[],
): {
  slotMentions: { inner: string; mentions: { start: number; end: number }[] }[];
  outsideRemapped: { start: number; end: number }[];
  abort: boolean;
} {
  const innerRanges = regions.map((r) => ({
    lo: r.start + 2,
    hi: r.start + 2 + r.inner.length,
    inner: r.inner,
  }));

  for (const m of mentions) {
    for (const { lo, hi } of innerRanges) {
      if (!rangesOverlap(m.start, m.end, lo, hi)) continue;
      if (strictlyInside(m.start, m.end, lo, hi)) continue;
      return { slotMentions: [], outsideRemapped: [], abort: true };
    }
  }

  const slotMentions = regions.map((r) => {
    const lo = r.start + 2;
    const hi = lo + r.inner.length;
    const innerM = mentions
      .filter((m) => strictlyInside(m.start, m.end, lo, hi))
      .map((m) => ({ ...m, start: m.start - lo, end: m.end - lo }));
    return { inner: r.inner, mentions: innerM };
  });

  const outside = mentions.filter((m) =>
    innerRanges.every(({ lo, hi }) => !rangesOverlap(m.start, m.end, lo, hi)),
  );

  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const tokenLen = 3;
  const outsideRemapped = outside.map((m) => {
    let d = 0;
    for (const r of sorted) {
      if (r.end <= m.start) d += tokenLen - (r.end - r.start);
    }
    const newStart = m.start + d;
    let d2 = 0;
    for (const r of sorted) {
      if (r.end <= m.end) d2 += tokenLen - (r.end - r.start);
    }
    const newEnd = m.end + d2;
    return { ...m, start: newStart, end: newEnd };
  });

  return { slotMentions, outsideRemapped, abort: false };
}

export function makeSpoilerPlaceholderToken(index: number): string {
  if (index < 0 || index > MAX_SPOILERS) {
    throw new RangeError('spoiler slot index out of range');
  }
  return `${MARK_START}${String.fromCharCode(INDEX_BASE + index)}${MARK_START}`;
}

export function buildTextWithSpoilerPlaceholders(
  text: string,
  regions: readonly RawSpoilerRegion[],
): string {
  if (regions.length === 0) return text;
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (let idx = 0; idx < sorted.length; idx++) {
    const r = sorted[idx]!;
    out += text.slice(last, r.start);
    out += makeSpoilerPlaceholderToken(idx);
    last = r.end;
  }
  out += text.slice(last);
  return out;
}

export function replaceSpoilerPlaceholdersInHtml<
  M extends { start: number; end: number },
>(
  html: string,
  slots: readonly { inner: string; mentions: M[] }[],
  renderInner: (inner: string, mentions: M[]) => string,
): string {
  let out = html;
  for (let i = 0; i < slots.length; i++) {
    const token = makeSpoilerPlaceholderToken(i);
    const { inner, mentions } = slots[i]!;
    const wrapped = `<span class="spoiler">${renderInner(inner, mentions)}</span>`;
    out = out.split(token).join(wrapped);
  }
  return out;
}
