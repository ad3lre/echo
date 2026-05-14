import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/composables/useChannels';
import { useAppLayoutEffectiveChannel } from './useAppLayoutEffectiveChannel';

const cat = {} as ChannelCategory;

describe('useAppLayoutEffectiveChannel', () => {
  it('prefers guild channel from tree', () => {
    const ch: ChannelSummary = {
      id: 'c1',
      name: 'general',
      type: 'text',
    };
    const { effectiveActiveChannel } = useAppLayoutEffectiveChannel({
      activeChannelId: ref('c1'),
      findChannelContextById: (id) =>
        id === 'c1' ? { channel: ch, category: cat } : null,
      selectedDMUserId: ref(null),
      echoDmPeerByChannelId: ref(new Map()),
      users: ref([]),
      echoDmThreadIds: ref(new Set()),
      groupDMs: ref({}),
    });
    expect(effectiveActiveChannel.value).toEqual(ch);
  });

  it('synthesizes DM row when thread id and partner selected', () => {
    const { effectiveActiveChannel } = useAppLayoutEffectiveChannel({
      activeChannelId: ref('dm-peer'),
      findChannelContextById: () => null,
      selectedDMUserId: ref('u1'),
      echoDmPeerByChannelId: ref(new Map()),
      users: ref([{ id: 'u1', name: 'Pat' }]),
      echoDmThreadIds: ref(new Set()),
      groupDMs: ref({}),
    });
    expect(effectiveActiveChannel.value).toMatchObject({
      id: 'dm-peer',
      name: 'Pat',
      type: 'text',
    });
  });

  it('uses group DM name when thread id is in echoDmThreadIds and groupDMs', () => {
    const gid = 'snowflake-group-ch';
    const { effectiveActiveChannel } = useAppLayoutEffectiveChannel({
      activeChannelId: ref(gid),
      findChannelContextById: () => null,
      selectedDMUserId: ref('u1'),
      echoDmPeerByChannelId: ref(new Map()),
      users: ref([{ id: 'u1', name: 'Pat' }]),
      echoDmThreadIds: ref(new Set([gid])),
      groupDMs: ref({
        [gid]: {
          id: gid,
          name: 'Weekend crew',
          memberIds: ['u1', 'u2'],
        },
      }),
    });
    expect(effectiveActiveChannel.value).toMatchObject({
      id: gid,
      name: 'Weekend crew',
      type: 'text',
    });
  });

  it('uses per-channel DM peer mapping before selected DM user id', () => {
    const cid = '100000000000000123';
    const { effectiveActiveChannel } = useAppLayoutEffectiveChannel({
      activeChannelId: ref(cid),
      findChannelContextById: () => null,
      selectedDMUserId: ref(null),
      echoDmPeerByChannelId: ref(new Map([[cid, 'u2']])),
      users: ref([{ id: 'u2', name: 'Nora' }]),
      echoDmThreadIds: ref(new Set([cid])),
      groupDMs: ref({}),
    });
    expect(effectiveActiveChannel.value).toMatchObject({
      id: cid,
      name: 'Nora',
      type: 'text',
    });
  });

  it('marks voice when active guild channel is voice', () => {
    const ch: ChannelSummary = {
      id: 'v1',
      name: 'Lobby',
      type: 'voice',
    };
    const { isViewingVoiceChannel } = useAppLayoutEffectiveChannel({
      activeChannelId: ref('v1'),
      findChannelContextById: (id) =>
        id === 'v1' ? { channel: ch, category: cat } : null,
      selectedDMUserId: ref(null),
      echoDmPeerByChannelId: ref(new Map()),
      users: ref([]),
      echoDmThreadIds: ref(new Set()),
      groupDMs: ref({}),
    });
    expect(isViewingVoiceChannel.value).toBe(true);
  });
});
