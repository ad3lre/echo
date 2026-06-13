import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import { buildRemoteParticipantTrackInfoFromPublications } from '@/services/livekit/livekitRemoteParticipantTrackInfo';
import { createVoiceDataPublishers } from '@/services/livekit/livekitVoiceDataChannel';
import {
  loadDesktopStreamingPreferences,
  loadRemoteParticipantVolumeOverrides,
} from '@/services/livekit/livekitVoiceRoomHelpers';
import { useAudioLevelMonitor } from '@/composables/useAudioLevelMonitor';
import {
  indicatorRmsFromGatePercent,
  mergeSpeakingMapIfChanged,
} from '@/composables/voiceGate';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
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
import { createRemoteVolumeController } from '@/composables/livekitVoiceRoom/remoteVolume';
import { createMicSendController } from '@/composables/livekitVoiceRoom/micSend';
import { createSpeakingController } from '@/composables/livekitVoiceRoom/speaking';
import { createNetworkStatsController } from '@/composables/livekitVoiceRoom/networkStats';
import { createMediaControls } from '@/composables/livekitVoiceRoom/mediaControls';
import { createRoomEventsController } from '@/composables/livekitVoiceRoom/roomEvents';
import { createSessionController } from '@/composables/livekitVoiceRoom/session';

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
  const options = opts ?? {};
  const getUserWantsLocalCamera =
    options.getUserWantsLocalCamera ?? (() => true);

  const dataHandlers = {
    onYoutubeActivity: options.onYoutubeActivity,
    onHangmanActivity: options.onHangmanActivity,
    onHangmanGuessIntent: options.onHangmanGuessIntent,
    onHangmanNextRound: options.onHangmanNextRound,
    onHangmanRoundSecret: options.onHangmanRoundSecret,
    onCodenamesActivity: options.onCodenamesActivity,
    onCodenamesSpymasterKey: options.onCodenamesSpymasterKey,
    onCodenamesKeyToOrchestrator: options.onCodenamesKeyToOrchestrator,
    onCodenamesClueIntent: options.onCodenamesClueIntent,
    onCodenamesRevealIntent: options.onCodenamesRevealIntent,
    onCodenamesEndTurnIntent: options.onCodenamesEndTurnIntent,
    onCodenamesSetupIntent: options.onCodenamesSetupIntent,
    onCodenamesDealIntent: options.onCodenamesDealIntent,
    onCodenamesNewGameIntent: options.onCodenamesNewGameIntent,
    onSkrigglesActivity: options.onSkrigglesActivity,
    onSkrigglesGuessIntent: options.onSkrigglesGuessIntent,
    onSkrigglesWordChoiceIntent: options.onSkrigglesWordChoiceIntent,
    onSkrigglesSettingsIntent: options.onSkrigglesSettingsIntent,
    onSkrigglesStartIntent: options.onSkrigglesStartIntent,
    onSkrigglesNextRoundIntent: options.onSkrigglesNextRoundIntent,
    onSkrigglesRoundSecret: options.onSkrigglesRoundSecret,
    onSkrigglesStrokeBatch: options.onSkrigglesStrokeBatch,
    onSkrigglesCanvasCmd: options.onSkrigglesCanvasCmd,
    onSkrigglesCanvasSnapshot: options.onSkrigglesCanvasSnapshot,
    onVcActivityPresence: options.onVcActivityPresence,
  };

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
  const voiceLevels = useVoiceLevelsStore();

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
    dataHandlers,
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
    connectInFlight: { value: false },
    connectGeneration: { value: 0 },
    connectAbortTarget: { value: null },
    liveKitE2eeWorker: { value: null },
    liveKitMlsKeyProvider: { value: null },
    applyVcAudioQueued: { value: Promise.resolve() },
    lastVcAudioOpts: { value: { muted: false, deafened: false } },
    krispAsyncRejectionCleanup: { value: null },
    tabCleanup: { value: null },
    mediaRecoveryCleanup: { value: null },
    activeSpeakerCleanup: { value: null },
    syncSpeakingLevelsFromRoom: { value: null },
    audioHealthInterval: { value: null },
    micAttachDiagLogs: { value: 0 },
    micGainDiagLogs: { value: 0 },
    micGainZeroLogs: { value: 0 },
    actions,
  };

  const remoteVolume = createRemoteVolumeController(ctx);
  const speaking = createSpeakingController(ctx);
  const networkStatsCtrl = createNetworkStatsController(ctx);
  const micSend = createMicSendController(ctx);
  const roomEvents = createRoomEventsController(ctx);
  const session = createSessionController(
    ctx,
    roomEvents.attachRoomEventHandlers,
  );
  const media = createMediaControls(ctx);

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
    announceLocalVcPublic: session.announceLocalVcPublic,
    notifyStreamerViewerLeftStream: session.notifyStreamerViewerLeftStream,
    setCameraEnabled: media.setCameraEnabled,
    getUserWantsLocalCamera,
    disconnect: session.disconnect,
  });

  watch(
    () => voiceLevels.voiceActivationThresholdPercent,
    (pct) => {
      localMicMonitor.setSpeakingThreshold(indicatorRmsFromGatePercent(pct));
    },
    { immediate: true },
  );
  watch(
    () =>
      [localMicMonitor.level.value, localMicMonitor.speaking.value] as const,
    ([lvl, spk]) => {
      localAudioLevel.value = lvl;
      localSpeaking.value = spk;
      const room = lkRoom.value;
      if (room && roomState.value === 'connected') {
        const localId = room.localParticipant.identity;
        const next = {
          ...speakingMap.value,
          [localId]: { level: lvl, speaking: spk },
        };
        speakingMap.value = mergeSpeakingMapIfChanged(speakingMap.value, next);
      }
    },
  );
  watch(
    () =>
      [
        localMicMonitor.dbfs.value,
        voiceLevels.voiceActivationThresholdPercent,
        voiceLevels.outboundGateMode,
        roomState.value,
      ] as const,
    () => {
      const room = lkRoom.value;
      if (!room || roomState.value !== 'connected') return;
      micSend.applyLocalMicGain(room);
    },
  );

  onUnmounted(() => {
    session.disconnect();
  });

  const dataPublishers = createVoiceDataPublishers(() => lkRoom.value);

  return {
    roomState,
    lkRoom,
    networkStats,
    connect: session.connect,
    disconnect: session.disconnect,
    rotateEpochKey: session.rotateEpochKey,
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
