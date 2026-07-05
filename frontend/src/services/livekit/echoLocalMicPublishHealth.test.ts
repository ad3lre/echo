import { describe, expect, it } from 'vitest';
import type { Room as LKRoom } from 'livekit-client';
import { isLocalMicPublicationLive } from '@/services/livekit/echoLocalMicPublishHealth';
import { LK_SOURCE_MICROPHONE } from '@/services/livekit/livekitTrackDuckTypes';

function mockRoom(pub: { isMuted: boolean } | null): LKRoom {
  return {
    localParticipant: {
      getTrackPublication: (source: unknown) =>
        source === LK_SOURCE_MICROPHONE ? pub : null,
    },
  } as unknown as LKRoom;
}

describe('isLocalMicPublicationLive', () => {
  it('returns false when no mic publication exists', () => {
    expect(isLocalMicPublicationLive(mockRoom(null))).toBe(false);
  });

  it('returns false when mic publication is muted', () => {
    expect(isLocalMicPublicationLive(mockRoom({ isMuted: true }))).toBe(false);
  });

  it('returns true when mic publication is present and unmuted', () => {
    expect(isLocalMicPublicationLive(mockRoom({ isMuted: false }))).toBe(true);
  });
});
