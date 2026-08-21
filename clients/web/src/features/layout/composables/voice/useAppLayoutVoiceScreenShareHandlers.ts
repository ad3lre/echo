import type { Ref } from 'vue';
import {
  ECHO_SCREEN_SHARE_USE_CONFIG_MODAL,
  SCREEN_SHARE_BROWSER_DEFAULTS,
} from '@/config/screenShareUi';
import { isDesktop } from '@/platform/desktopBridge';
import type { DesktopStreamingPreferences } from '@/features/voice/useLiveKitVoiceRoom';

export type VoiceScreenSharePickerOpts = {
  quality: '1080p60' | '720p30' | '720p15' | 'auto';
  audio: boolean;
  contentHint: 'motion' | 'detail';
};

export type DesktopStreamingControlConfirmPayload = {
  mode: 'screen' | 'camera';
  settings: DesktopStreamingPreferences;
};

export function useAppLayoutVoiceScreenShareHandlers(opts: {
  vcVideo: Ref<boolean>;
  vcScreenshare: Ref<boolean>;
  isScreenSharePickerOpen: Ref<boolean>;
  isDesktopStreamingControlOpen: Ref<boolean>;
  desktopStreamingControlMode: Ref<'screen' | 'camera'>;
  desktopStreamingPreferences: Ref<DesktopStreamingPreferences>;
  setDesktopStreamingPreferences: (
    patch: Partial<DesktopStreamingPreferences>,
  ) => void;
  startVcScreenShare: (o: VoiceScreenSharePickerOpts) => void | Promise<void>;
  startDesktopScreenShare: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => void | Promise<void>;
  startDesktopCameraStream: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => void | Promise<void>;
  onDesktopCameraStarted: () => void;
  stopVcScreenShare: () => void | Promise<void>;
}) {
  return {
    updateVcVideoIfAllowed: (enabled: boolean) => {
      opts.vcVideo.value = enabled;
    },
    handleScreenSharePickerConfirm: async (
      pickerOpts: VoiceScreenSharePickerOpts,
    ) => {
      opts.isScreenSharePickerOpen.value = false;
      await opts.startVcScreenShare(pickerOpts);
    },
    openDesktopStreamingControl: (mode: 'screen' | 'camera') => {
      if (!isDesktop()) return;
      opts.desktopStreamingControlMode.value = mode;
      opts.isDesktopStreamingControlOpen.value = true;
    },
    closeDesktopStreamingControl: () => {
      opts.isDesktopStreamingControlOpen.value = false;
    },
    handleDesktopStreamingControlConfirm: async (
      payload: DesktopStreamingControlConfirmPayload,
    ) => {
      opts.setDesktopStreamingPreferences(payload.settings);
      opts.isDesktopStreamingControlOpen.value = false;
      if (payload.mode === 'screen') {
        await opts.startDesktopScreenShare(payload.settings);
        return;
      }
      await opts.startDesktopCameraStream(payload.settings);
      opts.onDesktopCameraStarted();
    },
    handleToggleScreenshare: () => {
      if (opts.vcScreenshare.value) {
        void opts.stopVcScreenShare();
      } else if (isDesktop()) {
        opts.desktopStreamingControlMode.value = 'screen';
        opts.isDesktopStreamingControlOpen.value = true;
      } else if (ECHO_SCREEN_SHARE_USE_CONFIG_MODAL) {
        opts.isScreenSharePickerOpen.value = true;
      } else {
        void opts.startVcScreenShare(SCREEN_SHARE_BROWSER_DEFAULTS);
      }
    },
    handleStopScreenShare: () => {
      void opts.stopVcScreenShare();
    },
  };
}
