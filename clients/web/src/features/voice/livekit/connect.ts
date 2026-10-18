import type {
  AudioCaptureOptions,
  Room as LKRoom,
  TrackPublishDefaults,
} from 'livekit-client';
import { AudioPresets, Room } from 'livekit-client';
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
import type { EchoParticipantKeyProvider } from '@/services/voice/e2ee/echoParticipantKeyProvider';

export type ConnectSessionDeps = {
  muteRemoteParticipantsForDeafen: (room: LKRoom) => Promise<void>;
  syncRemoteParticipants: (room: LKRoom) => void;
  clearLocalVoiceUiState: () => void;
  registerTabCleanup: () => void;
  registerMediaRecovery: (room: LKRoom) => void;
};

/** A join was replaced by a newer join request before transport completed. */
export class VoiceConnectSupersededError extends Error {
  constructor() {
    super('Voice connection was superseded by a newer join request.');
    this.name = 'VoiceConnectSupersededError';
  }
}

export function isVoiceConnectSupersededError(error: unknown): boolean {
  return error instanceof VoiceConnectSupersededError;
}

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
    stopActiveVoiceMediaKeySession();
    if (!liveKitE2eeWorker.value) return;
    liveKitE2eeWorker.value.terminate();
    liveKitE2eeWorker.value = null;
  }

  function peerIdentitiesExcludingSelf(): string[] {
    const room = lkRoom.value;
    if (!room) return [];
    const selfId = room.localParticipant.identity?.trim() ?? '';
    const ids: string[] = [];
    for (const p of room.remoteParticipants.values()) {
      const id = p.identity?.trim();
      if (id && id !== selfId) ids.push(id);
    }
    return ids;
  }

  /**
   * On remote join: rotate our sender key (forward secrecy) and pull the
   * newcomer's announced key from the media-key inbox.
   */
  async function installMlsSenderKeyForParticipant(
    identity: string,
  ): Promise<void> {
    const provider =
      liveKitMlsKeyProvider.value as EchoParticipantKeyProvider | null;
    if (!provider || !activeVoiceE2eeChannelKey.value) return;
    const id = identity.trim();
    if (!id) return;
    try {
      const { rotateAndAnnounceVoiceMediaKey, pullVoiceMediaKeyInbox } =
        await import('@/features/voice/voiceE2eePrepare');
      const peers = peerIdentitiesExcludingSelf();
      if (!peers.includes(id)) peers.push(id);
      const rotated = await rotateAndAnnounceVoiceMediaKey({
        peerUserIds: peers,
      });
      if (rotated) {
        await provider.setSenderKeys(rotated.senderKeys, rotated.keyIndex);
      }
      const pulled = await pullVoiceMediaKeyInbox({ senderUserId: id });
      if (pulled && pulled.senderKeys.size > 0) {
        await provider.setSenderKeys(pulled.senderKeys, pulled.keyIndex);
      }
      voiceClientDiag('info', 'voice.client:lk_e2ee_sender_key_installed', {
        identity: id,
        keyIndex: pulled?.keyIndex ?? rotated?.keyIndex ?? 0,
      });
    } catch (e) {
      voiceClientDiag('error', 'voice.client:lk_e2ee_sender_key_failed', {
        identity: id,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function rotateEpochKey(epochKey: EchoMlsEpochKeyInput): Promise<void> {
    const provider =
      liveKitMlsKeyProvider.value as EchoParticipantKeyProvider | null;
    if (!provider) return;
    try {
      if (epochKey.senderKeys && epochKey.senderKeys.size > 0) {
        await provider.setSenderKeys(epochKey.senderKeys, epochKey.keyIndex);
      } else {
        const selfId = lkRoom.value?.localParticipant.identity?.trim();
        if (selfId) {
          await provider.setSenderKey(selfId, epochKey.raw, epochKey.keyIndex);
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

  function stopActiveVoiceMediaKeySession(): void {
    if (!activeVoiceE2eeChannelKey.value) return;
    void import('@/features/voice/voiceE2eePrepare')
      .then((m) => m.stopVoiceMediaKeySession())
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
      voiceClientTrace('voice.client:lk_connect_supersede_previous', {});
      // Invalidate the previous attempt before disconnecting its Room. Its
      // asynchronous rejection and Disconnected event must not touch the new
      // attempt's state.
      connectGeneration.value += 1;
      abortConnectInProgress();
      releaseLiveKitE2eeWorker();
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
    let room: LKRoom | null = null;
    let createdWorker: Worker | null = null;

    const disposeRoom = (target: LKRoom) => {
      if (connectAbortTarget.value === target) {
        connectAbortTarget.value = null;
      }
      void target.disconnect().catch(() => {});
    };

    const disposeSupersededWorker = () => {
      if (!createdWorker || liveKitE2eeWorker.value !== createdWorker) return;
      liveKitE2eeWorker.value.terminate();
      liveKitE2eeWorker.value = null;
      liveKitMlsKeyProvider.value = null;
      clearVoiceParticipantE2eeStatus();
    };

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
            keyProvider: EchoParticipantKeyProvider;
            worker: Worker;
          }
        | undefined;

      const e2eeInput: EchoVoiceE2eeConnectInput | null =
        e2eeMediaKey && !(e2eeMediaKey instanceof ArrayBuffer)
          ? (e2eeMediaKey as EchoVoiceE2eeConnectInput)
          : e2eeMediaKey instanceof ArrayBuffer && e2eeMediaKey.byteLength > 0
            ? { initialKey: e2eeMediaKey, keyIndex: 0 }
            : null;

      if (e2eeInput && e2eeInput.initialKey.byteLength > 0) {
        const { EchoParticipantKeyProvider } =
          await import('@/services/voice/e2ee/echoParticipantKeyProvider');
        const keyProvider = new EchoParticipantKeyProvider();
        if (e2eeInput.senderKeys && e2eeInput.senderKeys.size > 0) {
          await keyProvider.setSenderKeys(
            e2eeInput.senderKeys,
            e2eeInput.keyIndex,
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
            await keyProvider.setSenderKey(
              selfId,
              e2eeInput.initialKey,
              e2eeInput.keyIndex,
            );
          }
        }
        const worker = createLiveKitE2eeWorker();
        createdWorker = worker;
        if (myGen !== connectGeneration.value) {
          worker.terminate();
          throw new VoiceConnectSupersededError();
        }
        liveKitE2eeWorker.value = worker;
        liveKitMlsKeyProvider.value = keyProvider;
        encryption = { keyProvider, worker };
      }

      room = new Room({
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
        disposeRoom(room);
        throw new VoiceConnectSupersededError();
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
        disposeRoom(room);
        throw new VoiceConnectSupersededError();
      }

      try {
        await room.startAudio();
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:startAudio_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
      if (myGen !== connectGeneration.value) {
        disposeRoom(room);
        throw new VoiceConnectSupersededError();
      }

      actions.reapplyRemotePlaybackGains(room);

      if (shouldPublishInitialMic) {
        await actions.attachMicSendProcessorIfNeeded(room);
        await ensureLocalMicSendPathReady(room);
        await localMicMonitor.ensureAudioContextRunning();
      }
      if (myGen !== connectGeneration.value) {
        disposeRoom(room);
        throw new VoiceConnectSupersededError();
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
      const isCurrentAttempt = myGen === connectGeneration.value;
      if (room) {
        if (isCurrentAttempt) {
          // Invalidate the attempt before disconnecting so its Disconnected
          // event cannot race this cleanup.
          connectGeneration.value += 1;
        }
        disposeRoom(room);
      }
      if (!isCurrentAttempt) {
        disposeSupersededWorker();
        throw e instanceof VoiceConnectSupersededError
          ? e
          : new VoiceConnectSupersededError();
      }

      connectGeneration.value += 1;
      abortConnectInProgress();
      roomState.value = 'error';
      lkRoom.value = null;
      sessionDeps.clearLocalVoiceUiState();
      releaseLiveKitE2eeWorker();
      voiceClientDiag('error', 'voice.client:connect_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      connectInFlight.value = false;
      throw e;
    } finally {
      if (myGen === connectGeneration.value) {
        connectInFlight.value = false;
      }
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
