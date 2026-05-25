import { describe, expect, it } from 'vitest';
import {
  findEchoVoiceChannelIdContainingUserOnServer,
  resolveEchoServerIdContainingChannel,
} from './resolveEchoServerIdForGuildChannel';

const SERVER_A = '550e8400-e29b-41d4-a716-446655440000';
const SERVER_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const VOICE_CH = '7c9deb10-9dad-11d1-80b4-00c04fd430c8';

describe('resolveEchoServerIdContainingChannel', () => {
  it('returns the server id that owns the channel', () => {
    expect(
      resolveEchoServerIdContainingChannel(VOICE_CH, {
        [SERVER_A]: [
          {
            id: 'cat-a',
            name: 'c',
            channels: [{ id: VOICE_CH, name: 'vc', type: 'voice' as const }],
          },
        ],
        [SERVER_B]: [
          {
            id: 'cat-b',
            name: 'c2',
            channels: [{ id: 'other', name: 't', type: 'text' as const }],
          },
        ],
      }),
    ).toBe(SERVER_A);
  });

  it('returns empty when channel is missing or id is blank', () => {
    expect(resolveEchoServerIdContainingChannel('', {})).toBe('');
    expect(resolveEchoServerIdContainingChannel('x', {})).toBe('');
  });

  it('ignores non-graph server keys', () => {
    expect(
      resolveEchoServerIdContainingChannel(VOICE_CH, {
        echo: [
          {
            id: 'cat-echo',
            name: 'c',
            channels: [{ id: VOICE_CH, name: 'vc', type: 'voice' as const }],
          },
        ],
      }),
    ).toBe('');
  });
});

describe('findEchoVoiceChannelIdContainingUserOnServer', () => {
  it('resolves stage channel membership', () => {
    expect(
      findEchoVoiceChannelIdContainingUserOnServer(SERVER_A, 'u1', {
        [SERVER_A]: [
          {
            id: 'cat-a',
            name: 'c',
            channels: [
              {
                id: 'stage-1',
                name: 'Town Hall',
                type: 'stage' as const,
                voiceParticipantIds: ['u1'],
              },
            ],
          },
        ],
      }),
    ).toBe('stage-1');
  });
});
