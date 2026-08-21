import { describe, expect, it } from 'vitest';
import { buildYoutubeActivityPayload } from '@/features/voice/youtubeWatchTogetherBridge';
import { emptyWatchTogetherUiFields } from '@/features/voice/vcActivityTypes';

describe('buildYoutubeActivityPayload', () => {
  it('uses codenames phase without legacy external room URL field', () => {
    const p = buildYoutubeActivityPayload(
      {
        phase: 'codenames',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
        ...emptyWatchTogetherUiFields(),
      },
      { userId: 'u1' },
    );
    expect(p.activityPhase).toBe('codenames');
    expect('codenamesRoomUrl' in p).toBe(false);
  });
});
