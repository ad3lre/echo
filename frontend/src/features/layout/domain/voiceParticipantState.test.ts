import { describe, expect, it } from 'vitest';
import { canonicalVoiceParticipantIdsForLiveKitRoom } from './voiceParticipantState';

describe('canonicalVoiceParticipantIdsForLiveKitRoom', () => {
  it('returns echo ids unchanged when not connected', () => {
    expect(
      canonicalVoiceParticipantIdsForLiveKitRoom(['a', 'ghost'], {
        remoteIdentities: ['a', 'b'],
        currentUserId: 'me',
        liveKitConnected: false,
        channelMatches: true,
      }),
    ).toEqual(['a', 'ghost']);
  });

  it('keeps the Echo roster and adds LiveKit-only remotes', () => {
    expect(
      canonicalVoiceParticipantIdsForLiveKitRoom(['stale', 'u1'], {
        remoteIdentities: ['u1', 'u2'],
        currentUserId: 'me',
        liveKitConnected: true,
        channelMatches: true,
      }),
    ).toEqual(['stale', 'u1', 'u2']);
  });

  it('adds remotes when echo list is empty', () => {
    expect(
      canonicalVoiceParticipantIdsForLiveKitRoom([], {
        remoteIdentities: ['remote-a'],
        currentUserId: 'me',
        liveKitConnected: true,
        channelMatches: true,
      }),
    ).toEqual(['remote-a']);
  });

  it('keeps echo roster when LiveKit has no remotes yet (bootstrap / sync)', () => {
    expect(
      canonicalVoiceParticipantIdsForLiveKitRoom(['u1', 'u2'], {
        remoteIdentities: [],
        currentUserId: 'u2',
        liveKitConnected: true,
        channelMatches: true,
      }),
    ).toEqual(['u1', 'u2']);
  });

  it('does not collapse Echo rows while LiveKit is still catching up', () => {
    expect(
      canonicalVoiceParticipantIdsForLiveKitRoom(['pending-peer'], {
        remoteIdentities: ['remote-a'],
        currentUserId: 'me',
        liveKitConnected: true,
        channelMatches: true,
      }),
    ).toEqual(['pending-peer', 'remote-a']);
  });
});
