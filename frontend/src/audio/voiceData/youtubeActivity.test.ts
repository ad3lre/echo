import { describe, expect, it } from 'vitest';
import {
  decodeEchoYoutubeActivity,
  encodeEchoYoutubeActivity,
  type EchoYoutubeActivityV1,
} from '@/audio/voiceData/youtubeActivity';

describe('youtubeActivity codec', () => {
  const sample = (): EchoYoutubeActivityV1 => ({
    v: 1,
    t: 'youtube_activity',
    updatedAt: 1_700_000_000_000,
    fromUserId: 'user-1',
    activityPhase: 'youtube',
    playlist: [
      {
        id: 'abc12345678',
        title: 'Video',
        channelTitle: 'Channel',
        thumbnailUrl: null,
      },
    ],
    currentIndex: 0,
    youtubeBrowseOpen: false,
  });

  it('round-trips through encode/decode', () => {
    const raw = encodeEchoYoutubeActivity(sample());
    const decoded = decodeEchoYoutubeActivity(raw);
    expect(decoded).toEqual(sample());
  });

  it('skips invalid playlist rows instead of rejecting the whole message', () => {
    const raw = encodeEchoYoutubeActivity({
      ...sample(),
      playlist: [
        {
          id: 'abc12345678',
          title: 'Video',
          channelTitle: 'Channel',
          thumbnailUrl: null,
        },
        {
          id: 123,
          title: 'bad',
        } as unknown as EchoYoutubeActivityV1['playlist'][number],
      ],
    });
    const decoded = decodeEchoYoutubeActivity(raw);
    expect(decoded?.playlist).toHaveLength(1);
    expect(decoded?.playlist[0]?.id).toBe('abc12345678');
  });
});
