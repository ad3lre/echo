/**
 * LiveKit session facade that keeps `livekit-client` off the AppLayout sync
 * graph. Controllers load on first `connect()` (and optionally via idle prefetch).
 */
import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type WatchStopHandle,
} from 'vue';
import type {
  EchoMlsEpochKeyInput,
  EchoVoiceE2eeConnectInput,
  LiveKitNetworkStats,
  LiveKitRoomState,
  LiveKitVoiceConnectOptions,
  LiveKitVoiceRoomApi,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
  UseLiveKitVoiceRoomOptions,
  VideoQualityPreset,
} from '@/features/voice/livekitVoiceRoom.types';
import {
  loadDesktopStreamingPreferences,
  loadRemoteParticipantVolumeOverrides,
  persistRemoteParticipantVolumeOverrides,
  sanitizeRemoteParticipantVolumePercent,
} from '@/features/voice/livekit/livekitVoiceRoomHelpers';

const IDLE_PREFETCH_MS = 6_000;

function noopPublish(): void {
  /* Room not loaded yet — data-channel publishes are no-ops until connect. */
}

export function createDeferredLiveKitVoiceRoom(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  const roomState = ref<LiveKitRoomState>('idle');
  const lkRoom = shallowRef<LiveKitVoiceRoomApi['lkRoom']['value']>(null);
  const networkStats = ref<LiveKitNetworkStats | null>(null);
  const isCameraEnabled = ref(false);
  const isScreenShareEnabled = ref(false);
  const selectedCameraDeviceId = ref('');
  const videoQuality = ref<VideoQualityPreset>('720p');
  const desktopStreamingPreferences = ref(loadDesktopStreamingPreferences());
  const speakingMap = ref<Record<string, ParticipantAudioLevel>>({});
  const localSpeaking = ref(false);
  const localAudioLevel = ref(0);
  const remoteParticipantsVersion = ref(0);
  const _remoteParticipants = shallowRef<
    Map<string, RemoteParticipantTrackInfo>
  >(new Map());
  const remoteParticipants = computed(() => {
    void remoteParticipantsVersion.value;
    return _remoteParticipants.value;
  });

  let inner: LiveKitVoiceRoomApi | null = null;
  let loadPromise: Promise<LiveKitVoiceRoomApi> | null = null;
  const syncStops: WatchStopHandle[] = [];

  function bindInner(api: LiveKitVoiceRoomApi): void {
    for (const stop of syncStops) stop();
    syncStops.length = 0;
    const sync = <T>(source: { value: T }, target: { value: T }): void => {
      syncStops.push(
        watch(
          () => source.value,
          (v) => {
            target.value = v;
          },
          { immediate: true },
        ),
      );
    };
    sync(api.roomState, roomState);
    sync(api.lkRoom, lkRoom);
    sync(api.networkStats, networkStats);
    sync(api.isCameraEnabled, isCameraEnabled);
    sync(api.isScreenShareEnabled, isScreenShareEnabled);
    sync(api.selectedCameraDeviceId, selectedCameraDeviceId);
    sync(api.videoQuality, videoQuality);
    sync(api.desktopStreamingPreferences, desktopStreamingPreferences);
    sync(api.speakingMap, speakingMap);
    sync(api.localSpeaking, localSpeaking);
    sync(api.localAudioLevel, localAudioLevel);
    syncStops.push(
      watch(
        api.remoteParticipants,
        (v) => {
          _remoteParticipants.value = v;
          remoteParticipantsVersion.value += 1;
        },
        { immediate: true },
      ),
    );
  }

  async function ensureInner(): Promise<LiveKitVoiceRoomApi> {
    if (inner) return inner;
    if (!loadPromise) {
      loadPromise =
        import('@/features/voice/livekit/createLiveKitVoiceSession').then(
          ({ createLiveKitVoiceSession }) => {
            const api = createLiveKitVoiceSession(opts);
            bindInner(api);
            inner = api;
            return api;
          },
        );
    }
    return loadPromise;
  }

  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  // Warm the LiveKit chunk after shell settle in real browsers only — never in
  // unit tests (would pull livekit-client into every voice harness).
  if (import.meta.env.MODE !== 'test') {
    prefetchTimer = setTimeout(() => {
      prefetchTimer = null;
      void ensureInner();
    }, IDLE_PREFETCH_MS);
  }

  onUnmounted(() => {
    if (prefetchTimer != null) clearTimeout(prefetchTimer);
    for (const stop of syncStops) stop();
    syncStops.length = 0;
    inner?.disconnect();
    inner = null;
  });

  const remoteVolumes = loadRemoteParticipantVolumeOverrides();

  return {
    roomState,
    lkRoom,
    networkStats,
    connect: async (
      url: string,
      token: string,
      bitrateBps?: number | null,
      e2eeMediaKey?: ArrayBuffer | EchoVoiceE2eeConnectInput | null,
      options?: LiveKitVoiceConnectOptions,
    ) => {
      const api = await ensureInner();
      return api.connect(url, token, bitrateBps, e2eeMediaKey, options);
    },
    disconnect: () => {
      inner?.disconnect();
    },
    rotateEpochKey: async (epochKey: EchoMlsEpochKeyInput) => {
      const api = await ensureInner();
      return api.rotateEpochKey(epochKey);
    },
    applyVcAudioState: async (audioOpts) => {
      if (!inner) return;
      return inner.applyVcAudioState(audioOpts);
    },
    isCameraEnabled,
    isScreenShareEnabled,
    selectedCameraDeviceId,
    videoQuality,
    remoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    setCameraEnabled: async (enabled) => {
      const api = await ensureInner();
      return api.setCameraEnabled(enabled);
    },
    setScreenShareEnabled: async (enabled) => {
      const api = await ensureInner();
      return api.setScreenShareEnabled(enabled);
    },
    startScreenShare: async (shareOpts) => {
      const api = await ensureInner();
      return api.startScreenShare(shareOpts);
    },
    stopScreenShare: async () => {
      if (!inner) return;
      return inner.stopScreenShare();
    },
    getLocalScreenTrack: () => inner?.getLocalScreenTrack() ?? null,
    getLocalCameraTrack: () => inner?.getLocalCameraTrack() ?? null,
    switchCamera: (deviceId) => {
      void ensureInner().then((api) => api.switchCamera(deviceId));
    },
    setVideoQuality: async (preset) => {
      const api = await ensureInner();
      return api.setVideoQuality(preset);
    },
    desktopStreamingPreferences,
    setDesktopStreamingPreferences: (patch) => {
      desktopStreamingPreferences.value = {
        ...desktopStreamingPreferences.value,
        ...patch,
      };
      inner?.setDesktopStreamingPreferences(patch);
    },
    startDesktopScreenShare: async (patch) => {
      const api = await ensureInner();
      return api.startDesktopScreenShare(patch);
    },
    startDesktopCameraStream: async (patch) => {
      const api = await ensureInner();
      return api.startDesktopCameraStream(patch);
    },
    switchMicDevice: async (deviceId) => {
      const api = await ensureInner();
      return api.switchMicDevice(deviceId);
    },
    switchSpeakerDevice: async (deviceId) => {
      const api = await ensureInner();
      return api.switchSpeakerDevice(deviceId);
    },
    setOutputVolume: (volumePercent) => {
      if (inner) inner.setOutputVolume(volumePercent);
    },
    setLocalInputVolume: (volumePercent) => {
      if (inner) inner.setLocalInputVolume(volumePercent);
    },
    getRemoteParticipantVolume: (userId) => {
      if (inner) return inner.getRemoteParticipantVolume(userId);
      const id = userId.trim();
      if (!id) return 100;
      return remoteVolumes.get(id) ?? 100;
    },
    setRemoteParticipantVolume: (userId, volumePercent) => {
      if (inner) {
        inner.setRemoteParticipantVolume(userId, volumePercent);
        return;
      }
      const id = userId.trim();
      if (!id) return;
      const persisted = sanitizeRemoteParticipantVolumePercent(volumePercent);
      if (persisted == null) remoteVolumes.delete(id);
      else remoteVolumes.set(id, persisted);
      persistRemoteParticipantVolumeOverrides(remoteVolumes);
    },
    reapplyVoiceProcessing: async () => {
      if (!inner) return;
      return inner.reapplyVoiceProcessing();
    },
    recoverVoiceMediaSession: async (audioOpts) => {
      if (!inner) return;
      return inner.recoverVoiceMediaSession(audioOpts);
    },
    publishYoutubeActivity: (payload) => {
      if (inner) inner.publishYoutubeActivity(payload);
      else noopPublish();
    },
    publishWatchTogetherActivity: (payload) => {
      if (inner) inner.publishWatchTogetherActivity(payload);
      else noopPublish();
    },
    publishVcActivityPresence: (payload) => {
      if (inner) inner.publishVcActivityPresence(payload);
      else noopPublish();
    },
    publishHangmanActivity: (payload) => {
      if (inner) inner.publishHangmanActivity(payload);
      else noopPublish();
    },
    publishHangmanGuessIntent: (payload) => {
      if (inner) inner.publishHangmanGuessIntent(payload);
      else noopPublish();
    },
    publishHangmanNextRound: (payload) => {
      if (inner) inner.publishHangmanNextRound(payload);
      else noopPublish();
    },
    publishHangmanRoundSecret: (payload, destinationIdentities) => {
      if (inner) {
        inner.publishHangmanRoundSecret(payload, destinationIdentities);
      } else {
        noopPublish();
      }
    },
    publishCodenamesActivity: (payload) => {
      if (inner) inner.publishCodenamesActivity(payload);
      else noopPublish();
    },
    publishCodenamesSpymasterKey: (payload, destinationIdentities) => {
      if (inner) {
        inner.publishCodenamesSpymasterKey(payload, destinationIdentities);
      } else {
        noopPublish();
      }
    },
    publishCodenamesKeyToOrchestrator: (payload, destinationIdentities) => {
      if (inner) {
        inner.publishCodenamesKeyToOrchestrator(payload, destinationIdentities);
      } else {
        noopPublish();
      }
    },
    publishCodenamesClueIntent: (payload) => {
      if (inner) inner.publishCodenamesClueIntent(payload);
      else noopPublish();
    },
    publishCodenamesRevealIntent: (payload) => {
      if (inner) inner.publishCodenamesRevealIntent(payload);
      else noopPublish();
    },
    publishCodenamesEndTurnIntent: (payload) => {
      if (inner) inner.publishCodenamesEndTurnIntent(payload);
      else noopPublish();
    },
    publishCodenamesSetupIntent: (payload) => {
      if (inner) inner.publishCodenamesSetupIntent(payload);
      else noopPublish();
    },
    publishCodenamesDealIntent: (payload) => {
      if (inner) inner.publishCodenamesDealIntent(payload);
      else noopPublish();
    },
    publishCodenamesNewGameIntent: (payload) => {
      if (inner) inner.publishCodenamesNewGameIntent(payload);
      else noopPublish();
    },
    publishSkrigglesActivity: (payload) => {
      if (inner) inner.publishSkrigglesActivity(payload);
      else noopPublish();
    },
    publishSkrigglesGuessIntent: (payload) => {
      if (inner) inner.publishSkrigglesGuessIntent(payload);
      else noopPublish();
    },
    publishSkrigglesWordChoiceIntent: (payload) => {
      if (inner) inner.publishSkrigglesWordChoiceIntent(payload);
      else noopPublish();
    },
    publishSkrigglesSettingsIntent: (payload) => {
      if (inner) inner.publishSkrigglesSettingsIntent(payload);
      else noopPublish();
    },
    publishSkrigglesStartIntent: (payload) => {
      if (inner) inner.publishSkrigglesStartIntent(payload);
      else noopPublish();
    },
    publishSkrigglesNextRoundIntent: (payload) => {
      if (inner) inner.publishSkrigglesNextRoundIntent(payload);
      else noopPublish();
    },
    publishSkrigglesRoundSecret: (payload, destinationIdentities) => {
      if (inner) {
        inner.publishSkrigglesRoundSecret(payload, destinationIdentities);
      } else {
        noopPublish();
      }
    },
    publishSkrigglesStrokeBatch: (payload) => {
      if (inner) inner.publishSkrigglesStrokeBatch(payload);
      else noopPublish();
    },
    publishSkrigglesCanvasCmd: (payload) => {
      if (inner) inner.publishSkrigglesCanvasCmd(payload);
      else noopPublish();
    },
    publishSkrigglesCanvasSnapshot: (payload) => {
      if (inner) inner.publishSkrigglesCanvasSnapshot(payload);
      else noopPublish();
    },
  };
}
