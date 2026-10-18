import { describe, expect, it } from 'vitest';
import { ECHO_VOICE_KEYRING_SIZE } from '@/services/voice/e2ee/echoParticipantKeyProvider';

function keyIndexForRotation(rotation: number): number {
  const size = ECHO_VOICE_KEYRING_SIZE;
  return ((rotation % size) + size) % size;
}

describe('voice media key keyring', () => {
  it('maps rotation counters into the keyring', () => {
    expect(keyIndexForRotation(0)).toBe(0);
    expect(keyIndexForRotation(ECHO_VOICE_KEYRING_SIZE)).toBe(0);
    expect(keyIndexForRotation(ECHO_VOICE_KEYRING_SIZE + 3)).toBe(3);
    expect(keyIndexForRotation(-1)).toBe(ECHO_VOICE_KEYRING_SIZE - 1);
  });
});
