import { computed, onUnmounted, ref, shallowRef } from 'vue';
import {
  createVoiceDataPublishers,
  voiceDataHandlersFromOpts,
} from '@/services/livekit/livekitVoiceDataChannel';
import {
  loadDesktopStreamingPreferences,
  loadRemoteParticipantVolumeOverrides,
} from '@/services/livekit/livekitVoiceRoomHelpers';
import { useAudioLevelMonitor } from '@/composables/useAudioLevelMonitor';
import type {
  LiveKitNetworkStats,
  LiveKitRoomState,
  LiveKitVoiceRoomApi,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
  UseLiveKitVoiceRoomOptions,
  VideoQualityPreset,
} from '@/composables/livekitVoiceRoom.types';
import type { Room as LKRoom } from 'livekit-client';
import type {
  LiveKitVoiceSessionActions,
  LiveKitVoiceSessionContext,
} from '@/composables/livekitVoiceRoom/context';
import { createConnectController } from '@/composables/livekitVoiceRoom/connect';
import { createRemoteVolumeController } from '@/composables/livekitVoiceRoom/remoteVolume';
import {
  createMicSendController,
  installMicGainWatch,
} from '@/composables/livekitVoiceRoom/micSend';
import {
  createSpeakingController,
  installSpeakingWatches,
} from '@/composables/livekitVoiceRoom/speaking';
import { createNetworkStatsController } from '@/composables/livekitVoiceRoom/networkStats';
import { createMediaControls } from '@/composables/livekitVoiceRoom/mediaControls';
import { createRoomEventsController } from '@/composables/livekitVoiceRoom/roomEvents';
import {
  createSessionController,
  type ConnectLifecycleOps,
} from '@/composables/livekitVoiceRoom/session';
import { createVcAnnouncements } from '@/composables/livekitVoiceRoom/vcAnnouncements';

export function createLiveKitVoiceSession(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  const options = opts ?? {};
  const getUserWantsLocalCamera =
    options.getUserWantsLocalCamera ?? (() => true);

  const actions = {} as LiveKitVoiceSessionActions;
  const viewerLeaveSoundAt = new Map<string, number>();

  const roomState = ref<LiveKitRoomState>('idle');
  const lkRoom = shallowRef<LKRoom | null>(null);
  const networkStats = ref<LiveKitNetworkStats | null>(null);
  const lastOutputVolumePercent = ref(100);
  const lastInputVolumePercent = ref(100);
  const remoteParticipantOutputVolume = shallowRef(
    loadRemoteParticipantVolumeOverrides(),
  );
  const isCameraEnabled = ref(false);
  const isScreenShareEnabled = ref(false);
  const selectedCameraDeviceId = ref('');
  const videoQuality = ref<VideoQualityPreset>('720p');
  const desktopStreamingPreferences = ref(loadDesktopStreamingPreferences());
  const speakingMap = ref<Record<string, ParticipantAudioLevel>>({});
  const localSpeaking = ref(false);
  const localAudioLevel = ref(0);
  const localMicMonitor = useAudioLevelMonitor();

  const remoteParticipantsVersion = ref(0);
  const _remoteParticipants = shallowRef<
    Map<string, RemoteParticipantTrackInfo>
  >(new Map());
  const remoteParticipants = computed(() => {
    void remoteParticipantsVersion.value;
    return _remoteParticipants.value;
  });

  const ctx: LiveKitVoiceSessionContext = {
    opts: options,
    dataHandlers: voiceDataHandlersFromOpts(options),
    roomState,
    lkRoom,
    networkStats,
    lastOutputVolumePercent,
    lastInputVolumePercent,
    remoteParticipantOutputVolume,
    isCameraEnabled,
    isScreenShareEnabled,
    selectedCameraDeviceId,
    videoQuality,
    desktopStreamingPreferences,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    localMicMonitor,
    remoteParticipantsVersion,
    _remoteParticipants,
    remoteParticipants,
    vcDeafenedInternal: ref(false),
    krispSessionFailed: ref(false),
    viewerLeaveSoundAt,
    connectInFlight: ref(false),
    connectGeneration: ref(0),
    connectAbortTarget: shallowRef<LKRoom | null>(null),
    liveKitE2eeWorker: shallowRef<Worker | null>(null),
    liveKitMlsKeyProvider: shallowRef(null),
    applyVcAudioQueued: ref(Promise.resolve()),
    lastVcAudioOpts: ref({ muted: false, deafened: false }),
    krispAsyncRejectionCleanup: ref<(() => void) | null>(null),
    tabCleanup: ref<(() => void) | null>(null),
    mediaRecoveryCleanup: ref<(() => void) | null>(null),
    activeSpeakerCleanup: ref<(() => void) | null>(null),
    syncSpeakingLevelsFromRoom: ref<(() => void) | null>(null),
    audioHealthInterval: ref<ReturnType<typeof setInterval> | null>(null),
    micAttachDiagLogs: ref(0),
    micGainDiagLogs: ref(0),
    micGainZeroLogs: ref(0),
    actions,
  };

  const connectLifecycle = {} as ConnectLifecycleOps;
  const session = createSessionController(ctx, connectLifecycle);
  const remoteVolume = createRemoteVolumeController(ctx);
  const speaking = createSpeakingController(ctx);
  const networkStatsCtrl = createNetworkStatsController(ctx);
  const micSend = createMicSendController(ctx);
  const vcAnnouncements = createVcAnnouncements();
  const roomEvents = createRoomEventsController(ctx);
  const connect = createConnectController(
    ctx,
    roomEvents.attachRoomEventHandlers,
    {
      muteRemoteParticipantsForDeafen: session.muteRemoteParticipantsForDeafen,
      syncRemoteParticipants: session.syncRemoteParticipants,
      clearLocalVoiceUiState: session.clearLocalVoiceUiState,
      registerTabCleanup: session.registerTabCleanup,
      registerMediaRecovery: session.registerMediaRecovery,
    },
  );
  const media = createMediaControls(ctx);

  Object.assign(connectLifecycle, {
    abortConnectInProgress: connect.abortConnectInProgress,
    releaseLiveKitE2eeWorker: connect.releaseLiveKitE2eeWorker,
  });

  Object.assign(actions, {
    applyLocalMicGain: micSend.applyLocalMicGain,
    attachMicSendProcessorIfNeeded: micSend.attachMicSendProcessorIfNeeded,
    refreshLocalMicLevelMonitor: speaking.refreshLocalMicLevelMonitor,
    reapplyRemotePlaybackGains: remoteVolume.reapplyRemotePlaybackGains,
    applyRemoteOutputGainToTrack: remoteVolume.applyRemoteOutputGainToTrack,
    applyRemoteOutputGainToRoom: remoteVolume.applyRemoteOutputGainToRoom,
    syncRemoteParticipants: session.syncRemoteParticipants,
    setupActiveSpeakerTracking: speaking.setupActiveSpeakerTracking,
    teardownSpeakerTracking: speaking.teardownSpeakerTracking,
    startStatsPolling: networkStatsCtrl.startStatsPolling,
    stopStatsPolling: networkStatsCtrl.stopStatsPolling,
    stopAudioHealthPolling: speaking.stopAudioHealthPolling,
    dumpRemoteAudioTrackState: speaking.dumpRemoteAudioTrackState,
    dumpLiveKitDomAudioElements: speaking.dumpLiveKitDomAudioElements,
    startAudioHealthPolling: speaking.startAudioHealthPolling,
    clearLocalVoiceUiState: session.clearLocalVoiceUiState,
    teardownRoomSession: session.teardownRoomSession,
    muteRemoteParticipantsForDeafen: session.muteRemoteParticipantsForDeafen,
    unmuteRemoteParticipantsAfterDeafen:
      session.unmuteRemoteParticipantsAfterDeafen,
    onParticipantConnectedWhileDeafened:
      session.onParticipantConnectedWhileDeafened,
    runApplyVcAudioState: session.runApplyVcAudioState,
    recoverVoiceMediaSession: session.recoverVoiceMediaSession,
    announceLocalVcPublic: vcAnnouncements.announceLocalVcPublic,
    notifyStreamerViewerLeftStream:
      vcAnnouncements.notifyStreamerViewerLeftStream,
    setCameraEnabled: media.setCameraEnabled,
    getUserWantsLocalCamera,
    disconnect: session.disconnect,
  });

  installSpeakingWatches(ctx);
  installMicGainWatch(ctx, micSend.applyLocalMicGain);

  onUnmounted(() => {
    session.disconnect();
  });

  const dataPublishers = createVoiceDataPublishers(() => lkRoom.value);

  return {
    roomState,
    lkRoom,
    networkStats,
    connect: connect.connect,
    disconnect: session.disconnect,
    rotateEpochKey: connect.rotateEpochKey,
    applyVcAudioState: session.applyVcAudioState,
    isCameraEnabled,
    isScreenShareEnabled,
    selectedCameraDeviceId,
    videoQuality,
    remoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    setCameraEnabled: media.setCameraEnabled,
    setScreenShareEnabled: media.setScreenShareEnabled,
    startScreenShare: media.startScreenShare,
    stopScreenShare: media.stopScreenShare,
    getLocalScreenTrack: media.getLocalScreenTrack,
    getLocalCameraTrack: media.getLocalCameraTrack,
    switchCamera: media.switchCamera,
    setVideoQuality: media.setVideoQuality,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences: media.setDesktopStreamingPreferences,
    startDesktopScreenShare: media.startDesktopScreenShare,
    startDesktopCameraStream: media.startDesktopCameraStream,
    switchMicDevice: media.switchMicDevice,
    switchSpeakerDevice: media.switchSpeakerDevice,
    setOutputVolume: media.setOutputVolume,
    setLocalInputVolume: media.setLocalInputVolume,
    getRemoteParticipantVolume: remoteVolume.getRemoteParticipantVolume,
    setRemoteParticipantVolume: remoteVolume.setRemoteParticipantVolume,
    reapplyVoiceProcessing: micSend.reapplyVoiceProcessing,
    recoverVoiceMediaSession: session.recoverVoiceMediaSession,
    ...dataPublishers,
  };
}
