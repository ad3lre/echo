import { describe, expect, it } from 'vitest';
import { buildGuildVoiceActivityCardsForJoinedServers } from '@/features/layout/buildGuildVoiceActivityCards';
import type { Server } from '@shared/types';

describe('buildGuildVoiceActivityCardsForJoinedServers', () => {
  const servers: Server[] = [
    {
      id: 'srv-a',
      name: 'Alpha',
      imageUrl: 'https://example.com/a.png',
    },
    {
      id: 'echo',
      name: 'Echo',
      imageUrl: '',
    },
    {
      id: 'srv-b',
      name: 'Beta',
      imageUrl: '',
    },
  ];

  it('skips echo home and aggregates multiple guilds, sorted by participant count', () => {
    const cards = buildGuildVoiceActivityCardsForJoinedServers({
      joinedServers: servers,
      categoriesByServer: {
        'srv-a': [
          {
            channels: [
              {
                id: 'vc-quiet',
                name: 'quiet',
                type: 'voice',
                voiceParticipantIds: ['u1'],
              },
            ],
          },
        ],
        'srv-b': [
          {
            channels: [
              {
                id: 'vc-main',
                name: 'General',
                type: 'voice',
                voiceParticipantIds: ['u2', 'u3', 'u4'],
              },
            ],
          },
        ],
      },
      roster: [
        { id: 'u1', pfp: 'p1' },
        { id: 'u2', pfp: '' },
        { id: 'u3', pfp: 'p3' },
      ],
      getChannelDisplayName: (n) => `#${n}`,
      resolveCallTileAvatarUrl: (pfp, uid) =>
        pfp ? `avatar:${pfp}` : `fallback:${uid}`,
    });

    expect(cards.map((c) => c.channelId)).toEqual(['vc-main', 'vc-quiet']);
    expect(cards[0]!.serverId).toBe('srv-b');
    expect(cards[0]!.participantCount).toBe(3);
    expect(cards[0]!.serverName).toBe('Beta');
    expect(cards[1]!.channelDisplayName).toBe('#quiet');
    expect(cards[1]!.serverImageUrl).toBe('https://example.com/a.png');
  });

  it('returns empty when no voice participants', () => {
    expect(
      buildGuildVoiceActivityCardsForJoinedServers({
        joinedServers: [servers[0]!],
        categoriesByServer: {
          'srv-a': [
            {
              channels: [
                {
                  id: 'vc-empty',
                  name: 'empty',
                  type: 'voice',
                  voiceParticipantIds: [],
                },
              ],
            },
          ],
        },
        roster: [],
        getChannelDisplayName: (n) => n,
        resolveCallTileAvatarUrl: (_p, uid) => uid,
      }),
    ).toEqual([]);
  });
});
