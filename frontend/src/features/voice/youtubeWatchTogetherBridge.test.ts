import { describe, expect, it } from 'vitest';
import {
  buildYoutubeActivityPayload,
  shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl,
} from '@/features/voice/youtubeWatchTogetherBridge';
import { normalizeCodenamesRoomUrlForEmbed } from '@/features/voice/vcActivityTypes';

describe('normalizeCodenamesRoomUrlForEmbed', () => {
  it('accepts apex and www hosts with paths, query, and hash', () => {
    expect(
      normalizeCodenamesRoomUrlForEmbed(
        'https://codenames.game/room/abc?x=1#frag',
      ),
    ).toBe('https://codenames.game/room/abc?x=1#frag');
    expect(
      normalizeCodenamesRoomUrlForEmbed('https://www.codenames.game/foo/bar'),
    ).toBe('https://www.codenames.game/foo/bar');
  });

  it('adds https when scheme omitted', () => {
    expect(normalizeCodenamesRoomUrlForEmbed('codenames.game/r/x')).toBe(
      'https://codenames.game/r/x',
    );
  });

  it('rejects non-codenames hosts and http', () => {
    expect(
      normalizeCodenamesRoomUrlForEmbed('https://evil.com/codenames.game'),
    ).toBeNull();
    expect(
      normalizeCodenamesRoomUrlForEmbed('http://codenames.game/'),
    ).toBeNull();
  });
});

describe('shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl', () => {
  const room = 'https://codenames.game/room/test';

  it('returns false when message is newer than last applied', () => {
    expect(
      shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl({
        msgUpdatedAt: 200,
        lastAppliedUpdatedAt: 100,
        msg: { activityPhase: 'codenames', codenamesRoomUrl: room },
        local: { phase: 'codenames', codenamesRoomUrl: null },
      }),
    ).toBe(false);
  });

  it('returns true for stale timestamp when joiner lacks URL and message carries room', () => {
    expect(
      shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl({
        msgUpdatedAt: 50,
        lastAppliedUpdatedAt: 100,
        msg: { activityPhase: 'codenames', codenamesRoomUrl: room },
        local: { phase: 'codenames', codenamesRoomUrl: null },
      }),
    ).toBe(true);
  });

  it('returns false when local already has a room URL', () => {
    expect(
      shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl({
        msgUpdatedAt: 50,
        lastAppliedUpdatedAt: 100,
        msg: { activityPhase: 'codenames', codenamesRoomUrl: room },
        local: { phase: 'codenames', codenamesRoomUrl: room },
      }),
    ).toBe(false);
  });

  it('returns false when local phase is not codenames', () => {
    expect(
      shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl({
        msgUpdatedAt: 50,
        lastAppliedUpdatedAt: 100,
        msg: { activityPhase: 'codenames', codenamesRoomUrl: room },
        local: { phase: 'youtube', codenamesRoomUrl: null },
      }),
    ).toBe(false);
  });
});

describe('buildYoutubeActivityPayload codenames', () => {
  it('includes normalized room URL when set', () => {
    const p = buildYoutubeActivityPayload(
      {
        phase: 'codenames',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
        codenamesRoomUrl: 'https://codenames.game/room/z',
      },
      { userId: 'u1' },
    );
    expect(p.activityPhase).toBe('codenames');
    expect(p.codenamesRoomUrl).toBe('https://codenames.game/room/z');
  });
});
