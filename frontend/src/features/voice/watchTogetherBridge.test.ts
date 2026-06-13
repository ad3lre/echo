import { describe, expect, it } from 'vitest';
import {
  buildWatchTogetherActivityPayload,
  shouldPublishWatchTogetherActivity,
  watchTogetherPayloadMatchesLocalUi,
} from '@/features/voice/watchTogetherBridge';
import { emptyWatchTogetherUiFields } from '@/features/voice/vcActivityTypes';

describe('watchTogetherBridge', () => {
  it('buildWatchTogetherActivityPayload omits playlist when not in phase', () => {
    const p = buildWatchTogetherActivityPayload(
      {
        phase: 'pick',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
        ...emptyWatchTogetherUiFields(),
      },
      { userId: 'u1' },
    );
    expect(p.activityPhase).toBe('pick');
    expect(p.playlist).toEqual([]);
    expect(p.sessionStarted).toBe(false);
  });

  it('watchTogetherPayloadMatchesLocalUi compares queue ids and transcode', () => {
    const local = {
      phase: 'watch_together' as const,
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
      ...emptyWatchTogetherUiFields(),
      watchTogetherSessionStarted: true,
      watchTogetherSessionId: 'sess-1',
      watchTogetherPlaylist: [
        {
          id: 'a',
          storageKey: 'k1',
          sourcePublicUrl: 'https://x/a',
          hlsManifestUrl: null,
          title: 'A',
          transcodeStatus: 'ready' as const,
          byteLength: 1,
        },
      ],
      watchTogetherCurrentIndex: 0,
      watchTogetherBrowseOpen: false,
    };
    const msg = buildWatchTogetherActivityPayload(local, { userId: 'u1' });
    expect(watchTogetherPayloadMatchesLocalUi(msg, local)).toBe(true);
    expect(
      watchTogetherPayloadMatchesLocalUi({ ...msg, currentIndex: 1 }, local),
    ).toBe(false);
    expect(
      watchTogetherPayloadMatchesLocalUi(
        {
          ...msg,
          playlist: [
            {
              ...local.watchTogetherPlaylist[0]!,
              transcodeStatus: 'processing',
            },
          ],
        },
        local,
      ),
    ).toBe(false);
  });

  it('shouldPublishWatchTogetherActivity allows host only', () => {
    const base = {
      phase: 'watch_together' as const,
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
      ...emptyWatchTogetherUiFields(),
      watchTogetherLobbyRole: 'host' as const,
    };
    expect(
      shouldPublishWatchTogetherActivity(base, {
        selfUserId: 'u1',
        syncKingUserId: null,
      }),
    ).toBe(true);
    expect(
      shouldPublishWatchTogetherActivity(
        { ...base, watchTogetherLobbyRole: 'follower' },
        { selfUserId: 'u1', syncKingUserId: null },
      ),
    ).toBe(false);
    expect(
      shouldPublishWatchTogetherActivity(base, {
        selfUserId: 'u1',
        syncKingUserId: 'other',
      }),
    ).toBe(false);
  });
});
