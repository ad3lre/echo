import { describe, expect, it } from 'vitest';
import { mergePaperWatchingPeers } from '@/features/paper/composables/mergePaperWatchingPeers';

describe('mergePaperWatchingPeers', () => {
  it('orders authoring users first and caps avatars', () => {
    const { peers, totalWatching } = mergePaperWatchingPeers([
      { userId: 'v1', displayName: 'Viewer' },
      { userId: 'a1', displayName: 'Alice', authoring: true },
      { userId: 'a2', displayName: 'Bob', authoring: true },
    ]);
    expect(totalWatching).toBe(3);
    expect(peers.map((p) => p.userId)).toEqual(['a1', 'a2', 'v1']);
    expect(peers[0]?.isAuthoring).toBe(true);
  });
});
