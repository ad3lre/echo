import { describe, it, expect } from 'vitest';
import type { ChannelCategory } from '@/composables/useChannels';
import {
  buildEchoWorkspaceState,
  buildServerMemberNicknameMapFromMembersByServer,
  mergeEchoWorkspaceMembersIntoUsers,
  normalizeWorkspaceMembersByServer,
  deriveTimeoutUntilByServerUser,
  normalizeUpcomingEventsByServer,
  normalizeMyEventRsvps,
} from '../workspaceEchoApiSnapshot';
import type { EchoServerMemberDto } from '@/api/echo/types';

describe('workspaceEchoApiSnapshot', () => {
  it('buildEchoWorkspaceState trims fields and leaves empty imageUrl when icon missing', () => {
    const servers = [
      {
        id: 's1',
        name: 'S1',
        iconUrl: '  ',
        bannerUrl: '',
        ownerId: 'o1',
        vanityCode: ' vc ',
        description: ' desc ',
        tags: [' Gaming ', 'friends'],
      },
    ];
    const catsByServer: Record<string, ChannelCategory[]> = { s1: [] };
    const out = buildEchoWorkspaceState(servers as never, catsByServer, 'me');
    expect(out.servers.length).toBe(1);
    expect(out.servers[0].imageUrl).toBe('');
    expect(out.servers[0].vanityCode).toBe('vc');
    expect(out.servers[0].description).toBe('desc');
    expect(out.servers[0].tags).toEqual(['gaming', 'friends']);
    expect(out.serverMemberIds['s1']).toEqual(['me']);
    expect(out.workspaceVersion).toBe('0');
    expect(out.upcomingEventsByServerId).toEqual({});
    expect(out.myEventRsvps).toEqual([]);
  });

  it('normalizeWorkspaceMembersByServer accepts snake_case member rows', () => {
    const servers = [{ id: 'srv' }];
    const raw = {
      srv: [{ user_id: 'u1', display_name: 'Pat', avatar_url: 'https://a' }],
    };
    const out = normalizeWorkspaceMembersByServer(raw, servers);
    expect(out.srv).toEqual([
      {
        userId: 'u1',
        name: 'Pat',
        pfp: 'https://a',
        isDiscordShadow: false,
        bio: '',
        bannerImage: '',
        bannerColor: '',
        bannerRefractionEnabled: false,
        bannerBlurEnabled: false,
        bannerBlackoutEnabled: false,
      },
    ]);
  });

  it('buildEchoWorkspaceState uses membersByServer when provided', () => {
    const servers = [
      { id: 's1', name: 'S1', iconUrl: '', bannerUrl: '', ownerId: 'o1' },
    ];
    const catsByServer: Record<string, ChannelCategory[]> = { s1: [] };
    const membersByServer = {
      s1: [
        { userId: 'u2', name: 'Other', pfp: 'https://x' },
        { userId: 'me', name: 'Me', pfp: '' },
      ],
    };
    const out = buildEchoWorkspaceState(
      servers as never,
      catsByServer,
      'me',
      '42',
      membersByServer,
    );
    expect(out.serverMemberIds['s1']).toEqual(['u2', 'me']);
    expect(out.membersByServer).toBe(membersByServer);
    expect(out.workspaceVersion).toBe('42');
  });

  it('normalizes upcoming events and my RSVPs from loose JSON', () => {
    const upcoming = normalizeUpcomingEventsByServer({
      s1: [
        {
          id: 'e1',
          server_id: 's1',
          title: 'Meet',
          starts_at: '2030-01-01T18:00:00.000Z',
          ends_at: '2030-01-01T20:00:00.000Z',
          going_count: 3,
        },
      ],
    });
    expect(upcoming.s1?.[0]?.title).toBe('Meet');
    expect(upcoming.s1?.[0]?.goingCount).toBe(3);
    const mine = normalizeMyEventRsvps([
      {
        id: 'e1',
        server_id: 's1',
        server_name: 'Guild',
        title: 'Meet',
        starts_at: '2030-01-01T18:00:00.000Z',
        ends_at: '2030-01-01T20:00:00.000Z',
      },
    ]);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.serverName).toBe('Guild');
  });

  it('normalizeWorkspaceMembersByServer preserves communication timeout fields', () => {
    const servers = [{ id: 'srv' }];
    const raw = {
      srv: [
        {
          user_id: 'u1',
          display_name: 'Pat',
          avatar_url: 'https://a',
          communication_timeout_until: '2030-01-01T00:00:00.000Z',
        },
      ],
    };
    const out = normalizeWorkspaceMembersByServer(raw, servers);
    expect(out.srv).toEqual([
      {
        userId: 'u1',
        name: 'Pat',
        pfp: 'https://a',
        isDiscordShadow: false,
        communicationTimeoutUntil: '2030-01-01T00:00:00.000Z',
        bio: '',
        bannerImage: '',
        bannerColor: '',
        bannerRefractionEnabled: false,
        bannerBlurEnabled: false,
        bannerBlackoutEnabled: false,
      },
    ]);
  });

  it('buildServerMemberNicknameMapFromMembersByServer maps only non-empty nicknames', () => {
    const membersByServer: Record<string, EchoServerMemberDto[]> = {
      s1: [
        {
          userId: 'u1',
          name: 'Shown',
          serverNickname: 'Nick',
          pfp: '',
        },
        {
          userId: 'u2',
          name: 'Plain',
          pfp: '',
        },
      ],
    };
    expect(
      buildServerMemberNicknameMapFromMembersByServer(membersByServer),
    ).toEqual({
      s1: { u1: 'Nick' },
    });
  });

  it('mergeEchoWorkspaceMembersIntoUsers merges profile banner from member DTOs', () => {
    const membersByServer: Record<string, EchoServerMemberDto[]> = {
      s1: [
        {
          userId: 'u1',
          name: 'A',
          pfp: 'https://p',
          bio: 'About me',
          bannerImage: 'https://b',
          bannerColor: 'linear-gradient(...)',
          bannerRefractionEnabled: true,
          bannerBlurEnabled: true,
          bannerBlackoutEnabled: false,
          bannerPositionY: 30,
        },
      ],
    };
    const out = mergeEchoWorkspaceMembersIntoUsers<{
      id: string;
      name: string;
      pfp: string;
      bannerImage?: string;
      bannerColor?: string;
      bannerRefractionEnabled?: boolean;
      bannerBlurEnabled?: boolean;
      bannerBlackoutEnabled?: boolean;
      bannerPositionY?: number;
      bio?: string;
    }>([], membersByServer);
    const u = out.find((x) => x.id === 'u1');
    expect(u?.bio).toBe('About me');
    expect(u?.bannerImage).toBe('https://b');
    expect(u?.bannerColor).toBe('linear-gradient(...)');
    expect(u?.bannerRefractionEnabled).toBe(true);
    expect(u?.bannerBlurEnabled).toBe(true);
    expect(u?.bannerBlackoutEnabled).toBe(false);
    expect(u?.bannerPositionY).toBe(30);
  });

  it('mergeEchoWorkspaceMembersIntoUsers prefers accountDisplayName over server display name', () => {
    const membersByServer: Record<string, EchoServerMemberDto[]> = {
      s1: [
        {
          userId: 'u1',
          name: 'GuildNickOrDisplay',
          accountDisplayName: 'Global Name',
          serverNickname: 'GuildNickOrDisplay',
          pfp: '',
        },
      ],
    };
    const out = mergeEchoWorkspaceMembersIntoUsers<{
      id: string;
      name: string;
      pfp: string;
    }>([], membersByServer);
    expect(out.find((u) => u.id === 'u1')?.name).toBe('Global Name');
  });

  it('deriveTimeoutUntilByServerUser maps future timeouts only', () => {
    const out = deriveTimeoutUntilByServerUser({
      s1: [
        {
          userId: 'u1',
          name: 'Pat',
          pfp: '',
          communicationTimeoutUntil: '2030-01-01T00:00:00.000Z',
        },
        {
          userId: 'u2',
          name: 'Lee',
          pfp: '',
          communicationTimeoutUntil: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(out.s1?.u1).toBe(Date.parse('2030-01-01T00:00:00.000Z'));
    expect(out.s1?.u2).toBeUndefined();
  });
});
