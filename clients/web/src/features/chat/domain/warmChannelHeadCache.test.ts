import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWarmChannelHeadsForUser,
  readWarmChannelHeadsForServer,
  touchWarmChannelHead,
  writeWarmChannelHead,
} from '@/features/chat/domain/warmChannelHeadCache';

describe('warmChannelHeadCache fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('degrades cleanly when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(readWarmChannelHeadsForServer('u1', 's1')).resolves.toEqual(
      [],
    );
    await expect(
      writeWarmChannelHead({
        userId: 'u1',
        serverId: 's1',
        channelId: 'c1',
        messages: [
          {
            id: 'm1',
            authorId: 'u1',
            timestamp: '2026-01-01T00:00:00.000Z',
            content: 'hello',
          },
        ],
        hasMoreOlder: true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      touchWarmChannelHead('u1', 's1', 'c1'),
    ).resolves.toBeUndefined();
    await expect(clearWarmChannelHeadsForUser('u1')).resolves.toBeUndefined();
  });
});
