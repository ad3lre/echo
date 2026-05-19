import { describe, expect, it } from 'vitest';
import { ECHO_SNOWFLAKE_EPOCH_MS } from '@shared/snowflakeIds';
import {
  buildDmPanelInboxList,
  buildDmPanelUserList,
  dmPeerUserIdFromChannelId,
  echoDmChannelIdForPeerUser,
  getLatestDmPeerUserId,
} from '@/features/dm/buildDmPanelUserList';

/** Deterministic Echo-format snowflake encoding `ms` (for tests). */
function echoSnowflakeForMillis(ms: number): string {
  return (
    ((BigInt(ms) - BigInt(ECHO_SNOWFLAKE_EPOCH_MS)) << 22n) +
    1n
  ).toString();
}

describe('dmPeerUserIdFromChannelId', () => {
  it('parses legacy dm- channels', () => {
    const m = new Map<string, string>();
    expect(dmPeerUserIdFromChannelId('dm-u1', m)).toBe('u1');
    expect(dmPeerUserIdFromChannelId('dm-group-x', m)).toBeNull();
  });

  it('resolves Echo snowflake channels via map', () => {
    const m = new Map([['ch1', 'peer']]);
    expect(dmPeerUserIdFromChannelId('ch1', m)).toBe('peer');
  });
});

describe('buildDmPanelUserList', () => {
  it('includes peers from echo map and legacy dm keys', () => {
    const echo = new Map<string, string>([['snow', 'alice']]);
    const users = new Map([
      ['alice', { id: 'alice', name: 'Alice', pfp: '', status: 'online' }],
      ['bob', { id: 'bob', name: 'Bob', pfp: '', status: 'offline' }],
    ]);
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: echo,
      messageKeys: ['dm-bob'],
      getMessages: () => [],
      usersById: users,
      selectedDmUserId: null,
    });
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(['alice', 'bob']);
  });

  it('includes selected peer even with no thread yet', () => {
    const users = new Map([
      ['zoe', { id: 'zoe', name: 'Zoe', pfp: '', status: 'online' }],
    ]);
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messageKeys: [],
      getMessages: () => [],
      usersById: users,
      selectedDmUserId: 'zoe',
    });
    expect(rows.map((r) => r.id)).toEqual(['zoe']);
  });

  it('resolves echo DM channel id for a peer (excludes group threads)', () => {
    const m = new Map([
      ['dm-group-x', 'ignored'],
      ['snowflake-ch', 'alice'],
    ]);
    expect(echoDmChannelIdForPeerUser('alice', m)).toBe('snowflake-ch');
    expect(echoDmChannelIdForPeerUser('bob', m)).toBeNull();
  });

  it('attaches unreadDmCount from dmUnreadByChannelId for users and groups', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '', status: 'online' }],
    ]);
    const unread = new Map([
      ['dm-a', 3],
      ['grp1', 100],
    ]);
    const entries = buildDmPanelInboxList({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messageKeys: ['dm-a'],
      getMessages: () => [],
      usersById: users,
      selectedDmUserId: null,
      groups: [{ id: 'grp1', name: 'G', pfp: '' }],
      activeInboxChannelId: '',
      dmUnreadByChannelId: unread,
    });
    const userEntry = entries.find((e) => e.kind === 'user' && e.id === 'a');
    const groupEntry = entries.find((e) => e.kind === 'group');
    expect(userEntry).toMatchObject({ unreadDmCount: 3 });
    expect(groupEntry).toMatchObject({ unreadDmCount: 100 });
  });

  it('merges groups with 1:1 rows sorted by latest activity', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '', status: 'online' }],
      ['b', { id: 'b', name: 'B', pfp: '', status: 'offline' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2020-01-01T00:00:00.000Z' }],
      'dm-b': [{ timestamp: '2021-01-01T00:00:00.000Z' }],
      grp1: [{ timestamp: '2022-01-01T00:00:00.000Z' }],
    };
    const entries = buildDmPanelInboxList({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messageKeys: Object.keys(messages),
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: null,
      groups: [{ id: 'grp1', name: 'G', pfp: '' }],
      activeInboxChannelId: '',
    });
    expect(entries.map((e) => e.id)).toEqual(['grp1', 'b', 'a']);
    expect(entries[0]).toMatchObject({ kind: 'group', id: 'grp1' });
  });

  it('sorts groups by server thread activity ids when messages are not loaded', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '', status: 'online' }],
    ]);
    const entries = buildDmPanelInboxList({
      selfId: 'me',
      echoPeerByChannelId: new Map([['100', 'a']]),
      activityIdByChannelId: new Map([
        ['100', '1000'],
        ['grp1', '3000'],
        ['grp2', '2000'],
      ]),
      messageKeys: [],
      getMessages: () => [],
      usersById: users,
      selectedDmUserId: null,
      groups: [
        { id: 'grp1', name: 'Group 1', pfp: '' },
        { id: 'grp2', name: 'Group 2', pfp: '' },
      ],
      activeInboxChannelId: '',
    });
    expect(entries.map((e) => e.id)).toEqual(['grp1', 'grp2', 'a']);
  });

  it('does not boost selected empty threads above truly active entries', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '', status: 'online' }],
      ['b', { id: 'b', name: 'B', pfp: '', status: 'online' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2026-01-01T00:00:00.000Z' }],
    };
    const entries = buildDmPanelInboxList({
      selfId: 'me',
      echoPeerByChannelId: new Map([['dm-a', 'a']]),
      messageKeys: ['dm-a'],
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: 'b',
      groups: [],
      activeInboxChannelId: 'dm-b',
    });
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('sorts by latest message time descending', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '' }],
      ['b', { id: 'b', name: 'B', pfp: '' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2020-01-01T00:00:00.000Z' }],
      'dm-b': [{ timestamp: '2021-01-01T00:00:00.000Z' }],
    };
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messageKeys: Object.keys(messages),
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: null,
    });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('falls back to server thread activity ids when messages are not loaded', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '' }],
      ['b', { id: 'b', name: 'B', pfp: '' }],
    ]);
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: new Map([
        ['100', 'a'],
        ['200', 'b'],
      ]),
      activityIdByChannelId: new Map([
        ['100', '1000'],
        ['200', '2000'],
      ]),
      messageKeys: [],
      getMessages: () => [],
      usersById: users,
      selectedDmUserId: null,
    });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('prefers server last-activity (snowflake) when a thread has no local messages yet', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '' }],
      ['b', { id: 'b', name: 'B', pfp: '' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2020-01-01T00:00:00.000Z' }],
    };
    const newerActivity = echoSnowflakeForMillis(Date.UTC(2026, 2, 1));
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: new Map([
        ['dm-a', 'a'],
        ['dm-b', 'b'],
      ]),
      activityIdByChannelId: new Map([
        ['dm-a', '1000'],
        ['dm-b', newerActivity],
      ]),
      messageKeys: Object.keys(messages),
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: null,
    });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('prefers loaded message timestamps over stale activity ids when both threads are loaded', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '' }],
      ['b', { id: 'b', name: 'B', pfp: '' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2026-01-02T00:00:00.000Z' }],
      'dm-b': [{ timestamp: '2026-01-01T00:00:00.000Z' }],
    };
    const rows = buildDmPanelUserList({
      selfId: 'me',
      echoPeerByChannelId: new Map([
        ['dm-a', 'a'],
        ['dm-b', 'b'],
      ]),
      activityIdByChannelId: new Map([
        ['dm-a', '1000'],
        ['dm-b', '2000'],
      ]),
      messageKeys: Object.keys(messages),
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: null,
    });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the inbox on real recency even when activity ids disagree with loaded timestamps', () => {
    const users = new Map([
      ['a', { id: 'a', name: 'A', pfp: '', status: 'online' }],
      ['b', { id: 'b', name: 'B', pfp: '', status: 'offline' }],
    ]);
    const messages: Record<string, { timestamp: string }[]> = {
      'dm-a': [{ timestamp: '2026-01-02T00:00:00.000Z' }],
      'dm-b': [{ timestamp: '2026-01-01T00:00:00.000Z' }],
    };
    const entries = buildDmPanelInboxList({
      selfId: 'me',
      echoPeerByChannelId: new Map([
        ['dm-a', 'a'],
        ['dm-b', 'b'],
      ]),
      activityIdByChannelId: new Map([
        ['dm-a', '1000'],
        ['dm-b', '2000'],
      ]),
      messageKeys: Object.keys(messages),
      getMessages: (ch) => messages[ch],
      usersById: users,
      selectedDmUserId: null,
      groups: [],
      activeInboxChannelId: '',
    });
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('getLatestDmPeerUserId', () => {
  it('returns peer with most recent message', () => {
    const id = getLatestDmPeerUserId({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messages: {
        'dm-x': [{ timestamp: '2020-01-01T00:00:00.000Z' }],
        'dm-y': [{ timestamp: '2022-01-01T00:00:00.000Z' }],
      },
      orderedOtherUserIds: ['x', 'y'],
    });
    expect(id).toBe('y');
  });

  it('falls back to first other user id when no dm messages', () => {
    const id = getLatestDmPeerUserId({
      selfId: 'me',
      echoPeerByChannelId: new Map(),
      messages: {},
      orderedOtherUserIds: ['me', 'first', 'second'],
    });
    expect(id).toBe('first');
  });
});
