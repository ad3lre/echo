import type { Ref } from 'vue';
import type { EchoWorkspaceEvent } from '@shared/types';
import type { LiveKitVoiceRoomApi } from '@/composables/livekitVoiceRoom.types';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function createAppLayoutVoiceE2eeEpochSupersededHandler(deps: {
  currentVoiceChannelId: Ref<string | null | undefined>;
  dmLiveKitJoinChannelId: Ref<string | null | undefined>;
  getLiveKitVoiceApi: () => LiveKitVoiceRoomApi | null | undefined;
  rejoinDmCallVoice: () => void;
  reconnectGuildVoiceAfterE2eeRotation: () => Promise<void>;
}): (payload: EchoWorkspaceEvent) => void {
  return (payload) => {
    const cid = payload.voiceChannelId?.trim();
    if (!cid) return;
    const guildVc = deps.currentVoiceChannelId.value?.trim();
    const dmVc = deps.dmLiveKitJoinChannelId.value?.trim();
    if (guildVc !== cid && dmVc !== cid) return;
    void (async () => {
      await deps.getLiveKitVoiceApi()?.disconnect();
      if (dmVc === cid) {
        deps.rejoinDmCallVoice();
        return;
      }
      if (guildVc === cid) {
        try {
          await deps.reconnectGuildVoiceAfterE2eeRotation();
        } catch {
          dispatchAppToast(
            'Call encryption was rotated but reconnect failed. Rejoin voice manually.',
            'warning',
          );
        }
      }
    })();
  };
}

export function createAppLayoutVoiceMlsMessageHandler(deps: {
  currentVoiceChannelId: Ref<string | null | undefined>;
  dmLiveKitJoinChannelId: Ref<string | null | undefined>;
  getLiveKitVoiceApi: () => LiveKitVoiceRoomApi | null | undefined;
}): (payload: EchoWorkspaceEvent) => void {
  return (payload) => {
    const cid = payload.voiceChannelId?.trim();
    if (!cid) return;
    const guildVc = deps.currentVoiceChannelId.value?.trim();
    const dmVc = deps.dmLiveKitJoinChannelId.value?.trim();
    if (guildVc !== cid && dmVc !== cid) return;
    void (async () => {
      const {
        activeVoiceMlsChannelKey,
        reconcileVoiceMlsSession,
        syncVoiceMlsSession,
      } = await import('@/services/voice/mls/voiceMlsSession');
      const key = activeVoiceMlsChannelKey();
      if (!key) return;
      try {
        const applied = await syncVoiceMlsSession(key);
        if (applied) {
          await deps
            .getLiveKitVoiceApi()
            ?.rotateEpochKey(applied.raw, applied.keyIndex);
        }
        const reconciled = await reconcileVoiceMlsSession(key);
        if (reconciled) {
          await deps
            .getLiveKitVoiceApi()
            ?.rotateEpochKey(reconciled.raw, reconciled.keyIndex);
        }
      } catch {
        /* transient; next event or reconnect recovers */
      }
    })();
  };
}
