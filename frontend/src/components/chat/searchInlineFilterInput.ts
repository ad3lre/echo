export type SearchInlineFilterMode = 'in' | 'from' | 'mentions' | 'has';

export type ActiveSearchInlineFilter = {
  mode: SearchInlineFilterMode;
  prefix: string;
  start: number;
  end: number;
};

const INLINE_FILTER_INPUT_RE = /(^|\s)(in|from|mentions|has):([^\s]*)/gi;

export function detectActiveSearchInlineFilter(
  text: string,
  cursor: number,
): ActiveSearchInlineFilter | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  let match: RegExpExecArray | null;
  let active: ActiveSearchInlineFilter | null = null;

  INLINE_FILTER_INPUT_RE.lastIndex = 0;
  while ((match = INLINE_FILTER_INPUT_RE.exec(text))) {
    const leadingWs = match[1] ?? '';
    const mode = match[2] as SearchInlineFilterMode;
    const prefix = match[3] ?? '';
    const start = match.index + leadingWs.length;
    const end = start + `${mode}:${prefix}`.length;
    if (safeCursor >= start && safeCursor <= end) {
      active = { mode, prefix, start, end };
    }
  }

  return active;
}

export function removeInlineFilterToken(
  text: string,
  token: Pick<ActiveSearchInlineFilter, 'start' | 'end'>,
): string {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end);
  const needsBridgeSpace =
    before.length > 0 &&
    after.length > 0 &&
    !/\s$/.test(before) &&
    !/^\s/.test(after);

  return `${before}${needsBridgeSpace ? ' ' : ''}${after}`
    .replace(/\s{2,}/g, ' ')
    .trim();
}
