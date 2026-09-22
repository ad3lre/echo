import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createAppLayoutVoiceE2eeEpochSupersededHandler } from './useAppLayoutRealtimeE2eeCallbacks';

describe('createAppLayoutVoiceE2eeEpochSupersededHandler', () => {
  it('clears DM join tracking before rejoin so LiveKit reconnects', async () => {
    const disconnect = vi.fn(async () => {});
    const rejoinDmCallVoice = vi.fn();
    const dmLiveKitJoinChannelId = ref<string | null>('dm-channel-1');
    const handler = createAppLayoutVoiceE2eeEpochSupersededHandler({
      currentVoiceChannelId: ref(null),
      dmLiveKitJoinChannelId,
      getLiveKitVoiceApi: () => ({ disconnect }) as never,
      rejoinDmCallVoice,
      reconnectGuildVoiceAfterE2eeRotation: vi.fn(async () => {}),
    });

    handler({
      kind: 'voice_e2ee_epoch_superseded',
      voiceChannelId: 'dm-channel-1',
    } as never);

    await vi.waitFor(() => {
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(dmLiveKitJoinChannelId.value).toBeNull();
      expect(rejoinDmCallVoice).toHaveBeenCalledTimes(1);
    });
  });
});
