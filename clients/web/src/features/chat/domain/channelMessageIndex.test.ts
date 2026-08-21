import { beforeEach, describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  _resetAllIndexesForTesting,
  createChannelMessageIndex,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';

function makeMessage(
  id: string,
  authorId: string,
  timestamp: string,
  extra: Partial<RawMessage> = {},
): RawMessage {
  return {
    id,
    authorId,
    timestamp,
    content: id,
    ...extra,
  };
}

describe('channelMessageIndex', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
  });

  it('prepends older pages without rebuilding lookup shape', () => {
    const index = createChannelMessageIndex([
      makeMessage('m2', 'u2', '2026-04-10T12:02:00.000Z'),
      makeMessage('m3', 'u3', '2026-04-10T12:03:00.000Z'),
    ]);

    index.mergeBatch(
      [
        makeMessage('m0', 'u0', '2026-04-10T12:00:00.000Z'),
        makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
      ],
      'prepend',
    );

    expect(index.sorted.value.map((message) => message.id)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
    expect(index.byId.get('m1')?.authorId).toBe('u1');
    expect([...index.authorIds]).toEqual(['u2', 'u3', 'u0', 'u1']);
  });

  it('getChannelIndex does not replace a populated index from a stale bucket', () => {
    const channelId = 'ch-stale-bucket';
    const fresh = [
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z'),
      makeMessage('m2', 'u2', '2026-04-10T12:02:00.000Z'),
      makeMessage('m3', 'u3', '2026-04-10T12:03:00.000Z'),
    ];
    getChannelIndex(channelId, fresh);
    const staleBucket = fresh.slice(0, 2);
    const resolved = getChannelIndex(channelId, staleBucket);
    expect(resolved.sorted.value.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('trimHead removes dropped messages from byId and metadata', () => {
    const index = createChannelMessageIndex([
      makeMessage('m1', 'u1', '2026-04-10T12:01:00.000Z', {
        imageUrl: 'https://cdn.test/one.png',
      }),
      makeMessage('m2', 'u1', '2026-04-10T12:02:00.000Z'),
      makeMessage('m3', 'u3', '2026-04-10T12:03:00.000Z'),
    ]);

    expect(index.trimHead(2)).toBe(true);

    expect(index.sorted.value.map((message) => message.id)).toEqual(['m3']);
    expect(index.byId.has('m1')).toBe(false);
    expect(index.byId.has('m2')).toBe(false);
    expect(index.byId.has('m3')).toBe(true);
    expect([...index.authorIds]).toEqual(['u3']);
    expect(index.imageUrls.value).toEqual([]);
  });
});
