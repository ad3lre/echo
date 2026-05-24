import { describe, expect, it } from 'vitest';
import { buildDmAttentionUnreadCountByChannel } from './buildDmAttentionUnreadCountByChannel';

describe('buildDmAttentionUnreadCountByChannel', () => {
  it('maps unread with explicit count', () => {
    const m = buildDmAttentionUnreadCountByChannel({
      a: { channelId: 'a', unread: true, unreadCount: 3 },
    });
    expect(m.get('a')).toBe(3);
  });

  it('defaults count to 1 when unread without count', () => {
    const m = buildDmAttentionUnreadCountByChannel({
      b: { channelId: 'b', unread: true },
    });
    expect(m.get('b')).toBe(1);
  });

  it('skips non-unread', () => {
    const m = buildDmAttentionUnreadCountByChannel({
      c: { channelId: 'c', unread: false, unreadCount: 9 },
    });
    expect(m.has('c')).toBe(false);
  });

  it('prefers local unread derived from read cursor over stale summary count', () => {
    const m = buildDmAttentionUnreadCountByChannel(
      {
        c: { channelId: 'c', unread: true, unreadCount: 999 },
      },
      {
        messagesByChannelId: {
          c: [
            { id: '100', authorId: 'u2', timestamp: '', content: '' },
            { id: '101', authorId: 'u2', timestamp: '', content: '' },
          ],
        },
        readStateByChannelId: { c: '101' },
        selfUserId: 'u1',
      },
    );
    expect(m.has('c')).toBe(false);
  });

  it('returns 0 when cursor is ahead of all locally loaded messages (not found by exact match)', () => {
    // Cursor points to latestUnreadMessageId (e.g. from attention summary) which
    // isn't in the local message window — previously this fell back to index 0
    // and counted all messages as unread.
    const m = buildDmAttentionUnreadCountByChannel(
      {
        c: { channelId: 'c', unread: true, unreadCount: 3 },
      },
      {
        messagesByChannelId: {
          c: [
            { id: '98', authorId: 'u2', timestamp: '', content: '' },
            { id: '99', authorId: 'u2', timestamp: '', content: '' },
            { id: '100', authorId: 'u2', timestamp: '', content: '' },
          ],
        },
        // Cursor is '200' — newer than every loaded message.
        readStateByChannelId: { c: '200' },
        selfUserId: 'u1',
      },
    );
    expect(m.has('c')).toBe(false);
  });

  it('counts unread from local messages when the thread is missing from attention', () => {
    const m = buildDmAttentionUnreadCountByChannel(
      {},
      {
        messagesByChannelId: {
          dmchan: [{ id: '10', authorId: 'peer', timestamp: '', content: '' }],
        },
        readStateByChannelId: {},
        selfUserId: 'me',
        isDmChannelId: (id) => id === 'dmchan',
      },
    );
    expect(m.get('dmchan')).toBe(1);
  });

  it('clears stale attention unread when local read cursor caught up', () => {
    const m = buildDmAttentionUnreadCountByChannel(
      {
        c: { channelId: 'c', unread: true, unreadCount: 4 },
      },
      {
        messagesByChannelId: {
          c: [{ id: '5', authorId: 'peer', timestamp: '', content: '' }],
        },
        readStateByChannelId: { c: '5' },
        selfUserId: 'me',
        isDmChannelId: (id) => id === 'c',
      },
    );
    expect(m.has('c')).toBe(false);
  });

  it('counts only messages newer than the cursor when cursor is not in local window', () => {
    const m = buildDmAttentionUnreadCountByChannel(
      {
        c: { channelId: 'c', unread: true, unreadCount: 5 },
      },
      {
        messagesByChannelId: {
          c: [
            { id: '100', authorId: 'u2', timestamp: '', content: '' },
            { id: '101', authorId: 'u2', timestamp: '', content: '' },
            { id: '102', authorId: 'u2', timestamp: '', content: '' },
          ],
        },
        // Cursor is between loaded messages but not an exact match for any id.
        readStateByChannelId: { c: '100' },
        selfUserId: 'u1',
      },
    );
    // id '100' is read (cursor == id), ids '101' and '102' are unread.
    expect(m.get('c')).toBe(2);
  });
});
