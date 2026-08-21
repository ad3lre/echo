import type { MentionEntity, ReplyTo } from '@shared/types';
import { ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS } from '@shared/messageChunkLimits';
import { forEachPreparedOutboundPlainTextChunk } from '@/features/layout/realtime/socketOutboundPlainTextChunks';

export type OutboundChatWireArgs = {
  wireContent: string;
  wireMentions?: MentionEntity[];
  wireReplyTo?: ReplyTo;
  wireContentJson?: unknown;
  wireContentSchemaVersion?: number;
};

/**
 * Plain-text path after poll handling: optionally chunk long bodies (mentions/reply on first chunk only),
 * otherwise one logical send including optional rich JSON.
 */
export function runChunkedOrSingleOutboundChatSend(opts: {
  content: string;
  chunkChars?: number;
  mentions?: MentionEntity[];
  replyTo?: ReplyTo;
  /** When false, skip chunking and send `content` once (e.g. media or forward). */
  mayChunkPlainText: boolean;
  contentJson?: unknown;
  contentSchemaVersion?: number;
  emit: (args: OutboundChatWireArgs) => void;
}): void {
  const chunkChars = opts.chunkChars ?? ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS;
  if (opts.mayChunkPlainText) {
    if (
      forEachPreparedOutboundPlainTextChunk({
        content: opts.content,
        chunkChars,
        mentions: opts.mentions,
        replyTo: opts.replyTo,
        emitChunk: ({ text, mentions: m, replyTo: r }) => {
          opts.emit({
            wireContent: text,
            wireMentions: m,
            wireReplyTo: r,
            wireContentJson: undefined,
            wireContentSchemaVersion: undefined,
          });
        },
      })
    ) {
      return;
    }
  }
  opts.emit({
    wireContent: opts.content,
    wireMentions: opts.mentions,
    wireReplyTo: opts.replyTo,
    wireContentJson: opts.contentJson,
    wireContentSchemaVersion: opts.contentSchemaVersion,
  });
}
