import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { useAppLayoutVoiceChannelForParticipantsComputed } from './useAppLayoutVoiceChannelForParticipantsComputed';

const textCh: ChannelSummary = { id: 't', name: 't', type: 'text' };
const voiceCh: ChannelSummary = { id: 'v', name: 'v', type: 'voice' };

describe('useAppLayoutVoiceChannelForParticipantsComputed', () => {
  it('updates when voice id or effective channel changes', () => {
    const currentVoiceChannelId = ref<string | null>(null);
    const effectiveActiveChannel = ref<ChannelSummary | null>(textCh);

    const resolved = useAppLayoutVoiceChannelForParticipantsComputed({
      currentVoiceChannelId,
      findChannelContextById: (id) =>
        id === 'v' ? { channel: voiceCh } : null,
      effectiveActiveChannel: computed(() => effectiveActiveChannel.value),
    });

    expect(resolved.value).toBeNull();

    effectiveActiveChannel.value = voiceCh;
    expect(resolved.value).toEqual(voiceCh);

    effectiveActiveChannel.value = textCh;
    currentVoiceChannelId.value = 'v';
    expect(resolved.value).toEqual(voiceCh);
  });

  it('trims voice channel id before lookup', () => {
    const currentVoiceChannelId = ref<string | null>('  v  ');
    const effectiveActiveChannel = ref<ChannelSummary | null>(textCh);

    const resolved = useAppLayoutVoiceChannelForParticipantsComputed({
      currentVoiceChannelId,
      findChannelContextById: (id) =>
        id === 'v' ? { channel: voiceCh } : null,
      effectiveActiveChannel: computed(() => effectiveActiveChannel.value),
    });

    expect(resolved.value).toEqual(voiceCh);
  });
});
