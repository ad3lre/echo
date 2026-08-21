import { describe, expect, it } from 'vitest';
import { normalizeEchoEmojiMarketPacksPayload } from '@/features/chat/emoji/echoEmojiMarketPacksFromHttp';

describe('normalizeEchoEmojiMarketPacksFromHttp', () => {
  it('normalizes nested pack and emojis', () => {
    const out = normalizeEchoEmojiMarketPacksPayload({
      packs: [
        {
          id: 'p1',
          name: 'Pack',
          description: 'd',
          totalUseCount: '10',
          marketSettings: { tags: [' a ', 'b'] },
          emojis: [
            {
              id: 'e1',
              name: 'e',
              kind: 'animated',
              char: 'x',
            },
          ],
        },
      ],
    });
    expect(out.packs).toHaveLength(1);
    expect(out.packs[0]).toMatchObject({
      id: 'p1',
      name: 'Pack',
      description: 'd',
      totalUseCount: 10,
      marketSettings: { tags: ['a', 'b'] },
      emojis: [{ id: 'e1', name: 'e', kind: 'animated', char: 'x' }],
    });
  });

  it('returns empty packs when packs missing', () => {
    expect(normalizeEchoEmojiMarketPacksPayload({})).toEqual({ packs: [] });
  });
});
