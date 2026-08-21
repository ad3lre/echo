import type {
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  Room as LKRoom,
} from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import {
  assertCameraCaptureReady,
  VoiceJoinMediaPreflightError,
} from '@/features/voice/voiceJoinMediaPreflight';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  isDesktop,
  setDesktopAudioInputDevice,
  setDesktopAudioOutputDevice,
  setDesktopAudioOutputVolume,
} from '@/platform/desktopBridge';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';
import {
  LK_SOURCE_CAMERA,
  LK_SOURCE_SCREEN_SHARE,
} from '@/features/voice/livekit/livekitTrackDuckTypes';
import {
  buildScreenSharePublishOptions,
  buildScreenSharePublishOptionsIosLike,
  formatVoiceClientError,
  isUserCancelledMediaError,
  jsonPlainClone,
  persistDesktopStreamingPreferences,
  plainVideoCaptureOptionsForLiveKit,
  VIDEO_CAPTURE_PRESETS,
} from '@/features/voice/livekit/livekitVoiceRoomHelpers';
import type { VideoQualityPreset } from '@/features/voice/livekitVoiceRoom.types';
import type { LiveKitVoiceSessionContext } from '@/features/voice/livekit/context';

export function createMediaControls(ctx: LiveKitVoiceSessionContext) {
  const {
    lkRoom,
    isCameraEnabled,
    isScreenShareEnabled,
    selectedCameraDeviceId,
    videoQuality,
    desktopStreamingPreferences,
    lastOutputVolumePercent,
    lastInputVolumePercent,
    actions,
  } = ctx;

  async function setCameraEnabled(enabled: boolean) {
    const room = lkRoom.value;
    if (!room) return;
    if (!enabled) {
      try {
        await room.localParticipant.setCameraEnabled(false);
      } catch (e) {
        voiceClientDiag('error', 'voice.client:setCameraEnabled_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    const dev = selectedCameraDeviceId.value;
    try {
      await assertCameraCaptureReady(
        dev && dev !== 'default' ? String(dev) : undefined,
      );
    } catch (e) {
      const msg =
        e instanceof VoiceJoinMediaPreflightError
          ? e.message
          : e instanceof Error && e.message.trim()
            ? e.message.trim()
            : 'Could not access the camera.';
      voiceClientDiag('warn', 'voice.client:camera_preflight_failed', {
        err: msg,
      });
      UIErrorBus.emit({
        context: 'voice.camera_preflight',
        severity: 'warning',
        userMessage: msg,
        retryAction: () => {
          void setCameraEnabled(true);
        },
      });
      return;
    }

    try {
      const q = videoQuality.value;
      const preset = VIDEO_CAPTURE_PRESETS[q] ?? VIDEO_CAPTURE_PRESETS['480p'];
      const devStr = typeof dev === 'string' ? dev : String(dev ?? '');
      const captureOpts = plainVideoCaptureOptionsForLiveKit(
        preset,
        devStr || undefined,
      );
      await room.localParticipant.setCameraEnabled(true, captureOpts);
    } catch (e) {
      const detail = formatVoiceClientError(e);
      voiceClientDiag('error', 'voice.client:setCameraEnabled_failed', {
        err: detail,
      });
      UIErrorBus.emit({
        context: 'voice.camera_publish',
        severity: 'warning',
        userMessage: `Could not start camera: ${detail}`,
        retryAction: () => {
          void setCameraEnabled(true);
        },
      });
    }
  }

  async function setScreenShareEnabled(enabled: boolean) {
    const room = lkRoom.value;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(enabled);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:setScreenShareEnabled_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function startScreenShare(opts: {
    quality: '1080p60' | '720p30' | '720p15' | 'auto';
    audio: boolean;
    contentHint: 'motion' | 'detail';
  }) {
    const room = lkRoom.value;
    if (!room) return;
    if (!echoSyncCapabilities.browser.supportsScreenShare) {
      UIErrorBus.emit({
        context: 'voice.screen_share_unsupported',
        severity: 'warning',
        userMessage:
          'Screen sharing is not available in this browser yet. On iPad or iPhone, update to the latest Safari (or install the Echo web app) and use HTTPS.',
      });
      return;
    }

    const safariDesktop =
      echoSyncCapabilities.browser.isSafariLike &&
      !echoSyncCapabilities.browser.isIosLike;
    const iosLike = echoSyncCapabilities.browser.isIosLike;

    function buildFullScreenShareCapture(): ScreenShareCaptureOptions {
      let resolution: ScreenShareCaptureOptions['resolution'];
      if (opts.quality === '1080p60') {
        resolution = { width: 1920, height: 1080, frameRate: 60 };
      } else if (opts.quality === '720p15') {
        resolution = { width: 1280, height: 720, frameRate: 15 };
      } else if (opts.quality === '720p30') {
        resolution = { width: 1280, height: 720, frameRate: 30 };
      } else if (opts.quality === 'auto') {
        resolution = { width: 1920, height: 1080, frameRate: 30 };
      }
      return {
        audio: opts.audio,
        resolution: resolution
          ? {
              width: resolution.width,
              height: resolution.height,
              frameRate: resolution.frameRate,
            }
          : undefined,
        contentHint: opts.contentHint,
      };
    }

    const minimalCapture = (): ScreenShareCaptureOptions =>
      jsonPlainClone({ audio: opts.audio }) as ScreenShareCaptureOptions;

    const attempts: ScreenShareCaptureOptions[] = [];
    if (safariDesktop || iosLike) {
      attempts.push(minimalCapture());
      if (opts.audio) {
        attempts.push(
          jsonPlainClone({ audio: false }) as ScreenShareCaptureOptions,
        );
      }
    } else {
      attempts.push(
        jsonPlainClone(
          buildFullScreenShareCapture(),
        ) as ScreenShareCaptureOptions,
      );
      attempts.push(minimalCapture());
      if (opts.audio) {
        attempts.push(
          jsonPlainClone({ audio: false }) as ScreenShareCaptureOptions,
        );
      }
    }

    const publishOptsPlain = jsonPlainClone(
      iosLike
        ? buildScreenSharePublishOptionsIosLike(opts)
        : buildScreenSharePublishOptions(opts),
    ) as TrackPublishOptions;

    let lastErr: unknown;
    for (const capPlain of attempts) {
      try {
        await room.localParticipant.setScreenShareEnabled(
          true,
          capPlain,
          publishOptsPlain,
        );
        return;
      } catch (e) {
        lastErr = e;
        if (isUserCancelledMediaError(e)) {
          voiceClientDiag('info', 'voice.client:startScreenShare_cancelled', {
            err: formatVoiceClientError(e),
          });
          return;
        }
      }
    }

    const detail = formatVoiceClientError(lastErr);
    voiceClientDiag('error', 'voice.client:startScreenShare_failed', {
      err: detail,
    });
    UIErrorBus.emit({
      context: 'voice.screen_share_start',
      severity: 'warning',
      userMessage: `Could not start screen share: ${detail}`,
      retryAction: () => {
        void startScreenShare(opts);
      },
    });
  }

  async function stopScreenShare() {
    await setScreenShareEnabled(false);
  }

  function getLocalScreenTrack() {
    const room = lkRoom.value;
    if (!room) return null;
    const pub = room.localParticipant.getTrackPublication(
      LK_SOURCE_SCREEN_SHARE,
    );
    return pub?.track ?? null;
  }

  function getLocalCameraTrack() {
    const room = lkRoom.value;
    if (!room) return null;
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_CAMERA);
    return pub?.track ?? null;
  }

  function switchCamera(deviceId: string) {
    selectedCameraDeviceId.value =
      !deviceId || deviceId === 'default' ? '' : deviceId;
    const room = lkRoom.value;
    if (!room || !isCameraEnabled.value) return;
    void (async () => {
      try {
        await room.switchActiveDevice('videoinput', deviceId);
      } catch (e) {
        voiceClientTrace('voice.client:switch_camera_videoinput_fallback', {
          err: e instanceof Error ? e.message : String(e),
        });
        voiceClientDiag('warn', 'voice.client:switch_camera_fallback_toggle', {
          err: e instanceof Error ? e.message : String(e),
        });
        await setCameraEnabled(false);
        if (actions.getUserWantsLocalCamera()) {
          await setCameraEnabled(true);
        }
      }
    })();
  }

  async function setVideoQuality(preset: VideoQualityPreset) {
    videoQuality.value = preset;
    const room = lkRoom.value;
    if (!room) return;
    if (!actions.getUserWantsLocalCamera()) return;
    if (!isCameraEnabled.value) return;
    try {
      await setCameraEnabled(false);
    } catch (e) {
      voiceClientDiag(
        'error',
        'voice.client:setVideoQuality_stopCamera_failed',
        {
          err: formatVoiceClientError(e),
        },
      );
      return;
    }
    if (!actions.getUserWantsLocalCamera()) return;
    await setCameraEnabled(true);
  }

  function setDesktopStreamingPreferences(
    patch: Partial<typeof desktopStreamingPreferences.value>,
  ) {
    desktopStreamingPreferences.value = {
      ...desktopStreamingPreferences.value,
      ...patch,
    };
    persistDesktopStreamingPreferences(desktopStreamingPreferences.value);
  }

  async function startDesktopScreenShare(
    patch?: Partial<typeof desktopStreamingPreferences.value>,
  ): Promise<void> {
    if (patch) setDesktopStreamingPreferences(patch);
    const prefs = desktopStreamingPreferences.value;
    await startScreenShare({
      quality: prefs.screenQuality,
      audio: prefs.screenIncludeAudio,
      contentHint: prefs.screenContentHint,
    });
  }

  async function startDesktopCameraStream(
    patch?: Partial<typeof desktopStreamingPreferences.value>,
  ): Promise<void> {
    if (patch) setDesktopStreamingPreferences(patch);
    const prefs = desktopStreamingPreferences.value;
    await setVideoQuality(prefs.cameraQuality);
    await setCameraEnabled(true);
  }

  async function switchMicDevice(deviceId: string) {
    const room = lkRoom.value;
    if (!room) return;
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      const normalized =
        !deviceId?.trim() || deviceId === 'default' ? null : deviceId;
      try {
        await setDesktopAudioInputDevice(normalized);
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:desktop_switchMicDevice_failed', {
          err: formatVoiceClientError(e),
        });
      }
    }
    if (!deviceId?.trim() || deviceId === 'default') {
      actions.refreshLocalMicLevelMonitor(room);
      actions.applyLocalMicGain(room);
      return;
    }
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      await actions.attachMicSendProcessorIfNeeded(room);
      actions.refreshLocalMicLevelMonitor(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:switchMicDevice_failed', {
        err: formatVoiceClientError(e),
      });
    }
  }

  async function switchSpeakerDevice(deviceId: string) {
    const room = lkRoom.value;
    if (!room) return;
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      const normalized =
        !deviceId?.trim() || deviceId === 'default' ? null : deviceId;
      try {
        await setDesktopAudioOutputDevice(normalized);
      } catch (e) {
        voiceClientDiag(
          'warn',
          'voice.client:desktop_switchSpeakerDevice_failed',
          {
            err: formatVoiceClientError(e),
          },
        );
      }
    }
    if (!echoSyncCapabilities.browser.isAudioOutputDeviceSelectionAvailable)
      return;
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:switchSpeakerDevice_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function setOutputVolume(volumePercent: number) {
    const room = lkRoom.value;
    if (!room) return;
    lastOutputVolumePercent.value = Math.max(0, Math.min(600, volumePercent));
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      void setDesktopAudioOutputVolume(
        lastOutputVolumePercent.value / 100,
      ).catch((e) => {
        voiceClientDiag('warn', 'voice.client:desktop_setOutputVolume_failed', {
          err: formatVoiceClientError(e),
        });
      });
    }
    actions.applyRemoteOutputGainToRoom(room);
  }

  function setLocalInputVolume(volumePercent: number) {
    const room = lkRoom.value;
    if (!room) return;
    lastInputVolumePercent.value = Math.max(0, Math.min(600, volumePercent));
    actions.applyLocalMicGain(room);
  }

  return {
    setCameraEnabled,
    setScreenShareEnabled,
    startScreenShare,
    stopScreenShare,
    getLocalScreenTrack,
    getLocalCameraTrack,
    switchCamera,
    setVideoQuality,
    setDesktopStreamingPreferences,
    startDesktopScreenShare,
    startDesktopCameraStream,
    switchMicDevice,
    switchSpeakerDevice,
    setOutputVolume,
    setLocalInputVolume,
  };
}

export type MediaControls = ReturnType<typeof createMediaControls>;
