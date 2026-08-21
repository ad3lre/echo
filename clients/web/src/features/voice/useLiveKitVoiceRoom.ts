import { buildRemoteParticipantTrackInfoFromPublications } from '@/features/voice/livekit/livekitRemoteParticipantTrackInfo';
import type {
  LiveKitVoiceRoomApi,
  UseLiveKitVoiceRoomOptions,
} from '@/features/voice/livekitVoiceRoom.types';
import { createLiveKitVoiceSession } from '@/features/voice/livekit/createLiveKitVoiceSession';

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

export function useLiveKitVoiceRoom(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  return createLiveKitVoiceSession(opts);
}
