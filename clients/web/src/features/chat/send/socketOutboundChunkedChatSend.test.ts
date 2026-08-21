import { describe, expect, it } from 'vitest';
import { runChunkedOrSingleOutboundChatSend } from '@/features/chat/send/socketOutboundChunkedChatSend';
import type { MentionEntity, ReplyTo } from '@shared/types';

describe('runChunkedOrSingleOutboundChatSend', () => {
  it('when mayChunkPlainText is false, emits once with full body and json (no chunking)', () => {
    const calls: unknown[] = [];
    const contentJson = { t: 1 };
    runChunkedOrSingleOutboundChatSend({
      content: `${'a'.repeat(5000)}`,
      mayChunkPlainText: false,
      contentJson,
      contentSchemaVersion: 3,
      chunkChars: 100,
      emit: (a) => calls.push(a),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      wireContent: expect.stringMatching(/^a+$/),
      wireContentJson: contentJson,
      wireContentSchemaVersion: 3,
    });
    expect((calls[0] as { wireContent: string }).wireContent).toHaveLength(
      5000,
    );
  });

  it('when mayChunkPlainText and body fits one chunk, emits once with json', () => {
    const calls: unknown[] = [];
    runChunkedOrSingleOutboundChatSend({
      content: 'short',
      mayChunkPlainText: true,
      contentJson: { x: 1 },
      contentSchemaVersion: 1,
      chunkChars: 2000,
      emit: (a) => calls.push(a),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      wireContent: 'short',
      wireContentJson: { x: 1 },
      wireContentSchemaVersion: 1,
    });
  });

  it('when mayChunkPlainText and body spans chunks, emits per chunk without json; replyTo only on first', () => {
    const part: { text: string; reply?: ReplyTo }[] = [];
    const reply: ReplyTo = {
      messageId: 'm1',
      authorName: 'a',
      content: 'prev',
    };
    const body = `${'a'.repeat(100)}${'b'.repeat(100)}`;
    runChunkedOrSingleOutboundChatSend({
      content: body,
      mayChunkPlainText: true,
      replyTo: reply,
      chunkChars: 100,
      emit: (a) => part.push({ text: a.wireContent, reply: a.wireReplyTo }),
    });
    expect(part).toHaveLength(2);
    expect(part[0]!.text).toHaveLength(100);
    expect(part[0]!.reply).toEqual(reply);
    expect(part[1]!.reply).toBeUndefined();
  });

  it('passes mentions only on the chunk they belong to', () => {
    const chunks: { text: string; mentions?: MentionEntity[] }[] = [];
    const mentions: MentionEntity[] = [
      {
        id: 'x',
        kind: 'user',
        label: '@u',
        start: 105,
        end: 108,
        userId: 'u1',
      },
    ];
    const body = `${'a'.repeat(120)}`;
    runChunkedOrSingleOutboundChatSend({
      content: body,
      mayChunkPlainText: true,
      mentions,
      chunkChars: 100,
      emit: (a) =>
        chunks.push({ text: a.wireContent, mentions: a.wireMentions }),
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.mentions).toBeUndefined();
    expect(chunks[1]!.mentions?.length).toBe(1);
  });
});
