import { describe, expect, it } from 'vitest';
import { buildRemoteParticipantTrackInfoFromPublications } from './useLiveKitVoiceRoom';

type MockPublication = {
  source?: string;
  isMuted?: boolean;
  track?: {
    mediaStreamTrack?: {
      readyState?: string;
    };
  } | null;
};

describe('buildRemoteParticipantTrackInfoFromPublications', () => {
  it('clears camera enabled when camera publication is removed', () => {
    const cameraOn = buildRemoteParticipantTrackInfoFromPublications([
      {
        source: 'camera',
        track: {
          mediaStreamTrack: { readyState: 'live' },
        },
      } as MockPublication as any,
    ]);
    expect(cameraOn.isCameraEnabled).toBe(true);

    const cameraOff = buildRemoteParticipantTrackInfoFromPublications([]);
    expect(cameraOff.isCameraEnabled).toBe(false);
    expect(cameraOff.cameraTrack).toBeNull();
  });

  it('keeps camera enabled from publication presence even without subscribed track', () => {
    const remote = buildRemoteParticipantTrackInfoFromPublications([
      {
        source: 'camera',
        track: null,
      } as MockPublication as any,
    ]);
    expect(remote.isCameraEnabled).toBe(true);
    expect(remote.cameraTrack).toBeNull();
  });
});
