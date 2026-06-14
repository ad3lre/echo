import type { FilterKey } from '@/features/chat/messageSearchTypes';

export type SearchInlineFilterMode = 'in' | 'from' | 'mentions' | 'has';

export type ActiveSearchInlineFilter = {
  mode: SearchInlineFilterMode;
  prefix: string;
  start: number;
  end: number;
};

export type SearchInputTextSegment = {
  type: 'text';
  value: string;
  start: number;
  end: number;
};

export type SearchInputFilterSegment = {
  type: 'filter';
  mode: SearchInlineFilterMode;
  value: string;
  start: number;
  end: number;
};

export type SearchInputSegment =
  | SearchInputTextSegment
  | SearchInputFilterSegment;

const INLINE_FILTER_INPUT_RE = /(^|\s)(in|from|mentions|has):([^\s]*)/gi;
const INLINE_FILTER_SEGMENT_RE = /(^|\s)(in|from|mentions|has):([^\s]*)/gi;

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

export function parseSearchInputSegments(text: string): SearchInputSegment[] {
  const segments: SearchInputSegment[] = [];
  let lastIndex = 0;

  INLINE_FILTER_SEGMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_FILTER_SEGMENT_RE.exec(text))) {
    const leadingWs = match[1] ?? '';
    const mode = match[2] as SearchInlineFilterMode;
    const value = match[3] ?? '';
    const tokenStart = match.index + leadingWs.length;
    const tokenEnd = tokenStart + `${mode}:${value}`.length;

    if (tokenStart > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, tokenStart),
        start: lastIndex,
        end: tokenStart,
      });
    }

    segments.push({
      type: 'filter',
      mode,
      value,
      start: tokenStart,
      end: tokenEnd,
    });

    lastIndex = tokenEnd;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
      start: lastIndex,
      end: text.length,
    });
  }

  return segments;
}

export function segmentsToSearchText(segments: SearchInputSegment[]): string {
  return segments
    .map((seg) =>
      seg.type === 'text' ? seg.value : `${seg.mode}:${seg.value}`,
    )
    .join('');
}

export function inlineFilterModeToChipKey(
  mode: SearchInlineFilterMode,
): FilterKey {
  return mode === 'has' ? 'hasType' : mode;
}

export function filterTagValueLabel(
  mode: SearchInlineFilterMode,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (mode === 'in') return `#${trimmed.replace(/^#/, '')}`;
  if (mode === 'from' || mode === 'mentions') {
    return `@${trimmed.replace(/^@/, '')}`;
  }
  return trimmed;
}

export function isFilterSegmentActive(
  segment: SearchInputFilterSegment,
  active: ActiveSearchInlineFilter | null,
): boolean {
  if (!active) return false;
  return (
    segment.mode === active.mode &&
    segment.start === active.start &&
    segment.end === active.end
  );
}
