import { buildRemoteParticipantTrackInfoFromPublications } from '@/features/voice/livekit/livekitRemoteParticipantTrackInfo';
import type {
  LiveKitVoiceRoomApi,
  UseLiveKitVoiceRoomOptions,
} from '@/features/voice/livekitVoiceRoom.types';
import { createDeferredLiveKitVoiceRoom } from '@/features/voice/livekit/createDeferredLiveKitVoiceRoom';

export type {
  DesktopStreamingControlMode,
  DesktopStreamingPreferences,
  EchoVoiceE2eeConnectInput,
  LiveKitVoiceConnectOptions,
  LiveKitVoiceInitialAudioState,
  LiveKitNetworkStats,
  LiveKitRoomState,
  LiveKitVoiceRoomApi,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
  UseLiveKitVoiceRoomOptions,
  VideoQualityPreset,
} from '@/features/voice/livekitVoiceRoom.types';

export { buildRemoteParticipantTrackInfoFromPublications };

/**
 * Voice room API for the shell. LiveKit itself loads lazily on first connect
 * (see `createDeferredLiveKitVoiceRoom`) so AppLayout does not sync-import
 * `livekit-client` on cold boot.
 */
export function useLiveKitVoiceRoom(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  return createDeferredLiveKitVoiceRoom(opts);
}
