// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const adapterMocks = vi.hoisted(() => ({
  setAudioTrackVolumeIfSupported: vi.fn(),
  getRtcStatsReportIfSupported: vi.fn(async () => null),
  getSenderStatsIfSupported: vi.fn(async () => null),
  parseOutboundVideoRtpStats: vi.fn(() => ({})),
  parseRtcStatsReport: vi.fn(() => ({
    latencyMs: 0,
    jitterMs: 0,
    packetLossPct: 0,
    bitrateKbps: 0,
    codec: 'Opus',
  })),
}));

vi.mock('@/services/livekit/livekitTrackAdapter', () => ({
  setAudioTrackVolumeIfSupported: adapterMocks.setAudioTrackVolumeIfSupported,
  getRtcStatsReportIfSupported: adapterMocks.getRtcStatsReportIfSupported,
  getSenderStatsIfSupported: adapterMocks.getSenderStatsIfSupported,
  parseOutboundVideoRtpStats: adapterMocks.parseOutboundVideoRtpStats,
  parseRtcStatsReport: adapterMocks.parseRtcStatsReport,
}));

import { useLiveKitVoiceRoom } from './useLiveKitVoiceRoom';

type FakeTrack = { sid: string };
type FakePublication = { track: FakeTrack };
type FakeRemoteParticipant = {
  identity: string;
  audioTrackPublications: Map<string, FakePublication>;
};

function buildRoomWithRemoteAudioTracks() {
  const aliceTrack: FakeTrack = { sid: 'track-alice' };
  const bobTrack: FakeTrack = { sid: 'track-bob' };
  const aliceParticipant: FakeRemoteParticipant = {
    identity: 'alice',
    audioTrackPublications: new Map([['pub-alice', { track: aliceTrack }]]),
  };
  const bobParticipant: FakeRemoteParticipant = {
    identity: 'bob',
    audioTrackPublications: new Map([['pub-bob', { track: bobTrack }]]),
  };
  const room = {
    remoteParticipants: new Map<string, FakeRemoteParticipant>([
      ['sid-alice', aliceParticipant],
      ['sid-bob', bobParticipant],
    ]),
  };
  return { room, aliceTrack, bobTrack };
}

describe('useLiveKitVoiceRoom per-participant output gain routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    adapterMocks.setAudioTrackVolumeIfSupported.mockReset();
  });

  it('applies slider changes only to targeted participant track', () => {
    const api = useLiveKitVoiceRoom();
    const { room, aliceTrack, bobTrack } = buildRoomWithRemoteAudioTracks();
    api.lkRoom.value = room as never;

    api.setRemoteParticipantVolume('alice', 35);

    expect(adapterMocks.setAudioTrackVolumeIfSupported).toHaveBeenCalledTimes(
      1,
    );
    expect(adapterMocks.setAudioTrackVolumeIfSupported).toHaveBeenCalledWith(
      aliceTrack,
      0.35,
    );
    expect(
      adapterMocks.setAudioTrackVolumeIfSupported,
    ).not.toHaveBeenCalledWith(bobTrack, expect.any(Number));
  });

  it('mutes and restores only targeted participant on slider 0 -> >0', () => {
    const api = useLiveKitVoiceRoom();
    const { room, aliceTrack, bobTrack } = buildRoomWithRemoteAudioTracks();
    api.lkRoom.value = room as never;

    api.setRemoteParticipantVolume('alice', 0);
    expect(
      adapterMocks.setAudioTrackVolumeIfSupported,
    ).toHaveBeenLastCalledWith(aliceTrack, 0);
    expect(
      adapterMocks.setAudioTrackVolumeIfSupported,
    ).not.toHaveBeenLastCalledWith(bobTrack, expect.any(Number));

    api.setRemoteParticipantVolume('alice', 80);
    expect(
      adapterMocks.setAudioTrackVolumeIfSupported,
    ).toHaveBeenLastCalledWith(aliceTrack, 0.8);
    expect(
      adapterMocks.setAudioTrackVolumeIfSupported,
    ).not.toHaveBeenLastCalledWith(bobTrack, expect.any(Number));
  });

  it('applies gain to remote video publication when MediaStream carries muxed audio', () => {
    adapterMocks.setAudioTrackVolumeIfSupported.mockReset();

    const videoTrack = {
      sid: 'vid-1',
      mediaStream: {
        getAudioTracks: () => [{ readyState: 'live' }],
      },
    };
    const participant = {
      identity: 'carol',
      audioTrackPublications: new Map(),
      trackPublications: new Map([
        [
          'pub-v1',
          {
            kind: 'video',
            track: videoTrack,
          },
        ],
      ]),
    };
    const room = {
      remoteParticipants: new Map([['sid-carol', participant]]),
    };

    const api = useLiveKitVoiceRoom();
    api.lkRoom.value = room as never;
    api.setRemoteParticipantVolume('carol', 50);

    expect(adapterMocks.setAudioTrackVolumeIfSupported).toHaveBeenCalledWith(
      videoTrack,
      0.5,
    );
  });

  it('does not treat ended muxed audio as active (skips video publication)', () => {
    adapterMocks.setAudioTrackVolumeIfSupported.mockReset();

    const videoTrack = {
      sid: 'vid-2',
      mediaStream: {
        getAudioTracks: () => [{ readyState: 'ended' }],
      },
    };
    const participant = {
      identity: 'dave',
      audioTrackPublications: new Map(),
      trackPublications: new Map([
        [
          'pub-v2',
          {
            kind: 'video',
            track: videoTrack,
          },
        ],
      ]),
    };
    const room = {
      remoteParticipants: new Map([['sid-dave', participant]]),
    };

    const api = useLiveKitVoiceRoom();
    api.lkRoom.value = room as never;
    api.setRemoteParticipantVolume('dave', 50);

    expect(adapterMocks.setAudioTrackVolumeIfSupported).not.toHaveBeenCalled();
  });

  it('applies video mux gain when muxed audio exists but readyState is not yet live', () => {
    adapterMocks.setAudioTrackVolumeIfSupported.mockReset();

    const videoTrack = {
      sid: 'vid-3',
      mediaStream: {
        getAudioTracks: () => [{ readyState: 'new' }],
      },
    };
    const participant = {
      identity: 'erin',
      audioTrackPublications: new Map(),
      trackPublications: new Map([
        [
          'pub-v3',
          {
            kind: 'video',
            track: videoTrack,
          },
        ],
      ]),
    };
    const room = {
      remoteParticipants: new Map([['sid-erin', participant]]),
    };

    const api = useLiveKitVoiceRoom();
    api.lkRoom.value = room as never;
    api.setRemoteParticipantVolume('erin', 60);

    expect(adapterMocks.setAudioTrackVolumeIfSupported).toHaveBeenCalledWith(
      videoTrack,
      0.6,
    );
  });
});
