import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useDmAttentionUnreadMapForPanelComputed } from './useDmAttentionUnreadMapForPanelComputed';

describe('useDmAttentionUnreadMapForPanelComputed', () => {
  it('maps attention snapshot to unread counts', () => {
    const dm = ref({
      c1: {
        channelId: 'c1',
        unread: true,
        unreadCount: 3,
      },
    });
    const c = useDmAttentionUnreadMapForPanelComputed({
      dmAttentionByChannelId: dm,
      messagesByChannelId: ref({}),
      readStateByChannelId: ref({}),
      selfUserId: ref('me'),
    });
    expect(c.value.get('c1')).toBe(3);
  });

  it('uses local read cursor + messages to clear stale unread', () => {
    const dm = ref({
      c1: {
        channelId: 'c1',
        unread: true,
        unreadCount: 99,
      },
    });
    const c = useDmAttentionUnreadMapForPanelComputed({
      dmAttentionByChannelId: dm,
      messagesByChannelId: ref({
        c1: [
          { id: '10', authorId: 'peer', timestamp: '', content: '' },
          { id: '11', authorId: 'peer', timestamp: '', content: '' },
        ],
      }),
      readStateByChannelId: ref({ c1: '11' }),
      selfUserId: ref('me'),
    });
    expect(c.value.has('c1')).toBe(false);
  });
});
