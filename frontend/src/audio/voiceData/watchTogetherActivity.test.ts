import { describe, expect, it } from 'vitest';
import {
  decodeEchoWatchTogetherActivity,
  encodeEchoWatchTogetherActivity,
  type EchoWatchTogetherActivityV1,
} from '@/audio/voiceData/watchTogetherActivity';

describe('watchTogetherActivity codec', () => {
  const sample = (): EchoWatchTogetherActivityV1 => ({
    v: 1,
    t: 'watch_together_activity',
    updatedAt: 1_700_000_000_000,
    fromUserId: 'user-1',
    fromName: 'Host',
    sessionId: 'sess-abc',
    activityPhase: 'watch_together',
    sessionStarted: true,
    playlist: [
      {
        id: 'pl-1',
        storageKey: 'uploads/vc/foo.mp4',
        sourcePublicUrl: 'https://echo.example/uploads/vc/foo.mp4',
        hlsManifestUrl: 'https://echo.example/uploads/vc/foo/index.m3u8',
        title: 'clip.mp4',
        transcodeStatus: 'ready',
        byteLength: 1024,
      },
    ],
    currentIndex: 0,
    browseOpen: false,
    wtPlayback: {
      playing: true,
      mediaTimeSec: 12.5,
      wallMs: 1_700_000_000_100,
    },
  });

  it('round-trips through encode/decode', () => {
    const raw = encodeEchoWatchTogetherActivity(sample());
    const decoded = decodeEchoWatchTogetherActivity(raw);
    expect(decoded).toEqual(sample());
  });

  it('rejects unknown activity type', () => {
    const bad = encodeEchoWatchTogetherActivity({
      ...sample(),
      t: 'youtube_activity' as 'watch_together_activity',
    });
    expect(decodeEchoWatchTogetherActivity(bad)).toBeNull();
  });
});
