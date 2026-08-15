import { describe, expect, it } from 'vitest';
import { toMessageReactionFanoutPayload } from './messageReactionsWire';
import { toMessageCreateFanoutPayload } from './messageCreateWire';
import type { Message, MessageReaction } from './types/message';

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function syntheticWorkspaceMember(userId: string, full: boolean) {
  const base = {
    userId,
    name: `Member ${userId.slice(-4)}`,
    accountDisplayName: `Account ${userId.slice(-4)}`,
    serverNickname: 'nick',
    username: `user_${userId.slice(-6)}`,
    pfp: 'https://cdn.example/avatars/a.webp',
    isGuest: false,
    communicationTimeoutUntil: null as string | null,
    joinedAt: '2024-06-01T12:00:00.000Z',
    signupOrdinal: 42,
    badges: ['og'],
    timeZone: 'America/New_York',
  };
  if (!full) return base;
  return {
    ...base,
    bannerImage: 'https://cdn.example/banners/wide.webp',
    bannerColor: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    bannerRefractionEnabled: true,
    bannerBlurEnabled: false,
    bannerBlackoutEnabled: true,
    bannerPositionY: 35,
    bio: 'Long profile bio with links https://example.com and several sentences of filler text.',
  };
}

function syntheticWorkspacePayload(memberCount: number, fullMembers: boolean) {
  const members = Array.from({ length: memberCount }, (_, i) =>
    syntheticWorkspaceMember(`usr_${String(i).padStart(5, '0')}`, fullMembers),
  );
  return {
    servers: [{ id: 'srv_1', name: 'Test Guild', imageUrl: '', ownerId: 'u0' }],
    categoriesByServer: {
      srv_1: [
        {
          id: 'cat_1',
          name: 'General',
          position: 0,
          channels: [
            {
              id: 'ch_1',
              name: 'chat',
              type: 'text',
              position: 0,
            },
          ],
        },
      ],
    },
    membersByServer: { srv_1: members },
    workspaceVersion: '1700000000000',
    upcomingEventsByServerId: {},
    myEventRsvps: [],
  };
}

function syntheticReactionBroadcast(reactorCount: number): MessageReaction[] {
  return [
    {
      emoji: '👍',
      count: reactorCount,
      userIds: Array.from({ length: reactorCount }, (_, i) => `u_${i}`),
      firstReactionAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

describe('networkPayloadEstimate', () => {
  it('reports workspace roster vs full member profile savings', () => {
    const memberCount = 2_000;
    const full = jsonBytes(syntheticWorkspacePayload(memberCount, true));
    const roster = jsonBytes(syntheticWorkspacePayload(memberCount, false));
    const savingsPct = Math.round((1 - roster / full) * 100);
    expect(roster).toBeLessThan(full);
    expect(savingsPct).toBeGreaterThan(15);
    // eslint-disable-next-line no-console -- intentional benchmark output
    console.info(
      `[payload-bench] workspace ${memberCount} members: full=${full}B roster=${roster}B (−${savingsPct}%)`,
    );
  });

  it('reports reaction fan-out savings for popular messages', () => {
    const reactorCount = 500;
    const full = jsonBytes(syntheticReactionBroadcast(reactorCount));
    const fanout = jsonBytes(
      toMessageReactionFanoutPayload(syntheticReactionBroadcast(reactorCount)),
    );
    const savingsPct = Math.round((1 - fanout / full) * 100);
    expect(fanout).toBeLessThan(full);
    expect(savingsPct).toBeGreaterThan(90);
    // eslint-disable-next-line no-console -- intentional benchmark output
    console.info(
      `[payload-bench] reactions ${reactorCount} reactors: full=${full}B fanout=${fanout}B (−${savingsPct}%)`,
    );
  });

  it('reports message create fan-out savings when TipTap JSON is omitted', () => {
    const tipTap = {
      type: 'doc',
      content: Array.from({ length: 40 }, (_, i) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `Sentence ${i} `.repeat(12) }],
      })),
    };
    const full: Message = {
      id: 'm1',
      channelId: 'c1',
      authorId: 'u1',
      content: 'plain',
      contentText: 'plain',
      contentJson: tipTap,
      contentSchemaVersion: 3,
      messageFormatVersion: 2,
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const slim = toMessageCreateFanoutPayload(full);
    const fullBytes = jsonBytes(full);
    const slimBytes = jsonBytes(slim);
    const savingsPct = Math.round((1 - slimBytes / fullBytes) * 100);
    expect(slimBytes).toBeLessThan(fullBytes);
    expect(savingsPct).toBeGreaterThan(50);
    // eslint-disable-next-line no-console -- intentional benchmark output
    console.info(
      `[payload-bench] message create TipTap: full=${fullBytes}B slim=${slimBytes}B (−${savingsPct}%)`,
    );
  });
});
