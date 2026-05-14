import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutVoiceScreenShareHandlers } from './useAppLayoutVoiceScreenShareHandlers';

const isDesktopMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop: () => isDesktopMock(),
}));

describe('useAppLayoutVoiceScreenShareHandlers', () => {
  beforeEach(() => {
    isDesktopMock.mockReturnValue(true);
  });

  it('opens desktop modal for screen-share toggle on desktop', () => {
    const modalOpen = ref(false);
    const mode = ref<'screen' | 'camera'>('camera');
    const handlers = useAppLayoutVoiceScreenShareHandlers({
      vcVideo: ref(false),
      vcScreenshare: ref(false),
      isScreenSharePickerOpen: ref(false),
      isDesktopStreamingControlOpen: modalOpen,
      desktopStreamingControlMode: mode,
      desktopStreamingPreferences: ref({
        screenQuality: '720p30',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '720p',
      }),
      setDesktopStreamingPreferences: vi.fn(),
      startVcScreenShare: vi.fn(),
      startDesktopScreenShare: vi.fn(),
      startDesktopCameraStream: vi.fn(),
      onDesktopCameraStarted: vi.fn(),
      stopVcScreenShare: vi.fn(),
    });

    handlers.handleToggleScreenshare();

    expect(modalOpen.value).toBe(true);
    expect(mode.value).toBe('screen');
  });

  it('maps desktop confirm payload to camera start and callback', async () => {
    const setPrefs = vi.fn();
    const startDesktopCamera = vi.fn(async () => undefined);
    const onDesktopCameraStarted = vi.fn();
    const open = ref(true);
    const handlers = useAppLayoutVoiceScreenShareHandlers({
      vcVideo: ref(false),
      vcScreenshare: ref(false),
      isScreenSharePickerOpen: ref(false),
      isDesktopStreamingControlOpen: open,
      desktopStreamingControlMode: ref<'screen' | 'camera'>('camera'),
      desktopStreamingPreferences: ref({
        screenQuality: '720p30',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '720p',
      }),
      setDesktopStreamingPreferences: setPrefs,
      startVcScreenShare: vi.fn(),
      startDesktopScreenShare: vi.fn(),
      startDesktopCameraStream: startDesktopCamera,
      onDesktopCameraStarted,
      stopVcScreenShare: vi.fn(),
    });

    await handlers.handleDesktopStreamingControlConfirm({
      mode: 'camera',
      settings: {
        screenQuality: '1080p60',
        screenContentHint: 'motion',
        screenIncludeAudio: false,
        cameraQuality: '480p',
      },
    });

    expect(setPrefs).toHaveBeenCalledWith({
      screenQuality: '1080p60',
      screenContentHint: 'motion',
      screenIncludeAudio: false,
      cameraQuality: '480p',
    });
    expect(startDesktopCamera).toHaveBeenCalled();
    expect(onDesktopCameraStarted).toHaveBeenCalledTimes(1);
    expect(open.value).toBe(false);
  });

  it('maps desktop confirm payload to screen-share start', async () => {
    const startDesktopScreenShare = vi.fn(async () => undefined);
    const handlers = useAppLayoutVoiceScreenShareHandlers({
      vcVideo: ref(false),
      vcScreenshare: ref(false),
      isScreenSharePickerOpen: ref(false),
      isDesktopStreamingControlOpen: ref(true),
      desktopStreamingControlMode: ref<'screen' | 'camera'>('screen'),
      desktopStreamingPreferences: ref({
        screenQuality: '720p30',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '720p',
      }),
      setDesktopStreamingPreferences: vi.fn(),
      startVcScreenShare: vi.fn(),
      startDesktopScreenShare,
      startDesktopCameraStream: vi.fn(),
      onDesktopCameraStarted: vi.fn(),
      stopVcScreenShare: vi.fn(),
    });

    await handlers.handleDesktopStreamingControlConfirm({
      mode: 'screen',
      settings: {
        screenQuality: '720p15',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '360p',
      },
    });

    expect(startDesktopScreenShare).toHaveBeenCalledWith({
      screenQuality: '720p15',
      screenContentHint: 'detail',
      screenIncludeAudio: true,
      cameraQuality: '360p',
    });
  });
});
