import { buildRemoteParticipantTrackInfoFromPublications } from '@/services/livekit/livekitRemoteParticipantTrackInfo';
import type {
  LiveKitVoiceRoomApi,
  UseLiveKitVoiceRoomOptions,
} from '@/composables/livekitVoiceRoom.types';
import { createLiveKitVoiceSession } from '@/composables/livekitVoiceRoom/createLiveKitVoiceSession';

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
} from '@/composables/livekitVoiceRoom.types';

export { buildRemoteParticipantTrackInfoFromPublications };

export function useLiveKitVoiceRoom(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  return createLiveKitVoiceSession(opts);
}
