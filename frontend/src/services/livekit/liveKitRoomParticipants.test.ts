import { describe, expect, it } from 'vitest';
import { resolveLiveKitRemoteParticipantIdentity } from './liveKitRoomParticipants';

type MockRemoteParticipant = {
  sid: string;
  identity: string;
};

function mockRoom(participants: MockRemoteParticipant[]) {
  const remoteParticipants = new Map<string, MockRemoteParticipant>();
  for (const p of participants) {
    remoteParticipants.set(p.sid, p);
  }
  return {
    remoteParticipants,
  } as unknown as import('livekit-client').Room;
}

describe('resolveLiveKitRemoteParticipantIdentity', () => {
  it('returns matching identity when key is already identity', () => {
    const room = mockRoom([{ sid: 'PA_1', identity: 'user_a' }]);
    expect(resolveLiveKitRemoteParticipantIdentity(room, 'user_a')).toBe(
      'user_a',
    );
  });

  it('resolves identity from LiveKit SID keys', () => {
    const room = mockRoom([{ sid: 'PA_1', identity: 'user_a' }]);
    expect(resolveLiveKitRemoteParticipantIdentity(room, 'PA_1')).toBe(
      'user_a',
    );
  });

  it('normalizes whitespace around incoming keys', () => {
    const room = mockRoom([{ sid: 'PA_1', identity: 'user_a' }]);
    expect(resolveLiveKitRemoteParticipantIdentity(room, '  user_a  ')).toBe(
      'user_a',
    );
  });
});
