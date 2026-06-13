import type {
  AudioCaptureOptions,
  LocalAudioTrack,
  RemoteParticipant,
  Room as LKRoom,
  TrackPublishDefaults,
} from 'livekit-client';
import { AudioPresets, ExternalE2EEKeyProvider, Room } from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import {
  encodeEchoVcData,
  encodeEchoVcPrivateViewer,
  type EchoVcDataV1,
  type EchoVcPrivateViewerV1,
} from '@/audio/voiceEchoLiveKitData';
import { announceVoiceChannelPublic } from '@/composables/useEchoSounds';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { echoPlaybackEnsureAudioContextRunning } from '@/services/livekit/echoRemotePlaybackWebAudio';
import { LK_SOURCE_MICROPHONE } from '@/services/livekit/livekitTrackDuckTypes';
import {
  formatVoiceClientError,
  jsonPlainClone,
  LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN,
} from '@/services/livekit/livekitVoiceRoomHelpers';
import {
  buildAudioCaptureOptionsForSession,
  loadVoiceProcessingPreferences,
} from '@/composables/voiceProcessingPreferences';
import type {
  EchoVoiceE2eeConnectInput,
  LiveKitVoiceConnectOptions,
} from '@/composables/livekitVoiceRoom.types';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import { initDesktopNativeAudio, isDesktop } from '@/platform/desktopBridge';
import {
  rebuildRemoteParticipant,
  type LiveKitVoiceSessionContext,
} from '@/composables/livekitVoiceRoom/context';

export function createSessionController(
  ctx: LiveKitVoiceSessionContext,
  attachRoomEventHandlers: (room: LKRoom) => void,
) {
  const {
    lkRoom,
    roomState,
    isCameraEnabled,
    isScreenShareEnabled,
    remoteParticipantsVersion,
    _remoteParticipants,
    remoteParticipantOutputVolume,
    vcDeafenedInternal,
    krispSessionFailed,
    viewerLeaveSoundAt,
    connectInFlight,
    connectGeneration,
    connectAbortTarget,
    liveKitE2eeWorker,
    liveKitMlsKeyProvider,
    applyVcAudioQueued,
    lastVcAudioOpts,
    krispAsyncRejectionCleanup,
    tabCleanup,
    mediaRecoveryCleanup,
    localMicMonitor,
    syncSpeakingLevelsFromRoom,
    actions,
  } = ctx;

  function syncRemoteParticipants(room: LKRoom) {
    const next = new Map<string, ReturnType<typeof rebuildRemoteParticipant>>();
    for (const p of room.remoteParticipants.values()) {
      next.set(p.identity, rebuildRemoteParticipant(p));
    }
    _remoteParticipants.value = next;
    remoteParticipantsVersion.value++;
  }

  function clearLocalVoiceUiState() {
    tabCleanup.value?.();
    tabCleanup.value = null;
    mediaRecoveryCleanup.value?.();
    mediaRecoveryCleanup.value = null;
    if (krispAsyncRejectionCleanup.value) {
      krispAsyncRejectionCleanup.value();
      krispAsyncRejectionCleanup.value = null;
    }
    actions.stopStatsPolling();
    actions.stopAudioHealthPolling();
    actions.teardownSpeakerTracking();
    krispSessionFailed.value = false;
    vcDeafenedInternal.value = false;
    isCameraEnabled.value = false;
    isScreenShareEnabled.value = false;
    viewerLeaveSoundAt.clear();
    remoteParticipantOutputVolume.value = new Map();
    _remoteParticipants.value = new Map();
    remoteParticipantsVersion.value++;
  }

  function abortConnectInProgress() {
    const target = connectAbortTarget.value;
    connectAbortTarget.value = null;
    if (target) {
      void target.disconnect().catch((e) => {
        voiceClientTrace('voice.client:lk_connect_abort_disconnect_err', {
          err: e instanceof Error ? e.message : String(e),
        });
      });
    }
  }

  function releaseLiveKitE2eeWorker(): void {
    liveKitMlsKeyProvider.value = null;
    if (!liveKitE2eeWorker.value) return;
    liveKitE2eeWorker.value.terminate();
    liveKitE2eeWorker.value = null;
  }

  async function rotateEpochKey(
    raw: ArrayBuffer,
    keyIndex: number,
  ): Promise<void> {
    const provider = liveKitMlsKeyProvider.value;
    if (!provider) return;
    try {
      await provider.setEpochKey(raw, keyIndex);
      voiceClientDiag('info', 'voice.client:lk_e2ee_epoch_rotated', {
        keyIndex,
      });
    } catch (e) {
      voiceClientDiag('error', 'voice.client:lk_e2ee_rotate_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function teardownRoomSession(reason: unknown, setError: boolean) {
    voiceClientTrace('voice.client:lk_teardown', {
      setError,
      reason:
        typeof reason === 'number' || typeof reason === 'string'
          ? String(reason)
          : reason instanceof Error
            ? reason.message
            : 'object',
    });
    clearLocalVoiceUiState();
    lkRoom.value = null;
    roomState.value = setError ? 'error' : 'idle';
    voiceClientDiag('info', 'voice.client:session_torn_down', {
      state: roomState.value,
    });
  }

  function disconnect() {
    applyVcAudioQueued.value = Promise.resolve();
    connectGeneration.value += 1;
    abortConnectInProgress();
    releaseLiveKitE2eeWorker();
    voiceClientTrace('voice.client:lk_disconnect_called', {
      hadRoom: !!lkRoom.value,
    });
    const room = lkRoom.value;
    clearLocalVoiceUiState();
    if (room) {
      voiceClientDiag('info', 'voice.client:disconnect_room', {
        roomName: room.name,
        state: String(room.state),
      });
      void room.disconnect().catch((e) => {
        voiceClientDiag('warn', 'voice.client:disconnect_room_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      });
      lkRoom.value = null;
    }
    roomState.value = 'idle';
    voiceClientDiag('info', 'voice.client:state_idle', {});
  }

  async function muteRemoteParticipantsForDeafen(room: LKRoom) {
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        try {
          await pub.setSubscribed(false);
        } catch {
          /* best effort */
        }
      }
    }
  }

  async function unmuteRemoteParticipantsAfterDeafen(room: LKRoom) {
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        try {
          await pub.setSubscribed(true);
        } catch {
          /* best effort */
        }
      }
    }
  }

  function onParticipantConnectedWhileDeafened(p: RemoteParticipant) {
    if (!vcDeafenedInternal.value) return;
    for (const pub of p.audioTrackPublications.values()) {
      void pub.setSubscribed(false);
    }
  }

  function applyVcAudioState(opts: { muted: boolean; deafened: boolean }) {
    applyVcAudioQueued.value = applyVcAudioQueued.value
      .catch(() => {})
      .then(() => runApplyVcAudioState(opts));
    return applyVcAudioQueued.value;
  }

  async function recoverVoiceMediaSession(opts: {
    muted: boolean;
    deafened: boolean;
  }) {
    const room = lkRoom.value;
    if (!room || roomState.value !== 'connected') return;
    lastVcAudioOpts.value = { ...opts };
    void echoPlaybackEnsureAudioContextRunning();
    await localMicMonitor.ensureAudioContextRunning();

    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const track = pub?.track as LocalAudioTrack | undefined;
    const mst = track?.mediaStreamTrack;
    const shouldMicLive = !opts.deafened && !opts.muted;
    const trackEnded = !mst || mst.readyState === 'ended';
    const hardwareMuted = mst
      ? (mst as unknown as { muted?: boolean }).muted === true
      : false;
    const pubMuted = pub?.isMuted === true;
    const needsRepublish =
      shouldMicLive && (trackEnded || hardwareMuted || pubMuted || !track);

    if (needsRepublish) {
      try {
        await runApplyVcAudioState(opts);
      } catch (e) {
        voiceClientDiag(
          'warn',
          'voice.client:recoverVoiceMediaSession_failed',
          { err: formatVoiceClientError(e) },
        );
        if (isSafariLikeBrowser()) {
          dispatchAppToastDetail({
            message: 'Microphone may need attention',
            subtitle:
              'Safari sometimes pauses or blocks the mic after a tab switch. Check the address-bar mic icon or Voice settings, then unmute again.',
            severity: 'warning',
            durationMs: 8000,
          });
        }
        return;
      }
    } else {
      actions.refreshLocalMicLevelMonitor(room);
      actions.applyLocalMicGain(room);
    }
    syncSpeakingLevelsFromRoom.value?.();
  }

  async function runApplyVcAudioState(opts: {
    muted: boolean;
    deafened: boolean;
  }) {
    const room = lkRoom.value;
    if (!room || roomState.value !== 'connected') return;
    lastVcAudioOpts.value = { ...opts };
    voiceClientTrace('voice.client:applyVcAudioState', {
      roomName: room.name,
      ...opts,
    });
    vcDeafenedInternal.value = opts.deafened;
    try {
      if (opts.deafened) {
        await room.localParticipant.setMicrophoneEnabled(false);
        await muteRemoteParticipantsForDeafen(room);
      } else {
        await unmuteRemoteParticipantsAfterDeafen(room);
        await room.localParticipant.setMicrophoneEnabled(
          !opts.muted,
          jsonPlainClone(
            buildAudioCaptureOptionsForSession(
              loadVoiceProcessingPreferences(),
              krispSessionFailed.value,
            ),
          ) as AudioCaptureOptions,
        );
        if (!opts.muted) {
          void actions.attachMicSendProcessorIfNeeded(room);
        }
      }
      actions.refreshLocalMicLevelMonitor(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:applyVcAudioState_failed', {
        err: formatVoiceClientError(e),
      });
    }
  }

  function publishVcPublicMedia(room: LKRoom, msg: EchoVcDataV1) {
    void room.localParticipant.publishData(encodeEchoVcData(msg), {
      reliable: true,
    });
  }

  function localIdentityPayload(
    room: LKRoom,
    kind: EchoVcDataV1['kind'],
  ): EchoVcDataV1 {
    const uid = room.localParticipant.identity;
    const name = room.localParticipant.name?.trim() || undefined;
    return { v: 1, t: 'public_media', kind, userId: uid, name };
  }

  function notifyStreamerViewerLeftStream(
    room: LKRoom,
    streamerIdentity: string,
  ) {
    if (
      !streamerIdentity ||
      streamerIdentity === room.localParticipant.identity
    ) {
      return;
    }
    const payload: EchoVcPrivateViewerV1 = {
      v: 1,
      t: 'viewer_stream',
      kind: 'viewer_left_stream',
      viewerId: room.localParticipant.identity,
    };
    void room.localParticipant.publishData(encodeEchoVcPrivateViewer(payload), {
      reliable: true,
      destinationIdentities: [streamerIdentity],
    });
  }

  function announceLocalVcPublic(room: LKRoom, kind: EchoVcDataV1['kind']) {
    publishVcPublicMedia(room, localIdentityPayload(room, kind));
    switch (kind) {
      case 'stream_start':
        announceVoiceChannelPublic({
          title: 'You started streaming',
          sound: 'streamStart',
        });
        break;
      case 'stream_end':
        announceVoiceChannelPublic({
          title: 'You stopped streaming',
          sound: 'streamEnd',
        });
        break;
      case 'video_start':
        announceVoiceChannelPublic({
          title: 'You turned on your camera',
          sound: 'videoStart',
        });
        break;
      case 'video_end':
        announceVoiceChannelPublic({
          title: 'You turned off your camera',
          sound: 'videoEnd',
        });
        break;
    }
  }

  function registerMediaRecovery(room: LKRoom) {
    mediaRecoveryCleanup.value?.();
    mediaRecoveryCleanup.value = null;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let lastRecoveryAt = 0;
    const RECOVERY_DEBOUNCE_MS = 400;

    const scheduleRecovery = (reason: string) => {
      const now = Date.now();
      if (now - lastRecoveryAt < RECOVERY_DEBOUNCE_MS) return;
      lastRecoveryAt = now;
      voiceClientTrace('voice.client:media_recovery_scheduled', { reason });
      void recoverVoiceMediaSession({ ...lastVcAudioOpts.value });
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      scheduleRecovery('visibility');
    };
    const onFocus = () => {
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      scheduleRecovery('focus');
    };
    const onDeviceChange = () => {
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      scheduleRecovery('devicechange');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    mediaRecoveryCleanup.value = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      navigator.mediaDevices?.removeEventListener?.(
        'devicechange',
        onDeviceChange,
      );
    };
  }

  function registerTabCleanup() {
    tabCleanup.value?.();
    tabCleanup.value = null;
    const onLeave = () => {
      disconnect();
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    tabCleanup.value = () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
  }

  async function connect(
    url: string,
    token: string,
    bitrateBps?: number | null,
    e2eeMediaKey?: ArrayBuffer | EchoVoiceE2eeConnectInput | null,
    connectOptions?: LiveKitVoiceConnectOptions,
  ) {
    const initialAudioState = connectOptions?.initialAudioState ?? {
      muted: false,
      deafened: false,
    };
    const shouldPublishInitialMic =
      !initialAudioState.muted && !initialAudioState.deafened;
    const urlForLog = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'invalid_url';
      }
    })();
    voiceClientTrace('voice.client:lk_connect_start', {
      urlHost: urlForLog,
      tokenChars: token.length,
    });
    if (connectInFlight.value || roomState.value === 'connecting') {
      return;
    }
    connectInFlight.value = true;

    if (lkRoom.value) {
      const prev = lkRoom.value;
      lkRoom.value = null;
      releaseLiveKitE2eeWorker();
      void prev.disconnect().catch(() => {});
    }
    const myGen = ++connectGeneration.value;
    roomState.value = 'connecting';
    try {
      if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
        void initDesktopNativeAudio().catch(() => {});
      }
      if (myGen !== connectGeneration.value) return;

      const prefsForRoom = loadVoiceProcessingPreferences();
      const captureDefaults = jsonPlainClone(
        buildAudioCaptureOptionsForSession(
          prefsForRoom,
          krispSessionFailed.value,
        ),
      ) as AudioCaptureOptions;
      const audioPreset =
        bitrateBps != null
          ? { maxBitrate: Number(bitrateBps) }
          : { ...AudioPresets.musicHighQuality };
      const publishDefaultsPlain = jsonPlainClone({
        audioPreset,
        degradationPreference: 'maintain-resolution' as const,
        simulcast: true,
      }) as TrackPublishDefaults;

      let encryption:
        | {
            keyProvider:
              | ExternalE2EEKeyProvider
              | import('@/services/voice/mls/echoMlsKeyProvider').EchoMlsKeyProvider;
            worker: Worker;
          }
        | undefined;

      const mlsInput =
        e2eeMediaKey && !(e2eeMediaKey instanceof ArrayBuffer)
          ? (e2eeMediaKey as EchoVoiceE2eeConnectInput)
          : null;
      const legacyKey =
        e2eeMediaKey instanceof ArrayBuffer ? e2eeMediaKey : null;

      if (mlsInput && mlsInput.initialKey.byteLength > 0) {
        const { EchoMlsKeyProvider } =
          await import('@/services/voice/mls/echoMlsKeyProvider');
        const keyProvider = new EchoMlsKeyProvider();
        await keyProvider.setEpochKey(mlsInput.initialKey, mlsInput.keyIndex);
        const worker = new Worker(
          new URL('livekit-client/e2ee-worker', import.meta.url),
          { type: 'module' },
        );
        liveKitE2eeWorker.value = worker;
        liveKitMlsKeyProvider.value = keyProvider;
        encryption = { keyProvider, worker };
      } else if (legacyKey && legacyKey.byteLength > 0) {
        const keyProvider = new ExternalE2EEKeyProvider();
        await keyProvider.setKey(legacyKey);
        const worker = new Worker(
          new URL('livekit-client/e2ee-worker', import.meta.url),
          { type: 'module' },
        );
        liveKitE2eeWorker.value = worker;
        encryption = { keyProvider, worker };
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: captureDefaults,
        videoCaptureDefaults: LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN,
        publishDefaults: publishDefaultsPlain,
        ...(encryption ? { encryption } : {}),
      });
      connectAbortTarget.value = room;

      attachRoomEventHandlers(room);

      await room.connect(url, token);
      void echoPlaybackEnsureAudioContextRunning();
      if (myGen !== connectGeneration.value) {
        connectAbortTarget.value = null;
        void room.disconnect().catch(() => {});
        releaseLiveKitE2eeWorker();
        return;
      }

      lastVcAudioOpts.value = { ...initialAudioState };
      vcDeafenedInternal.value = initialAudioState.deafened;
      if (initialAudioState.deafened) {
        await muteRemoteParticipantsForDeafen(room);
      }
      if (shouldPublishInitialMic) {
        const micOpts = jsonPlainClone(
          buildAudioCaptureOptionsForSession(
            loadVoiceProcessingPreferences(),
            krispSessionFailed.value,
          ),
        ) as AudioCaptureOptions;
        await room.localParticipant.setMicrophoneEnabled(true, micOpts);
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      if (myGen !== connectGeneration.value) {
        connectAbortTarget.value = null;
        void room.disconnect().catch(() => {});
        releaseLiveKitE2eeWorker();
        return;
      }

      try {
        await room.startAudio();
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:startAudio_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
      if (myGen !== connectGeneration.value) {
        connectAbortTarget.value = null;
        void room.disconnect().catch(() => {});
        releaseLiveKitE2eeWorker();
        return;
      }

      actions.reapplyRemotePlaybackGains(room);

      if (shouldPublishInitialMic) {
        await actions.attachMicSendProcessorIfNeeded(room);
      }
      if (myGen !== connectGeneration.value) {
        connectAbortTarget.value = null;
        void room.disconnect().catch(() => {});
        releaseLiveKitE2eeWorker();
        return;
      }

      connectAbortTarget.value = null;
      lkRoom.value = room;
      roomState.value = 'connected';
      actions.refreshLocalMicLevelMonitor(room);
      syncRemoteParticipants(room);
      registerTabCleanup();
      registerMediaRecovery(room);
      actions.startStatsPolling();
      actions.dumpRemoteAudioTrackState(room, 'post_connect');
      actions.dumpLiveKitDomAudioElements();
      actions.startAudioHealthPolling(room);
    } catch (e) {
      connectGeneration.value += 1;
      abortConnectInProgress();
      roomState.value = 'error';
      lkRoom.value = null;
      clearLocalVoiceUiState();
      releaseLiveKitE2eeWorker();
      voiceClientDiag('error', 'voice.client:connect_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    } finally {
      connectInFlight.value = false;
    }
  }

  return {
    syncRemoteParticipants,
    clearLocalVoiceUiState,
    disconnect,
    rotateEpochKey,
    teardownRoomSession,
    muteRemoteParticipantsForDeafen,
    unmuteRemoteParticipantsAfterDeafen,
    onParticipantConnectedWhileDeafened,
    applyVcAudioState,
    recoverVoiceMediaSession,
    runApplyVcAudioState,
    announceLocalVcPublic,
    notifyStreamerViewerLeftStream,
    connect,
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
