import type {
  AudioCaptureOptions,
  LocalAudioTrack,
  RemoteParticipant,
  Room as LKRoom,
} from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { echoPlaybackEnsureAudioContextRunning } from '@/services/livekit/echoRemotePlaybackWebAudio';
import {
  ensureLocalMicSendPathReady,
  isLocalMicPublicationLive,
} from '@/services/livekit/echoLocalMicPublishHealth';
import { ensureEchoMicSendProcessorAudioContextRunning } from '@/services/livekit/echoLocalMicSendGain';
import { LK_SOURCE_MICROPHONE } from '@/services/livekit/livekitTrackDuckTypes';
import {
  formatVoiceClientError,
  jsonPlainClone,
} from '@/services/livekit/livekitVoiceRoomHelpers';
import {
  buildAudioCaptureOptionsForSession,
  loadVoiceProcessingPreferences,
} from '@/composables/voiceProcessingPreferences';
import {
  rebuildRemoteParticipant,
  type LiveKitVoiceSessionContext,
} from '@/composables/livekitVoiceRoom/context';

export type ConnectLifecycleOps = {
  abortConnectInProgress: () => void;
  releaseLiveKitE2eeWorker: () => void;
};

export function createSessionController(
  ctx: LiveKitVoiceSessionContext,
  connectLifecycle: ConnectLifecycleOps,
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
    ctx.connectGeneration.value += 1;
    connectLifecycle.abortConnectInProgress();
    connectLifecycle.releaseLiveKitE2eeWorker();
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
    const noPublication = shouldMicLive && !pub;
    const needsRepublish =
      shouldMicLive &&
      (noPublication || trackEnded || hardwareMuted || pubMuted || !track);

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
              'WebKit sometimes blocks outgoing voice until you unmute again. Check Voice settings or toggle the mic button, then speak.',
            severity: 'warning',
            durationMs: 8000,
          });
        }
        return;
      }
    } else if (shouldMicLive && track) {
      const sendReady = await ensureLocalMicSendPathReady(room);
      if (!sendReady) {
        try {
          await runApplyVcAudioState(opts);
        } catch (e) {
          voiceClientDiag(
            'warn',
            'voice.client:recoverVoiceMediaSession_failed',
            {
              err: formatVoiceClientError(e),
            },
          );
        }
      } else if (!isLocalMicPublicationLive(room)) {
        try {
          await runApplyVcAudioState(opts);
        } catch (e) {
          voiceClientDiag(
            'warn',
            'voice.client:recoverVoiceMediaSession_failed',
            {
              err: formatVoiceClientError(e),
            },
          );
        }
      } else {
        await ensureEchoMicSendProcessorAudioContextRunning(track);
        actions.refreshLocalMicLevelMonitor(room);
        actions.applyLocalMicGain(room);
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
          await actions.attachMicSendProcessorIfNeeded(room);
          await ensureLocalMicSendPathReady(room);
        }
      }
      actions.refreshLocalMicLevelMonitor(room);
      await localMicMonitor.ensureAudioContextRunning();
    } catch (e) {
      voiceClientDiag('error', 'voice.client:applyVcAudioState_failed', {
        err: formatVoiceClientError(e),
      });
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

  return {
    syncRemoteParticipants,
    clearLocalVoiceUiState,
    disconnect,
    teardownRoomSession,
    muteRemoteParticipantsForDeafen,
    unmuteRemoteParticipantsAfterDeafen,
    onParticipantConnectedWhileDeafened,
    applyVcAudioState,
    recoverVoiceMediaSession,
    runApplyVcAudioState,
    registerMediaRecovery,
    registerTabCleanup,
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
