import { describe, expect, it } from 'vitest';
import { forEachPreparedOutboundPlainTextChunk } from '@/features/layout/realtime/socketOutboundPlainTextChunks';
import type { MentionEntity, ReplyTo } from '@shared/types';

describe('forEachPreparedOutboundPlainTextChunk', () => {
  it('returns false when body fits in one chunk', () => {
    const calls: string[] = [];
    const ok = forEachPreparedOutboundPlainTextChunk({
      content: 'short',
      chunkChars: 2000,
      emitChunk: (a) => {
        calls.push(a.text);
      },
    });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('splits long trimmed body and only first chunk keeps replyTo', () => {
    const part: { text: string; reply?: ReplyTo }[] = [];
    const body = `${'a'.repeat(2000)}${'b'.repeat(2000)}`;
    const reply: ReplyTo = {
      messageId: 'm1',
      authorName: 'a',
      content: 'prev',
    };
    const ok = forEachPreparedOutboundPlainTextChunk({
      content: body,
      chunkChars: 2000,
      replyTo: reply,
      emitChunk: (a) => {
        part.push({ text: a.text, reply: a.replyTo });
      },
    });
    expect(ok).toBe(true);
    expect(part).toHaveLength(2);
    expect(part[0]!.text).toHaveLength(2000);
    expect(part[0]!.reply).toEqual(reply);
    expect(part[1]!.reply).toBeUndefined();
  });

  it('passes mentions only for the chunk they belong to', () => {
    const mentions: MentionEntity[] = [
      {
        id: 'x',
        kind: 'user',
        label: '@u',
        start: 100,
        end: 103,
        userId: 'u1',
      },
    ];
    const chunks: { text: string; mentions?: MentionEntity[] }[] = [];
    const body = `${'a'.repeat(2500)}`;
    forEachPreparedOutboundPlainTextChunk({
      content: body,
      chunkChars: 2000,
      mentions,
      emitChunk: (a) => chunks.push({ text: a.text, mentions: a.mentions }),
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.mentions?.length).toBe(1);
    expect(chunks[0]!.mentions![0]!.start).toBe(100);
    expect(chunks[1]!.mentions).toBeUndefined();
  });
});
