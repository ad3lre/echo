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

/** @deprecated MLS path — no-op retained so socket wiring compiles during cutover. */
export function createAppLayoutVoiceMlsMessageHandler(_deps: {
  currentVoiceChannelId: Ref<string | null | undefined>;
  dmLiveKitJoinChannelId: Ref<string | null | undefined>;
  getLiveKitVoiceApi: () => LiveKitVoiceRoomApi | null | undefined;
}): (payload: EchoWorkspaceEvent) => void {
  return () => {
    /* MLS delivery removed — use voice_media_key */
  };
}

export function createAppLayoutVoiceMediaKeyHandler(deps: {
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
    const senderUserId = payload.voiceMediaKey?.senderUserId?.trim();
    void (async () => {
      try {
        const { pullVoiceMediaKeyInbox } =
          await import('@/features/voice/voiceE2eePrepare');
        const pulled = await pullVoiceMediaKeyInbox(
          senderUserId ? { senderUserId } : undefined,
        );
        if (pulled && pulled.senderKeys.size > 0) {
          await deps.getLiveKitVoiceApi()?.rotateEpochKey({
            raw: pulled.senderKeys.values().next().value as ArrayBuffer,
            keyIndex: pulled.keyIndex,
            senderKeys: pulled.senderKeys,
          });
        }
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:media_key_sync_failed', {
          channelId: cid,
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
