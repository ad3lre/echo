import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type {
  ChannelCategory,
  ChannelWithParticipants,
} from './useChannelPanelVoiceState';
import { useChannelPanelVoiceState } from './useChannelPanelVoiceState';

function voiceCh(
  id: string,
  voiceParticipantIds: string[],
): ChannelWithParticipants {
  return {
    id,
    name: id,
    type: 'voice',
    voiceParticipantIds,
  } as ChannelWithParticipants;
}

describe('useChannelPanelVoiceState', () => {
  it('removes self from non-current voice channels when snapshot lags on moves', () => {
    const categories = ref<ChannelCategory[]>([
      {
        id: 'cat1',
        name: 'Voice',
        channels: [
          voiceCh('vc-old', ['self', 'peer']),
          voiceCh('vc-new', ['peer']),
        ],
      },
    ]);

    const { effectiveCategories } = useChannelPanelVoiceState({
      categories,
      getCurrentVoiceChannelId: () => 'vc-new',
      getCurrentUserId: () => 'self',
      users: ref([
        { id: 'self', name: 'Self', pfp: '' },
        { id: 'peer', name: 'Peer', pfp: '' },
      ]),
      getVcMuted: () => false,
      getVcDeafened: () => false,
      getVcVideo: () => false,
      getVcScreenshare: () => false,
    });

    const chs = effectiveCategories.value[0]!.channels;
    expect((chs[0] as ChannelWithParticipants).voiceParticipantIds).toEqual([
      'peer',
    ]);
    expect((chs[1] as ChannelWithParticipants).voiceParticipantIds).toEqual([
      'peer',
      'self',
    ]);
  });

  it('returns the same categories reference when not in a voice channel', () => {
    const categories = ref<ChannelCategory[]>([
      {
        id: 'cat1',
        name: 'Voice',
        channels: [voiceCh('vc-a', ['self'])],
      },
    ]);
    const orig = categories.value;

    const { effectiveCategories } = useChannelPanelVoiceState({
      categories,
      getCurrentVoiceChannelId: () => '',
      getCurrentUserId: () => 'self',
      users: ref([{ id: 'self', name: 'Self', pfp: '' }]),
      getVcMuted: () => false,
      getVcDeafened: () => false,
      getVcVideo: () => false,
      getVcScreenshare: () => false,
    });

    expect(effectiveCategories.value).toBe(orig);
  });
});
