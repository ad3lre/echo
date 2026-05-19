import type { MentionEntity, ReplyTo } from '@shared/types';
import {
  mentionsForTextSlice,
  mentionsInTrimmedSlice,
  preparePlainTextChunks,
} from '@shared/messageChunkLimits';

/**
 * When trimmed plain text is longer than `chunkChars`, split for sequential outbound sends.
 * Mention offsets are remapped per chunk (same rules as `useSocket` `sendMessage`).
 *
 * @returns `true` if chunking ran — caller should **not** send the full body again.
 */
export function forEachPreparedOutboundPlainTextChunk(opts: {
  content: string;
  chunkChars: number;
  mentions?: MentionEntity[];
  replyTo?: ReplyTo;
  emitChunk: (args: {
    text: string;
    mentions: MentionEntity[] | undefined;
    replyTo: ReplyTo | undefined;
  }) => void;
}): boolean {
  const chunkPlan = preparePlainTextChunks(opts.content, opts.chunkChars);
  if (!chunkPlan) return false;

  const baseMentions = mentionsInTrimmedSlice(
    opts.mentions,
    chunkPlan.trimStart,
    chunkPlan.trimEnd,
  );
  let off = 0;
  for (let i = 0; i < chunkPlan.chunks.length; i++) {
    const chunk = chunkPlan.chunks[i]!;
    const partMentions = mentionsForTextSlice(
      baseMentions,
      off,
      off + chunk.length,
    );
    opts.emitChunk({
      text: chunk,
      mentions: partMentions.length ? partMentions : undefined,
      replyTo: i === 0 ? opts.replyTo : undefined,
    });
    off += chunk.length;
  }
  return true;
}
