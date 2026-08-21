import type {
  AudioCaptureOptions,
  Room as LKRoom,
  TrackPublishDefaults,
} from 'livekit-client';
import { AudioPresets, ExternalE2EEKeyProvider, Room } from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { echoPlaybackEnsureAudioContextRunning } from '@/features/voice/livekit/echoRemotePlaybackWebAudio';
import { ensureLocalMicSendPathReady } from '@/features/voice/livekit/echoLocalMicPublishHealth';
import {
  jsonPlainClone,
  LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN,
} from '@/features/voice/livekit/livekitVoiceRoomHelpers';
import {
  buildAudioCaptureOptionsForSession,
  loadVoiceProcessingPreferences,
} from '@/features/voice/voiceProcessingPreferences';
import type {
  EchoMlsEpochKeyInput,
  EchoVoiceE2eeConnectInput,
  LiveKitVoiceConnectOptions,
} from '@/features/voice/livekitVoiceRoom.types';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import { activeVoiceE2eeChannelKey } from '@/features/voice/voiceE2eeActiveState';
import { createLiveKitE2eeWorker } from '@/features/voice/livekit/livekitE2eeWorker';
import { clearVoiceParticipantE2eeStatus } from '@/features/voice/voiceE2eeEncryptionStatus';
import { initDesktopNativeAudio, isDesktop } from '@/platform/desktopBridge';
import type { LiveKitVoiceSessionContext } from '@/features/voice/livekit/context';

export type ConnectSessionDeps = {
  muteRemoteParticipantsForDeafen: (room: LKRoom) => Promise<void>;
  syncRemoteParticipants: (room: LKRoom) => void;
  clearLocalVoiceUiState: () => void;
  registerTabCleanup: () => void;
  registerMediaRecovery: (room: LKRoom) => void;
};

export function createConnectController(
  ctx: LiveKitVoiceSessionContext,
  attachRoomEventHandlers: (room: LKRoom) => void,
  sessionDeps: ConnectSessionDeps,
) {
  const {
    lkRoom,
    roomState,
    krispSessionFailed,
    connectInFlight,
    connectGeneration,
    connectAbortTarget,
    liveKitE2eeWorker,
    liveKitMlsKeyProvider,
    lastVcAudioOpts,
    vcDeafenedInternal,
    localMicMonitor,
    actions,
  } = ctx;

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
    clearVoiceParticipantE2eeStatus();
    stopActiveVoiceMlsSession();
    if (!liveKitE2eeWorker.value) return;
    liveKitE2eeWorker.value.terminate();
    liveKitE2eeWorker.value = null;
  }

  async function installMlsSenderKeyForParticipant(
    identity: string,
  ): Promise<void> {
    const provider = liveKitMlsKeyProvider.value;
    if (!provider || !activeVoiceE2eeChannelKey.value) return;
    const id = identity.trim();
    if (!id) return;
    try {
      const { deriveActiveVoiceMlsSenderMediaKey } =
        await import('@/services/voice/mls/voiceMlsSession');
      const key = await deriveActiveVoiceMlsSenderMediaKey(id);
      if (!key) return;
      await provider.setSenderEpochKey(id, key.raw, key.keyIndex);
      voiceClientDiag('info', 'voice.client:lk_e2ee_sender_key_installed', {
        identity: id,
        keyIndex: key.keyIndex,
      });
    } catch (e) {
      voiceClientDiag('error', 'voice.client:lk_e2ee_sender_key_failed', {
        identity: id,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function rotateEpochKey(epochKey: EchoMlsEpochKeyInput): Promise<void> {
    const provider = liveKitMlsKeyProvider.value;
    if (!provider) return;
    try {
      if (epochKey.senderKeys && epochKey.senderKeys.size > 0) {
        await provider.setEpochKeys(epochKey.senderKeys, epochKey.keyIndex);
      } else {
        const selfId = lkRoom.value?.localParticipant.identity?.trim();
        if (selfId) {
          await provider.setSenderEpochKey(
            selfId,
            epochKey.raw,
            epochKey.keyIndex,
          );
        }
      }
      voiceClientDiag('info', 'voice.client:lk_e2ee_epoch_rotated', {
        keyIndex: epochKey.keyIndex,
        senderCount: epochKey.senderKeys?.size ?? 1,
      });
    } catch (e) {
      voiceClientDiag('error', 'voice.client:lk_e2ee_rotate_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * End the MLS group session when the room tears down, so the remaining
   * deterministic committer removes us (forward secrecy) and the E2EE badge
   * state clears. Guarded by the lightweight active-state ref so the ts-mls
   * chunk is only loaded when an MLS session actually exists.
   */
  function stopActiveVoiceMlsSession(): void {
    if (!activeVoiceE2eeChannelKey.value) return;
    void import('@/services/voice/mls/voiceMlsSession')
      .then((m) => m.stopVoiceMlsSession())
      .catch(() => {});
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
        if (mlsInput.senderKeys && mlsInput.senderKeys.size > 0) {
          await keyProvider.setEpochKeys(
            mlsInput.senderKeys,
            mlsInput.keyIndex,
          );
        } else {
          const selfId = (() => {
            try {
              const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as {
                sub?: string;
              };
              return payload.sub?.trim() ?? '';
            } catch {
              return '';
            }
          })();
          if (selfId) {
            await keyProvider.setSenderEpochKey(
              selfId,
              mlsInput.initialKey,
              mlsInput.keyIndex,
            );
          }
        }
        const worker = createLiveKitE2eeWorker();
        liveKitE2eeWorker.value = worker;
        liveKitMlsKeyProvider.value = keyProvider;
        encryption = { keyProvider, worker };
      } else if (legacyKey && legacyKey.byteLength > 0) {
        const keyProvider = new ExternalE2EEKeyProvider();
        await keyProvider.setKey(legacyKey);
        const worker = createLiveKitE2eeWorker();
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
        await sessionDeps.muteRemoteParticipantsForDeafen(room);
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
        await ensureLocalMicSendPathReady(room);
        await localMicMonitor.ensureAudioContextRunning();
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
      sessionDeps.syncRemoteParticipants(room);
      sessionDeps.registerTabCleanup();
      sessionDeps.registerMediaRecovery(room);
      actions.startStatsPolling();
      actions.dumpRemoteAudioTrackState(room, 'post_connect');
      actions.dumpLiveKitDomAudioElements();
      actions.startAudioHealthPolling(room);
    } catch (e) {
      connectGeneration.value += 1;
      abortConnectInProgress();
      roomState.value = 'error';
      lkRoom.value = null;
      sessionDeps.clearLocalVoiceUiState();
      releaseLiveKitE2eeWorker();
      voiceClientDiag('error', 'voice.client:connect_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    } finally {
      connectInFlight.value = false;
    }
  }

  return {
    connect,
    rotateEpochKey,
    installMlsSenderKeyForParticipant,
    abortConnectInProgress,
    releaseLiveKitE2eeWorker,
  };
}

export type ConnectController = ReturnType<typeof createConnectController>;
