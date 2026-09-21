import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import { createConnectController } from './connect';
import type { LiveKitVoiceSessionContext } from './context';

const roomControl = vi.hoisted(() => ({
  connect: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
}));

vi.mock('livekit-client', () => {
  class MockRoom {
    localParticipant = {
      identity: 'self',
      getTrackPublication: vi.fn(() => undefined),
      setMicrophoneEnabled: vi.fn(async () => {}),
    };
    remoteParticipants = new Map();
    name = 'test-room';
    state = 'connected';

    async connect(url: string, token: string): Promise<void> {
      await roomControl.connect(this, url, token);
    }

    async disconnect(): Promise<void> {}

    on(): void {}

    async startAudio(): Promise<void> {}
  }

  return {
    AudioPresets: { musicHighQuality: {} },
    ExternalE2EEKeyProvider: class {},
    Room: MockRoom,
  };
});

vi.mock('@/platform/desktopBridge', () => ({
  DESKTOP_NATIVE_AUDIO_ENABLED: false,
  initDesktopNativeAudio: vi.fn(async () => {}),
  isDesktop: () => false,
}));

function makeContext() {
  const clearLocalVoiceUiState = vi.fn();
  const ctx = {
    lkRoom: shallowRef(null),
    roomState: ref('idle'),
    krispSessionFailed: ref(false),
    connectInFlight: ref(false),
    connectGeneration: ref(0),
    connectAbortTarget: shallowRef(null),
    liveKitE2eeWorker: shallowRef(null),
    liveKitMlsKeyProvider: shallowRef(null),
    lastVcAudioOpts: ref({ muted: false, deafened: false }),
    vcDeafenedInternal: ref(false),
    localMicMonitor: { ensureAudioContextRunning: vi.fn(async () => {}) },
    actions: {
      attachMicSendProcessorIfNeeded: vi.fn(async () => {}),
      dumpLiveKitDomAudioElements: vi.fn(),
      dumpRemoteAudioTrackState: vi.fn(() => []),
      reapplyRemotePlaybackGains: vi.fn(),
      refreshLocalMicLevelMonitor: vi.fn(),
      startAudioHealthPolling: vi.fn(),
      startStatsPolling: vi.fn(),
    },
  } as unknown as LiveKitVoiceSessionContext;
  return { ctx, clearLocalVoiceUiState };
}

describe('createConnectController', () => {
  it('rejects transport failures and exposes an error state to callers', async () => {
    roomControl.connect.mockReset();
    const error = new Error('transport failed');
    roomControl.connect.mockRejectedValueOnce(error);
    const { ctx, clearLocalVoiceUiState } = makeContext();
    const controller = createConnectController(ctx, () => {}, {
      muteRemoteParticipantsForDeafen: vi.fn(async () => {}),
      syncRemoteParticipants: vi.fn(),
      clearLocalVoiceUiState,
      registerTabCleanup: vi.fn(),
      registerMediaRecovery: vi.fn(),
    });

    await expect(
      controller.connect('wss://voice.example', 'token'),
    ).rejects.toBe(error);
    expect(ctx.roomState.value).toBe('error');
    expect(clearLocalVoiceUiState).toHaveBeenCalledOnce();
    expect(ctx.connectInFlight.value).toBe(false);
  });

  it('supersedes an in-flight join instead of silently resolving the newer one', async () => {
    roomControl.connect.mockReset();
    let releaseFirst!: () => void;
    const firstConnect = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    roomControl.connect
      .mockImplementationOnce(() => firstConnect)
      .mockImplementation(async () => {});
    const { ctx } = makeContext();
    const controller = createConnectController(ctx, () => {}, {
      muteRemoteParticipantsForDeafen: vi.fn(async () => {}),
      syncRemoteParticipants: vi.fn(),
      clearLocalVoiceUiState: vi.fn(),
      registerTabCleanup: vi.fn(),
      registerMediaRecovery: vi.fn(),
    });

    const first = controller.connect('wss://voice.example/a', 'token-a');
    await vi.waitFor(() => expect(roomControl.connect).toHaveBeenCalledOnce());
    const second = controller.connect('wss://voice.example/b', 'token-b');

    await expect(second).resolves.toBeUndefined();
    expect(ctx.roomState.value).toBe('connected');
    releaseFirst();
    await expect(first).rejects.toMatchObject({
      name: 'VoiceConnectSupersededError',
    });
  });
});
