import { describe, expect, it } from 'vitest';
import { normalizeEchoDmThreadsHttpPayload } from '../echoDmThreadsFromHttp';

describe('normalizeEchoDmThreadsHttpPayload', () => {
  it('returns empty threads for non-object', () => {
    expect(normalizeEchoDmThreadsHttpPayload(null)).toEqual({ threads: [] });
    expect(normalizeEchoDmThreadsHttpPayload(undefined)).toEqual({
      threads: [],
    });
  });

  it('normalizes direct and group threads', () => {
    const out = normalizeEchoDmThreadsHttpPayload({
      threads: [
        {
          channelId: 'dm-1',
          kind: 'direct',
          peerUserId: 'u1',
          lastActivityId: ' m1 ',
        },
        {
          channelId: 'g1',
          kind: 'group',
          name: 'Team',
          memberUserIds: ['a', 'b'],
          pfp: ' https://cdn.example.com/g.png ',
        },
      ],
    });
    expect(out.threads).toHaveLength(2);
    expect(out.threads[0]).toMatchObject({
      channelId: 'dm-1',
      kind: 'direct',
      peerUserId: 'u1',
      lastActivityId: 'm1',
    });
    expect(out.threads[1]).toMatchObject({
      channelId: 'g1',
      kind: 'group',
      name: 'Team',
      memberUserIds: ['a', 'b'],
      pfp: 'https://cdn.example.com/g.png',
    });
  });

  it('skips invalid rows', () => {
    expect(
      normalizeEchoDmThreadsHttpPayload({
        threads: [{ channelId: '' }, { foo: 1 }],
      }).threads,
    ).toEqual([]);
  });
});
