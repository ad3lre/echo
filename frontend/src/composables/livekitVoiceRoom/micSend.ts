import type {
  AudioCaptureOptions,
  LocalAudioTrack,
  Room as LKRoom,
} from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import {
  ensureEchoMicSendProcessor,
  isLegacyKrispOnlyProcessor,
  setEchoMicSendLinearGain,
} from '@/services/livekit/echoLocalMicSendGain';
import { isKrispNoiseFilterSupportedSafe } from '@/services/livekit/krispNoiseFilter';
import {
  LK_KIND_AUDIO,
  LK_SOURCE_MICROPHONE,
  type TrackLike,
} from '@/services/livekit/livekitTrackDuckTypes';
import {
  formatVoiceClientError,
  gainFromVolumePercent,
  jsonPlainClone,
} from '@/services/livekit/livekitVoiceRoomHelpers';
import {
  buildAudioCaptureOptionsForSession,
  buildKrispFailureFallbackCaptureOptions,
  buildKrispNoiseFilterOptions,
  effectiveCaptureMode,
  loadVoiceProcessingPreferences,
  type VoiceProcessingPreferencesV2,
} from '@/composables/voiceProcessingPreferences';
import { gateMultiplierForDbfs } from '@/composables/voiceGate';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import type { LiveKitVoiceSessionContext } from '@/composables/livekitVoiceRoom/context';

const MIC_ATTACH_LOG_MAX = 6;
const MIC_GAIN_LOG_MAX = 12;
const MIC_GAIN_ZERO_LOG_MAX = 3;

export function createMicSendController(ctx: LiveKitVoiceSessionContext) {
  const {
    lkRoom,
    roomState,
    lastInputVolumePercent,
    krispSessionFailed,
    localMicMonitor,
    krispAsyncRejectionCleanup,
    micAttachDiagLogs,
    micGainDiagLogs,
    micGainZeroLogs,
    actions,
  } = ctx;
  const voiceLevels = useVoiceLevelsStore();

  function gateMultiplierFromDbfs(dbfs: number): number {
    return gateMultiplierForDbfs(
      dbfs,
      voiceLevels.voiceActivationThresholdPercent,
      voiceLevels.outboundGateMode,
    );
  }

  function getMicCaptureOptions() {
    const prefs = loadVoiceProcessingPreferences();
    return buildAudioCaptureOptionsForSession(prefs, krispSessionFailed.value);
  }

  function clearKrispAsyncRejectionWatch() {
    if (krispAsyncRejectionCleanup.value) {
      krispAsyncRejectionCleanup.value();
      krispAsyncRejectionCleanup.value = null;
    }
  }

  async function applyKrispFailureFallback(
    room: LKRoom,
    localAudio: LocalAudioTrack,
    prefs: VoiceProcessingPreferencesV2,
    kind: 'sync' | 'async',
  ) {
    if (krispSessionFailed.value) return;
    if (lkRoom.value !== room) return;
    clearKrispAsyncRejectionWatch();
    if (kind === 'async') {
      voiceClientDiag('error', 'voice.client:krisp_processor_failed_async', {});
    }
    voiceClientTrace('voice.client:krisp_processor_recover', { kind });
    krispSessionFailed.value = true;
    try {
      await localAudio.stopProcessor();
    } catch {
      /* ignore */
    }
    const fallback = jsonPlainClone(
      buildKrispFailureFallbackCaptureOptions(prefs),
    ) as AudioCaptureOptions;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true, fallback);
      voiceClientDiag(
        'info',
        'voice.client:krisp_fallback_mic_republished',
        {},
      );
      await attachMicSendProcessorIfNeeded(room);
    } catch (e2) {
      voiceClientDiag('error', 'voice.client:krisp_fallback_mic_failed', {
        err: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }

  function registerKrispAsyncFailureWatch(
    room: LKRoom,
    localAudio: LocalAudioTrack,
  ) {
    clearKrispAsyncRejectionWatch();
    const prefs = loadVoiceProcessingPreferences();
    const handler = (ev: PromiseRejectionEvent) => {
      const r = ev.reason;
      const msg = r instanceof Error ? r.message : String(r ?? '');
      const stack = r instanceof Error ? (r.stack ?? '') : '';
      const fromKrisp =
        stack.includes('krisp-noise-filter') ||
        stack.includes('@livekit/krisp-noise-filter');
      const krispPrivateFieldBug =
        msg.includes('private field') &&
        (stack.includes('livekit') || stack.includes('Krisp'));
      if (!fromKrisp && !krispPrivateFieldBug) return;
      ev.preventDefault();
      void applyKrispFailureFallback(room, localAudio, prefs, 'async');
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('unhandledrejection', handler);
    const tid = window.setTimeout(() => {
      clearKrispAsyncRejectionWatch();
    }, 25_000);
    krispAsyncRejectionCleanup.value = () => {
      window.removeEventListener('unhandledrejection', handler);
      window.clearTimeout(tid);
    };
  }

  async function stopMicProcessorIfAny(room: LKRoom) {
    clearKrispAsyncRejectionWatch();
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const t = pub?.track;
    if (!t || (t as TrackLike).kind !== LK_KIND_AUDIO) return;
    const lat = t as LocalAudioTrack;
    try {
      await lat.stopProcessor();
    } catch {
      /* ignore */
    }
  }

  async function attachMicSendProcessorIfNeeded(room: LKRoom) {
    const prefs = loadVoiceProcessingPreferences();
    const capMode = effectiveCaptureMode(prefs, krispSessionFailed.value);

    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const track = pub?.track;
    if (!track || (track as TrackLike).kind !== LK_KIND_AUDIO) {
      voiceClientDiag('warn', 'voice.client:mic_send_no_local_audio_track', {});
      return;
    }
    const localAudio = track as LocalAudioTrack;

    if (isLegacyKrispOnlyProcessor(localAudio.getProcessor())) {
      try {
        await localAudio.stopProcessor();
      } catch {
        /* ignore */
      }
    }

    let useKrisp = capMode === 'krisp';
    if (useKrisp && !(await isKrispNoiseFilterSupportedSafe())) {
      voiceClientDiag('warn', 'voice.client:krisp_unsupported_browser', {});
      voiceClientTrace('voice.client:krisp_unsupported_browser', {});
      if (!krispSessionFailed.value) {
        await applyKrispFailureFallback(room, localAudio, prefs, 'sync');
        return;
      }
      useKrisp = false;
    }

    try {
      await ensureEchoMicSendProcessor(localAudio, {
        useKrisp,
        krispOptions: useKrisp
          ? buildKrispNoiseFilterOptions(prefs)
          : undefined,
      });
      if (useKrisp) {
        registerKrispAsyncFailureWatch(room, localAudio);
        voiceClientDiag('info', 'voice.client:mic_send_processor_attached', {
          useKrisp: true,
        });
      } else {
        clearKrispAsyncRejectionWatch();
        voiceClientDiag('info', 'voice.client:mic_send_processor_attached', {
          useKrisp: false,
        });
      }
      applyLocalMicGain(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:mic_send_processor_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      voiceClientTrace('voice.client:mic_send_processor_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      if (useKrisp && !krispSessionFailed.value) {
        await applyKrispFailureFallback(room, localAudio, prefs, 'sync');
      }
    }
  }

  function applyLocalMicGain(room: LKRoom) {
    const base = gainFromVolumePercent(lastInputVolumePercent.value);
    const gateMultiplier = gateMultiplierFromDbfs(localMicMonitor.dbfs.value);
    const gated = base * gateMultiplier;
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const t = pub?.track;
    if (t && (t as TrackLike).kind === LK_KIND_AUDIO) {
      const localAudio = t as LocalAudioTrack;
      if (!setEchoMicSendLinearGain(localAudio, gated)) {
        void attachMicSendProcessorIfNeeded(room);
      }
    }
    if (micGainZeroLogs.value < MIC_GAIN_ZERO_LOG_MAX && !!t && base <= 0) {
      micGainZeroLogs.value++;
      voiceClientDiag('warn', 'voice.client:mic_gain_zero_input_volume', {
        roomName: room.name,
        inputEffectivePercent: lastInputVolumePercent.value,
      });
    }
    if (
      micGainDiagLogs.value < MIC_GAIN_LOG_MAX &&
      roomState.value === 'connected' &&
      !!t &&
      base > 0 &&
      gated <= 0.05
    ) {
      micGainDiagLogs.value++;
      voiceClientDiag('warn', 'voice.client:mic_gain_low', {
        roomName: room.name,
        inputEffectivePercent: lastInputVolumePercent.value,
        baseGain: base,
        gateMultiplier,
        gatedGain: gated,
        dbfs: localMicMonitor.dbfs.value,
        gateMode: voiceLevels.outboundGateMode,
        thresholdPercent: voiceLevels.voiceActivationThresholdPercent,
        audioCtx: localMicMonitor.audioContextState.value ?? 'unknown',
        audioCtxSampleRate: localMicMonitor.audioContextSampleRate.value ?? 0,
      });
    }
  }

  async function reapplyVoiceProcessing() {
    const room = lkRoom.value;
    if (!room || roomState.value !== 'connected') return;
    try {
      await stopMicProcessorIfAny(room);
      await room.localParticipant.setMicrophoneEnabled(false);
      const prefs = loadVoiceProcessingPreferences();
      const opts = jsonPlainClone(
        buildAudioCaptureOptionsForSession(prefs, krispSessionFailed.value),
      ) as AudioCaptureOptions;
      await room.localParticipant.setMicrophoneEnabled(true, opts);
      await attachMicSendProcessorIfNeeded(room);
      actions.refreshLocalMicLevelMonitor(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:reapplyVoiceProcessing_failed', {
        err: formatVoiceClientError(e),
      });
    }
  }

  return {
    getMicCaptureOptions,
    clearKrispAsyncRejectionWatch,
    applyKrispFailureFallback,
    registerKrispAsyncFailureWatch,
    stopMicProcessorIfAny,
    attachMicSendProcessorIfNeeded,
    applyLocalMicGain,
    reapplyVoiceProcessing,
  };
}

export type MicSendController = ReturnType<typeof createMicSendController>;
