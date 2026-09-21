import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import { createRoomEventsController } from './roomEvents';
import type { LiveKitVoiceSessionContext } from './context';

vi.mock('livekit-client', () => {
  const RoomEvent = {
    Reconnecting: 'Reconnecting',
    Reconnected: 'Reconnected',
    Connected: 'Connected',
    ParticipantEncryptionStatusChanged: 'ParticipantEncryptionStatusChanged',
    Disconnected: 'Disconnected',
    DataReceived: 'DataReceived',
    ParticipantConnected: 'ParticipantConnected',
    ParticipantDisconnected: 'ParticipantDisconnected',
    TrackSubscribed: 'TrackSubscribed',
    TrackUnsubscribed: 'TrackUnsubscribed',
    TrackPublished: 'TrackPublished',
    TrackUnpublished: 'TrackUnpublished',
    TrackMuted: 'TrackMuted',
    TrackUnmuted: 'TrackUnmuted',
    AudioPlaybackStatusChanged: 'AudioPlaybackStatusChanged',
    ConnectionStateChanged: 'ConnectionStateChanged',
    LocalTrackPublished: 'LocalTrackPublished',
    LocalTrackUnpublished: 'LocalTrackUnpublished',
  };
  return {
    ConnectionState: { Connected: 'connected' },
    DisconnectReason: { CLIENT_INITIATED: 'client_initiated' },
    RoomEvent,
  };
});

function makeContext(oldRoom: object) {
  const teardownRoomSession = vi.fn();
  const ctx = {
    connectGeneration: ref(1),
    connectInFlight: ref(false),
    lkRoom: shallowRef(oldRoom),
    roomState: ref('connected'),
    isCameraEnabled: ref(false),
    isScreenShareEnabled: ref(false),
    vcDeafenedInternal: ref(false),
    lastOutputVolumePercent: ref(100),
    viewerLeaveSoundAt: new Map(),
    dataHandlers: {},
    opts: { onRemoteParticipantDisconnected: vi.fn() },
    actions: {
      applyRemoteOutputGainToRoom: vi.fn(),
      applyRemoteOutputGainToTrack: vi.fn(),
      announceLocalVcPublic: vi.fn(),
      applyLocalMicGain: vi.fn(),
      attachMicSendProcessorIfNeeded: vi.fn(async () => {}),
      dumpLiveKitDomAudioElements: vi.fn(),
      installMlsSenderKeyForParticipant: vi.fn(async () => {}),
      notifyStreamerViewerLeftStream: vi.fn(),
      onParticipantConnectedWhileDeafened: vi.fn(),
      reapplyRemotePlaybackGains: vi.fn(),
      refreshLocalMicLevelMonitor: vi.fn(),
      setupActiveSpeakerTracking: vi.fn(),
      startStatsPolling: vi.fn(),
      stopStatsPolling: vi.fn(),
      syncRemoteParticipants: vi.fn(),
      teardownSpeakerTracking: vi.fn(),
      teardownRoomSession,
    },
  } as unknown as LiveKitVoiceSessionContext;
  return { ctx, teardownRoomSession };
}

describe('createRoomEventsController', () => {
  it('ignores disconnects from a room superseded by a newer session', () => {
    const oldRoom = new (class {
      handlers = new Map<string, ((...args: unknown[]) => void)[]>();
      state = 'connected';
      localParticipant = { identity: 'self' };
      remoteParticipants = new Map();
      on(event: string, handler: (...args: unknown[]) => void) {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
      }
      emit(event: string, ...args: unknown[]) {
        for (const handler of this.handlers.get(event) ?? []) handler(...args);
      }
    })();
    const { ctx, teardownRoomSession } = makeContext(oldRoom);
    const controller = createRoomEventsController(ctx);
    controller.attachRoomEventHandlers(oldRoom as never);

    ctx.connectGeneration.value = 2;
    ctx.lkRoom.value = {} as never;
    oldRoom.emit('Disconnected', 'network');

    expect(teardownRoomSession).not.toHaveBeenCalled();
  });
});
