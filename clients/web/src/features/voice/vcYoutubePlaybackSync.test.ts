import { describe, expect, it } from 'vitest';
import {
  shouldReconcileYoutubePlayer,
  youtubeEffectivePositionSec,
  youtubePlaybackForPublish,
  type VcYoutubePlaybackSnapshot,
} from '@/features/voice/vcYoutubePlaybackSync';

const base: VcYoutubePlaybackSnapshot = {
  videoId: 'abcdefghijk',
  status: 'playing',
  positionSec: 10,
  playbackRate: 1,
  capturedAt: 1_000,
  updatedAt: 1_000,
};

describe('vcYoutubePlaybackSync', () => {
  it('advances playing position from receiver-local captured time', () => {
    expect(youtubeEffectivePositionSec(base, 3_500)).toBe(12.5);
  });

  it('does not advance paused or buffering positions', () => {
    expect(
      youtubeEffectivePositionSec({ ...base, status: 'paused' }, 3_500),
    ).toBe(10);
    expect(
      youtubeEffectivePositionSec({ ...base, status: 'buffering' }, 3_500),
    ).toBe(10);
  });

  it('normalizes snapshots before late-join publish', () => {
    expect(youtubePlaybackForPublish(base, 4_000)).toMatchObject({
      videoId: 'abcdefghijk',
      status: 'playing',
      positionSec: 13,
      capturedAt: 4_000,
    });
  });

  it('reconciles meaningful drift, status, and rate changes', () => {
    expect(
      shouldReconcileYoutubePlayer({
        desired: base,
        actualVideoId: 'abcdefghijk',
        actualStatus: 'playing',
        actualPositionSec: 12.6,
        actualPlaybackRate: 1,
        nowMs: 3_500,
      }),
    ).toBe(false);

    expect(
      shouldReconcileYoutubePlayer({
        desired: base,
        actualVideoId: 'abcdefghijk',
        actualStatus: 'paused',
        actualPositionSec: 12.5,
        actualPlaybackRate: 1,
        nowMs: 3_500,
      }),
    ).toBe(true);

    expect(
      shouldReconcileYoutubePlayer({
        desired: base,
        actualVideoId: 'abcdefghijk',
        actualStatus: 'playing',
        actualPositionSec: 20,
        actualPlaybackRate: 1.5,
        nowMs: 3_500,
      }),
    ).toBe(true);
  });
});
