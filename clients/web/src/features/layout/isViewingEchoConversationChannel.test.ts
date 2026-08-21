import { describe, expect, it } from 'vitest';
import { isViewingEchoConversationChannel } from '@/features/layout/isViewingEchoConversationChannel';

describe('isViewingEchoConversationChannel', () => {
  it('matches guild channels by exact id', () => {
    expect(isViewingEchoConversationChannel('ch-1', 'ch-1')).toBe(true);
    expect(isViewingEchoConversationChannel('ch-1', 'ch-2')).toBe(false);
  });

  it('matches DM wire id while active shell is dm-{peer}', () => {
    const map = new Map([['snowflake-dm', 'peer-1']]);
    expect(
      isViewingEchoConversationChannel('snowflake-dm', 'dm-peer-1', {
        echoDmPeerByChannelId: map,
      }),
    ).toBe(true);
  });

  it('matches DM shell while active id is the wire snowflake', () => {
    const map = new Map([['snowflake-dm', 'peer-1']]);
    expect(
      isViewingEchoConversationChannel('snowflake-dm', 'snowflake-dm', {
        echoDmPeerByChannelId: map,
      }),
    ).toBe(true);
  });

  it('matches group DM ids from the group map', () => {
    const groupDMs = {
      'group-key': { id: 'group-wire' },
    };
    expect(
      isViewingEchoConversationChannel('group-wire', 'group-key', {
        groupDMs,
      }),
    ).toBe(true);
  });

  it('does not match a different DM peer', () => {
    const map = new Map([
      ['snowflake-a', 'peer-a'],
      ['snowflake-b', 'peer-b'],
    ]);
    expect(
      isViewingEchoConversationChannel('snowflake-b', 'dm-peer-a', {
        echoDmPeerByChannelId: map,
      }),
    ).toBe(false);
  });
});
