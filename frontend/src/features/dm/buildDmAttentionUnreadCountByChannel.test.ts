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
    expect(m.get('c')).toBe(0);
  });
});
