import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useAppLayoutVoiceContextExpose } from './useAppLayoutVoiceContextExpose';

describe('useAppLayoutVoiceContextExpose', () => {
  it('derives VC flags from liveKitState', () => {
    const liveKitState = ref<'idle' | 'connecting' | 'connected' | 'error'>(
      'idle',
    );
    const x = useAppLayoutVoiceContextExpose({
      liveKitState: computed(() => liveKitState.value),
      findChannelContextById: () => null,
      handleJoinVoiceNavigation: vi.fn(),
      handleLeaveVoiceNavigation: vi.fn(),
    });

    expect(x.isVcConnected.value).toBe(false);
    expect(x.isVcActive.value).toBe(false);

    liveKitState.value = 'connecting';
    expect(x.isVcConnecting.value).toBe(true);
    expect(x.isVcActive.value).toBe(true);

    liveKitState.value = 'connected';
    expect(x.isVcConnected.value).toBe(true);
  });

  it('joinVoiceChannel resolves name from findChannelContextById', () => {
    const handleJoinVoiceNavigation = vi.fn();
    const x = useAppLayoutVoiceContextExpose({
      liveKitState: computed(() => 'idle'),
      findChannelContextById: (id) =>
        id === 'c1' ? { channel: { name: 'General' } } : null,
      handleJoinVoiceNavigation,
      handleLeaveVoiceNavigation: vi.fn(),
    });

    x.joinVoiceChannel('c1');
    expect(handleJoinVoiceNavigation).toHaveBeenCalledWith({
      channelId: 'c1',
      channelName: 'General',
    });
  });
});
