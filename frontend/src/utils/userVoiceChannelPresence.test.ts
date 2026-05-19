import { describe, expect, it } from 'vitest';
import { findUserVoicePresences } from './userVoiceChannelPresence';

describe('findUserVoicePresences', () => {
  it('returns empty for blank user id', () => {
    expect(
      findUserVoicePresences('  ', {
        categoriesByServer: { s1: [{ channels: [] }] },
        servers: [{ id: 's1', name: 'Guild' }],
      }),
    ).toEqual([]);
  });

  it('finds voice channel and prefers selected server first', () => {
    const categoriesByServer = {
      s1: [
        {
          channels: [
            {
              id: 'vc-a',
              name: 'Alpha',
              type: 'voice',
              voiceParticipantIds: ['u9'],
            },
          ],
        },
      ],
      s2: [
        {
          channels: [
            {
              id: 'vc-b',
              name: 'Beta',
              type: 'voice',
              voiceParticipantIds: ['u9'],
            },
          ],
        },
      ],
    };
    const servers = [
      { id: 's1', name: 'First' },
      {
        id: 's2',
        name: 'Second',
        bannerImageUrl: 'https://cdn.example/s2.jpg',
      },
    ];
    const users = [
      { id: 'u9', pfp: 'https://cdn.example/u9.png' },
      { id: 'u5', pfp: 'https://cdn.example/u5.png' },
    ];
    categoriesByServer.s2[0]!.channels[0]!.voiceParticipantIds = ['u9', 'u5'];
    const out = findUserVoicePresences('u9', {
      categoriesByServer,
      servers,
      users,
      preferServerId: 's2',
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      serverId: 's2',
      serverName: 'Second',
      serverBannerImageUrl: 'https://cdn.example/s2.jpg',
      channelId: 'vc-b',
      channelName: 'Beta',
      participantUserIds: ['u9', 'u5'],
      participantPfps: [
        'https://cdn.example/u9.png',
        'https://cdn.example/u5.png',
      ],
    });
  });

  it('ignores non-voice channels and echo server id', () => {
    const out = findUserVoicePresences('u1', {
      categoriesByServer: {
        echo: [
          {
            channels: [
              {
                id: 'x',
                name: 'nope',
                type: 'voice',
                voiceParticipantIds: ['u1'],
              },
            ],
          },
        ],
        s1: [
          {
            channels: [
              {
                id: 't1',
                name: 'text',
                type: 'text',
                voiceParticipantIds: ['u1'],
              },
              {
                id: 'v1',
                name: 'Lobby',
                type: 'voice',
                voiceParticipantIds: ['u1'],
              },
            ],
          },
        ],
      },
      servers: [{ id: 's1', name: 'G' }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.channelId).toBe('v1');
  });
});
