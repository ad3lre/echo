import { describe, expect, it } from 'vitest';
import {
  VoiceE2eeEnvelopeMissingError,
  assertMayCreateVoiceE2eeEpoch,
} from './voiceE2eePrepare';

describe('voiceE2eePrepare epoch rotation guard', () => {
  it('allows epoch create when no active epoch', () => {
    expect(() =>
      assertMayCreateVoiceE2eeEpoch(
        { epochId: null, roomName: null, createdByUserId: null, envelopes: [] },
        'user-a',
      ),
    ).not.toThrow();
  });

  it('allows creator to rotate when they have no envelope', () => {
    expect(() =>
      assertMayCreateVoiceE2eeEpoch(
        {
          epochId: 'epoch-1',
          roomName: 'r',
          createdByUserId: 'user-a',
          envelopes: [],
        },
        'user-a',
      ),
    ).not.toThrow();
  });

  it('allows non-creator to supersede when active epoch has no envelopes', () => {
    // An empty-envelope epoch means the creator had no addressable peers at
    // join time (no registered E2EE devices). Any participant may supersede it
    // so they can include themselves and distribute a key to the full roster.
    expect(() =>
      assertMayCreateVoiceE2eeEpoch(
        {
          epochId: 'epoch-1',
          roomName: 'r',
          createdByUserId: 'user-a',
          envelopes: [],
        },
        'user-b',
      ),
    ).not.toThrow();
  });

  it('blocks non-creator when envelopes exist but not for this device', () => {
    expect(() =>
      assertMayCreateVoiceE2eeEpoch(
        {
          epochId: 'epoch-1',
          roomName: 'r',
          createdByUserId: 'user-a',
          envelopes: [
            {
              recipientUserId: 'user-b',
              recipientDeviceId: 'other-device',
              ciphertext: 'x',
            },
          ],
        },
        'user-b',
      ),
    ).toThrow(VoiceE2eeEnvelopeMissingError);
  });
});
