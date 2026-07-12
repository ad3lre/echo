import type { ComputedRef, Ref, ShallowRef } from 'vue';
import type {
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room as LKRoom,
} from 'livekit-client';
import type { useAudioLevelMonitor } from '@/composables/useAudioLevelMonitor';
import type {
  DesktopStreamingPreferences,
  LiveKitNetworkStats,
  LiveKitRoomState,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
  UseLiveKitVoiceRoomOptions,
  VideoQualityPreset,
} from '@/composables/livekitVoiceRoom.types';
import type { EchoMlsKeyProvider } from '@/services/voice/mls/echoMlsKeyProvider';
import type { VoiceDataReceiveHandlers } from '@/services/livekit/livekitVoiceDataChannel';
import { buildRemoteParticipantTrackInfoFromPublications } from '@/services/livekit/livekitRemoteParticipantTrackInfo';
import type {
  PublicationLike,
  TrackLike,
} from '@/services/livekit/livekitTrackDuckTypes';

/** Cross-module callbacks populated after all controllers are created. */
export type LiveKitVoiceSessionActions = {
  applyLocalMicGain: (room: LKRoom) => void;
  attachMicSendProcessorIfNeeded: (room: LKRoom) => Promise<void>;
  refreshLocalMicLevelMonitor: (room: LKRoom | null) => void;
  reapplyRemotePlaybackGains: (room: LKRoom) => void;
  applyRemoteOutputGainToTrack: (
    track: object,
    participantIdentity: string,
  ) => void;
  applyRemoteOutputGainToRoom: (room: LKRoom) => void;
  syncRemoteParticipants: (room: LKRoom) => void;
  setupActiveSpeakerTracking: (room: LKRoom) => void;
  teardownSpeakerTracking: () => void;
  startStatsPolling: () => void;
  stopStatsPolling: () => void;
  stopAudioHealthPolling: () => void;
  dumpRemoteAudioTrackState: (
    room: LKRoom,
    label: string,
  ) => Record<string, unknown>[];
  dumpLiveKitDomAudioElements: () => void;
  startAudioHealthPolling: (room: LKRoom) => void;
  clearLocalVoiceUiState: () => void;
  teardownRoomSession: (reason: unknown, setError: boolean) => void;
  muteRemoteParticipantsForDeafen: (room: LKRoom) => Promise<void>;
  unmuteRemoteParticipantsAfterDeafen: (room: LKRoom) => Promise<void>;
  onParticipantConnectedWhileDeafened: (p: RemoteParticipant) => void;
  runApplyVcAudioState: (opts: {
    muted: boolean;
    deafened: boolean;
  }) => Promise<void>;
  recoverVoiceMediaSession: (opts: {
    muted: boolean;
    deafened: boolean;
  }) => Promise<void>;
  announceLocalVcPublic: (
    room: LKRoom,
    kind: import('@/audio/voiceEchoLiveKitData').EchoVcDataV1['kind'],
  ) => void;
  notifyStreamerViewerLeftStream: (
    room: LKRoom,
    streamerIdentity: string,
  ) => void;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  getUserWantsLocalCamera: () => boolean;
  disconnect: () => void;
  installMlsSenderKeyForParticipant: (identity: string) => Promise<void>;
};

export type LiveKitVoiceSessionContext = {
  opts: UseLiveKitVoiceRoomOptions;
  dataHandlers: VoiceDataReceiveHandlers;
  roomState: Ref<LiveKitRoomState>;
  lkRoom: ShallowRef<LKRoom | null>;
  networkStats: Ref<LiveKitNetworkStats | null>;
  lastOutputVolumePercent: Ref<number>;
  lastInputVolumePercent: Ref<number>;
  remoteParticipantOutputVolume: ShallowRef<Map<string, number>>;
  isCameraEnabled: Ref<boolean>;
  isScreenShareEnabled: Ref<boolean>;
  selectedCameraDeviceId: Ref<string>;
  videoQuality: Ref<VideoQualityPreset>;
  desktopStreamingPreferences: Ref<DesktopStreamingPreferences>;
  speakingMap: Ref<Record<string, ParticipantAudioLevel>>;
  localSpeaking: Ref<boolean>;
  localAudioLevel: Ref<number>;
  localMicMonitor: ReturnType<typeof useAudioLevelMonitor>;
  remoteParticipantsVersion: Ref<number>;
  _remoteParticipants: ShallowRef<Map<string, RemoteParticipantTrackInfo>>;
  remoteParticipants: ComputedRef<Map<string, RemoteParticipantTrackInfo>>;
  vcDeafenedInternal: Ref<boolean>;
  krispSessionFailed: Ref<boolean>;
  viewerLeaveSoundAt: Map<string, number>;
  connectInFlight: Ref<boolean>;
  connectGeneration: Ref<number>;
  connectAbortTarget: ShallowRef<LKRoom | null>;
  liveKitE2eeWorker: ShallowRef<Worker | null>;
  liveKitMlsKeyProvider: ShallowRef<EchoMlsKeyProvider | null>;
  applyVcAudioQueued: Ref<Promise<void>>;
  lastVcAudioOpts: Ref<{ muted: boolean; deafened: boolean }>;
  krispAsyncRejectionCleanup: Ref<(() => void) | null>;
  tabCleanup: Ref<(() => void) | null>;
  mediaRecoveryCleanup: Ref<(() => void) | null>;
  activeSpeakerCleanup: Ref<(() => void) | null>;
  syncSpeakingLevelsFromRoom: Ref<(() => void) | null>;
  audioHealthInterval: Ref<ReturnType<typeof setInterval> | null>;
  micAttachDiagLogs: Ref<number>;
  micGainDiagLogs: Ref<number>;
  micGainZeroLogs: Ref<number>;
  actions: LiveKitVoiceSessionActions;
};

export function isRemoteVideoTrackActive(
  track: RemoteTrack | TrackLike | null | undefined,
): boolean {
  if (!track) return false;
  const mst = (track as TrackLike).mediaStreamTrack;
  if (!mst) return true;
  return mst.readyState !== 'ended';
}

export function rebuildRemoteParticipant(
  p: RemoteParticipant,
): RemoteParticipantTrackInfo {
  return buildRemoteParticipantTrackInfoFromPublications(
    p.trackPublications.values() as Iterable<
      RemoteTrackPublication & PublicationLike
    >,
  );
}
