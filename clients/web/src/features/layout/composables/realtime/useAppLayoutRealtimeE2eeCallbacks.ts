import type { Ref } from 'vue';
import type { EchoWorkspaceEvent } from '@shared/types';
import type { LiveKitVoiceRoomApi } from '@/features/voice/livekitVoiceRoom.types';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { voiceClientDiag } from '@/observability/voiceClientTrace';

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
        // Clear so the DM LiveKit join watch treats this as a fresh connect
        // (rejoinDmCallVoice alone only restores UI signal state).
        deps.dmLiveKitJoinChannelId.value = null;
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
          await deps.getLiveKitVoiceApi()?.rotateEpochKey(applied);
        }
        const reconciled = await reconcileVoiceMlsSession(key);
        if (reconciled) {
          await deps.getLiveKitVoiceApi()?.rotateEpochKey(reconciled);
        }
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:mls_sync_failed', {
          channelKey: key,
          err: e instanceof Error ? e.message : String(e),
        });
        dispatchAppToast(
          'Call encryption sync slipped. Audio may briefly drop until it recovers.',
          'warning',
        );
      }
    })();
  };
}
