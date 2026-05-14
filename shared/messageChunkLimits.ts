import type { MentionEntity } from './types/message';

/** Max characters the chat composer accepts (UTF-16 code units, same as `String.length`). */
export const ECHO_COMPOSER_MAX_INPUT_CHARS = 20_000;

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
  for (let i = a; i < b; i += maxChunk) {
    chunks.push(rawContent.slice(i, Math.min(i + maxChunk, b)));
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
