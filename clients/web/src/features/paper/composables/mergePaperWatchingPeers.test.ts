import { describe, expect, it } from 'vitest';
import { mergePaperWatchingPeers } from '@/features/paper/composables/mergePaperWatchingPeers';

describe('mergePaperWatchingPeers', () => {
  it('orders authoring users first and caps avatars at three', () => {
    const { peers, totalWatching } = mergePaperWatchingPeers([
      { userId: 'v1', displayName: 'Viewer' },
      { userId: 'a1', displayName: 'Alice', authoring: true },
      { userId: 'a2', displayName: 'Bob', authoring: true },
      { userId: 'v2', displayName: 'Carol' },
    ]);
    expect(totalWatching).toBe(4);
    expect(peers).toHaveLength(3);
    expect(peers.map((p) => p.userId)).toEqual(['a1', 'a2', 'v1']);
    expect(peers[0]?.isAuthoring).toBe(true);
  });

  it('excludes the current user and passes avatar URLs', () => {
    const { peers, totalWatching } = mergePaperWatchingPeers(
      [
        { userId: 'me', displayName: 'Me', avatarUrl: 'https://x/me.png' },
        {
          userId: 'u1',
          displayName: 'Alice',
          avatarUrl: 'https://x/alice.png',
        },
      ],
      { excludeUserId: 'me' },
    );
    expect(totalWatching).toBe(1);
    expect(peers).toEqual([
      expect.objectContaining({
        userId: 'u1',
        avatarUrl: 'https://x/alice.png',
      }),
    ]);
  });
});
