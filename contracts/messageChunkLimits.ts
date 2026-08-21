import type { MentionEntity } from './types/message';

/** Max characters the chat composer accepts (UTF-16 code units, same as `String.length`). */
export const ECHO_COMPOSER_MAX_INPUT_CHARS = 20_000;

/** Max length for per-channel default message format template (UTF-16 code units). */
export const ECHO_MESSAGE_FORMAT_TEMPLATE_MAX_CHARS = 4000;

/** Normalize CRLF / lone CR so composer plain text and templates compare consistently. */
export function normalizeEchoMessageFormatLineEndings(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Normalize and clamp channel message format template from API input. */
export function normalizeEchoMessageFormatTemplateInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s =
    raw.length > ECHO_MESSAGE_FORMAT_TEMPLATE_MAX_CHARS
      ? raw.slice(0, ECHO_MESSAGE_FORMAT_TEMPLATE_MAX_CHARS)
      : raw;
  return normalizeEchoMessageFormatLineEndings(s);
}

/**
 * True when `plain` is empty/whitespace-only or starts with the hard-format
 * template (LF-normalized). Used by client composer and server send validation.
 */
export function echoHardFormatPrefixSatisfied(
  plain: string,
  template: string,
): boolean {
  const t = normalizeEchoMessageFormatLineEndings(template);
  if (!t) return true;
  const p = normalizeEchoMessageFormatLineEndings(plain);
  if (p.trim().length === 0) return true;
  return p.startsWith(t);
}

/**
 * If plain text starts with the template duplicated back-to-back, return
 * plain with one copy removed (LF-normalized). Otherwise null.
 */
export function stripLeadingDuplicateHardFormatTemplate(
  plain: string,
  template: string,
): string | null {
  const t = normalizeEchoMessageFormatLineEndings(template);
  const p = normalizeEchoMessageFormatLineEndings(plain);
  if (!t || p.length < t.length * 2) return null;
  if (!p.startsWith(t + t)) return null;
  return t + p.slice(t.length * 2);
}

/**
 * Raw UTF-16 length at the start of `plain` that corresponds to the full
 * hard-format template prefix (LF-normalized). Returns 0 when `plain` does not
 * start with the template — callers must rehydrate the prefix instead of
 * blocking deletion using the template length alone.
 */
export function echoHardFormatProtectedPrefixLen(
  plain: string,
  template: string,
): number {
  const t = normalizeEchoMessageFormatLineEndings(template);
  if (!t) return 0;
  const p = normalizeEchoMessageFormatLineEndings(plain);
  if (!p.startsWith(t)) return 0;
  for (let rawLen = 0; rawLen <= plain.length; rawLen++) {
    const normLen = normalizeEchoMessageFormatLineEndings(
      plain.slice(0, rawLen),
    ).length;
    if (normLen === t.length) return rawLen;
  }
  return t.length;
}

/** Outbound plain-text chat messages are split into chunks of at most this size before sending. */
export const ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS = 2000;

export type PlainTextChunkPlan = {
  chunks: string[];
  trimStart: number;
  trimEnd: number;
};

/**
 * If trimmed plain text is longer than `maxChunk`, returns chunk slices and trim range into `rawContent`
 * for mention remapping. Otherwise returns `null` (caller should send `content` as-is).
 */
export function preparePlainTextChunks(
  rawContent: string,
  maxChunk: number = ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS,
): PlainTextChunkPlan | null {
  let a = 0;
  let b = rawContent.length;
  while (a < b && /\s/.test(rawContent[a]!)) a++;
  while (b > a && /\s/.test(rawContent[b - 1]!)) b--;
  const trimmedLen = b - a;
  if (trimmedLen <= maxChunk) return null;
  const chunks: string[] = [];
  for (let pos = a; pos < b; ) {
    const hardEnd = Math.min(pos + maxChunk, b);
    if (hardEnd >= b) {
      chunks.push(rawContent.slice(pos, b));
      break;
    }
    const window = rawContent.slice(pos, hardEnd);
    const nlIdx = window.lastIndexOf('\n');
    let splitAt = hardEnd;
    if (nlIdx > 0) {
      splitAt = pos + nlIdx + 1;
    } else {
      const spIdx = window.lastIndexOf(' ');
      if (spIdx > 0) splitAt = pos + spIdx + 1;
    }
    if (splitAt <= pos) splitAt = hardEnd;
    chunks.push(rawContent.slice(pos, splitAt));
    pos = splitAt;
  }
  return { chunks, trimStart: a, trimEnd: b };
}

/** Map mention offsets from full composer string to trimmed plain-text coordinates. */
export function mentionsInTrimmedSlice(
  mentions: MentionEntity[] | undefined,
  trimStart: number,
  trimEnd: number,
): MentionEntity[] {
  if (!mentions?.length) return [];
  return mentions
    .filter((m) => m.start >= trimStart && m.end <= trimEnd)
    .map((m) => ({
      ...m,
      start: m.start - trimStart,
      end: m.end - trimStart,
    }));
}

/** Keep mentions that lie fully inside `[chunkStart, chunkEnd)` and shift to chunk-local offsets. */
export function mentionsForTextSlice(
  mentionsTrimmedRelative: MentionEntity[],
  chunkStart: number,
  chunkEnd: number,
): MentionEntity[] {
  return mentionsTrimmedRelative
    .filter((m) => m.start >= chunkStart && m.end <= chunkEnd)
    .map((m) => ({
      ...m,
      start: m.start - chunkStart,
      end: m.end - chunkStart,
    }));
}
