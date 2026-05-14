import { describe, expect, it } from 'vitest';
import {
  workspaceSocialFromHydrateResults,
  workspaceSocialFromRefreshResults,
} from '@/services/domain/workspaceSocialHydrateMap';

describe('workspaceSocialFromHydrateResults', () => {
  it('maps API shapes into workspace snapshot', () => {
    const out = workspaceSocialFromHydrateResults(
      { friends: [{ peerId: 'u1', status: 'online' }] },
      {
        threads: [
          { channelId: 'ch-dm', kind: 'direct' as const, peerUserId: 'u9' },
        ],
      },
      { blockedUserIds: ['b1'] },
      {
        incoming: [{ id: 'i1', fromUserId: 'u2' }],
        outgoing: [{ id: 'o1', toUserId: 'u3' }],
      },
      {
        requests: [
          {
            id: 'r1',
            channelId: 'c1',
            fromUserId: 'u4',
            preview: 'hi',
          },
        ],
      },
    );
    expect(out.friendIds).toEqual(['u1']);
    expect(out.friendRequestsIncoming).toEqual([
      { id: 'i1', fromUserId: 'u2' },
    ]);
    expect(out.friendRequestsOutgoing).toEqual([{ id: 'o1', toUserId: 'u3' }]);
    expect(out.messageRequests).toEqual([
      {
        id: 'r1',
        channelId: 'c1',
        fromUserId: 'u4',
        preview: 'hi',
      },
    ]);
    expect(out.dmThreads).toHaveLength(1);
    expect(out.blockedUserIds).toEqual(['b1']);
  });

  it('defaults missing preview and blocked list', () => {
    const out = workspaceSocialFromHydrateResults(
      { friends: [] },
      { threads: [] },
      {},
      { incoming: [], outgoing: [] },
      {
        requests: [
          {
            id: 'r1',
            channelId: 'c1',
            fromUserId: 'u1',
          },
        ],
      },
    );
    expect(out.messageRequests[0]!.preview).toBe('');
    expect(out.blockedUserIds).toEqual([]);
  });
});

describe('workspaceSocialFromRefreshResults', () => {
  it('maps friends, requests, and message requests only', () => {
    const out = workspaceSocialFromRefreshResults(
      { friends: [{ peerId: 'a', status: 'idle' }] },
      { blockedUserIds: ['blk-1'] },
      {
        incoming: [{ id: 'i', fromUserId: 'b' }],
        outgoing: [{ id: 'o', toUserId: 'c' }],
      },
      {
        requests: [
          {
            id: 'm',
            channelId: 'ch',
            fromUserId: 'd',
            preview: 'x',
          },
        ],
      },
    );
    expect(out.friendIds).toEqual(['a']);
    expect(out.friendRequestsIncoming).toHaveLength(1);
    expect(out.friendRequestsOutgoing).toHaveLength(1);
    expect(out.messageRequests).toHaveLength(1);
    expect(out.blockedUserIds).toEqual(['blk-1']);
  });
});
