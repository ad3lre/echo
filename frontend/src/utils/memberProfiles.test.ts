import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildExpandedProfile,
  buildMemberProfile,
  buildSelfMemberProfileForShell,
  sessionUserDisplayName,
  sessionUserToShellCurrentUserSummary,
  canCreateChannelsInServer,
  canManageMockMemberRoles,
  canManageMockServerSettings,
  canModerateMember,
  getHighestRoleForMember,
  getMockAssignableRolesForServer,
  getPopoutAnchorRect,
  getRolesForMember,
  hasModerationPowers,
  pickEchoMemberListSectionRole,
  pickHighestEchoCatalogRole,
  pickHighestMemberRole,
  roleHierarchyDisplayRank,
  lookupServerMemberJoinedAtIso,
  getMemberSinceLeadText,
  isGuildMemberProfileContext,
  MEMBER_PROFILE_DM_SERVER_LABEL,
  type EchoCatalogRole,
  type MemberRole,
} from './memberProfiles';

beforeAll(() => {
  if (
    typeof (globalThis as unknown as { HTMLElement?: typeof HTMLElement })
      .HTMLElement === 'undefined'
  ) {
    (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
      function HTMLElement() {} as unknown as typeof HTMLElement;
  }
});

describe('pickHighestMemberRole', () => {
  it('returns fallback when empty', () => {
    const r = pickHighestMemberRole([]);
    expect(r.name).toBe('Member');
  });

  it('picks lowest index in ROLE_HIERARCHY', () => {
    const roles: MemberRole[] = [
      { id: '1', name: 'Member', color: '' },
      { id: '2', name: 'Admin', color: '' },
    ];
    expect(pickHighestMemberRole(roles).name).toBe('Admin');
  });
});

describe('getRolesForMember', () => {
  it('uses override when provided', () => {
    const o = { srv: { u9: [{ id: 'x', name: 'Helper', color: '' }] } };
    expect(getRolesForMember('srv', 'u9', o)[0]!.name).toBe('Helper');
  });

  it('falls back to static map for quantum u1', () => {
    const roles = getRolesForMember('quantum', 'u1', null);
    expect(roles.some((r) => r.name === 'Founder')).toBe(true);
  });

  it('returns generic Member for unknown server', () => {
    const roles = getRolesForMember('unknown-srv', 'u1', null);
    expect(roles[0]!.name).toBe('Member');
  });
});

describe('permission helpers', () => {
  it('getHighestRoleForMember resolves Founder for quantum u1', () => {
    expect(getHighestRoleForMember('quantum', 'u1').name).toBe('Founder');
  });

  it('canCreateChannelsInServer respects owner option', () => {
    expect(
      canCreateChannelsInServer('quantum', 'u9', { serverOwnerId: 'u9' }),
    ).toBe(true);
    expect(canCreateChannelsInServer('echo', 'u1')).toBe(false);
  });

  it('hasModerationPowers false for echo', () => {
    expect(hasModerationPowers('echo', 'u1')).toBe(false);
  });

  it('canModerateMember compares hierarchy', () => {
    expect(canModerateMember('quantum', 'u1', 'u2')).toBe(true);
    expect(canModerateMember('quantum', 'u2', 'u1')).toBe(false);
    expect(canModerateMember('quantum', 'u1', 'u1')).toBe(false);
  });

  it('canManageMockMemberRoles / canManageMockServerSettings', () => {
    expect(canManageMockMemberRoles('quantum', 'u1')).toBe(true);
    expect(canManageMockServerSettings('quantum', 'u1')).toBe(true);
  });
});

describe('Echo catalog pickers', () => {
  const catalog: EchoCatalogRole[] = [
    {
      id: 'e',
      name: '@everyone',
      color: '#fff',
      position: 0,
      isEveryone: true,
    },
    { id: 'a', name: 'Mod', color: '#f00', position: 5, hoist: true },
    { id: 'b', name: 'Admin', color: '#00f', position: 10, hoist: true },
  ];

  it('pickEchoMemberListSectionRole uses top hoisted by position', () => {
    const r = pickEchoMemberListSectionRole(['a', 'b'], catalog);
    expect(r.name).toBe('Admin');
  });

  it('pickEchoMemberListSectionRole returns Members when nothing hoisted', () => {
    const flat: EchoCatalogRole[] = [
      { id: 'x', name: 'X', color: '', position: 1 },
    ];
    const r = pickEchoMemberListSectionRole(['x'], flat);
    expect(r.name).toBe('Members');
    expect(r.isUnhoistedBucket).toBe(true);
  });

  it('hoisted role does NOT have isUnhoistedBucket', () => {
    const r = pickEchoMemberListSectionRole(['b'], catalog);
    expect(r.name).toBe('Admin');
    expect(r.isUnhoistedBucket).toBeUndefined();
  });

  it('isUnhoistedBucket forces section to sort last regardless of listSortKey', () => {
    const admin: MemberRole = {
      id: 'admin',
      name: 'Admin',
      color: '#00f',
      listSortKey: 10,
    };
    const mod: MemberRole = {
      id: 'mod',
      name: 'Mod',
      color: '#f00',
      listSortKey: 5,
    };
    const members: MemberRole = {
      id: '__echo_unhoisted__',
      name: 'Members',
      color: '#94a3b8',
      listSortKey: -1,
      isUnhoistedBucket: true,
    };
    const renamedEveryone: MemberRole = {
      id: 'ev',
      name: 'Everyone',
      color: '#aaa',
      listSortKey: 0,
      isUnhoistedBucket: true,
    };

    const sections = [members, admin, renamedEveryone, mod].sort((a, b) => {
      const ua = !!a.isUnhoistedBucket;
      const ub = !!b.isUnhoistedBucket;
      if (ua !== ub) return ua ? 1 : -1;
      const ka = a.listSortKey ?? 0;
      const kb = b.listSortKey ?? 0;
      if (kb !== ka) return kb - ka;
      return a.id.localeCompare(b.id);
    });
    expect(sections.map((s) => s.name)).toEqual([
      'Admin',
      'Mod',
      'Everyone',
      'Members',
    ]);
  });

  it('pickHighestEchoCatalogRole maps everyone to Member', () => {
    expect(pickHighestEchoCatalogRole([], catalog).name).toBe('Member');
    expect(pickHighestEchoCatalogRole(['a', 'b'], catalog).name).toBe('Admin');
  });
});

describe('roleHierarchyDisplayRank', () => {
  it('prefers Echo position when provided', () => {
    expect(roleHierarchyDisplayRank('Z', 99)).toBe(99);
    expect(roleHierarchyDisplayRank('Z', 1)).toBe(1);
  });

  it('uses ROLE_HIERARCHY when position omitted', () => {
    expect(roleHierarchyDisplayRank('Admin')).toBeGreaterThan(
      roleHierarchyDisplayRank('Member'),
    );
    expect(roleHierarchyDisplayRank('UnknownRole')).toBe(0);
  });
});

describe('getMockAssignableRolesForServer', () => {
  it('returns single Member for unknown server', () => {
    expect(getMockAssignableRolesForServer('nope')).toHaveLength(1);
  });

  it('returns unique roles for known server', () => {
    const list = getMockAssignableRolesForServer('quantum');
    expect(list.length).toBeGreaterThan(1);
  });
});

describe('buildMemberProfile', () => {
  it('builds profile with roles and seed', () => {
    const p = buildMemberProfile(
      {
        id: 'u1',
        name: 'Alice',
        pfp: 'https://x.test/a.png',
        status: 'online',
      },
      'quantum',
      'Quantum',
    );
    expect(p.displayName).toBe('Alice');
    expect(p.serverName).toBe('Quantum');
    expect(p.roles.length).toBeGreaterThan(0);
  });

  it('prefers the provided username over deriving one from display name', () => {
    const p = buildMemberProfile(
      {
        id: 'u1',
        name: 'Alice Display',
        username: 'alice_handle',
        pfp: 'https://x.test/a.png',
        status: 'online',
      },
      'quantum',
      'Quantum',
    );
    expect(p.displayName).toBe('Alice Display');
    expect(p.username).toBe('alice_handle');
  });

  it('does not invent a member-since date when server join is unknown', () => {
    const p = buildMemberProfile(
      {
        id: 'real-user-not-in-demo-seeds',
        name: 'Pat',
        pfp: '',
        status: 'online',
      },
      'quantum',
      'Quantum',
    );
    expect(p.joinedAt).toBe('');
  });

  it('formats member-since from workspace joinedAt ISO when provided', () => {
    const p = buildMemberProfile(
      {
        id: 'real-user-not-in-demo-seeds',
        name: 'Pat',
        pfp: '',
        status: 'online',
      },
      'quantum',
      'Quantum',
      { memberJoinedAtIso: '2024-03-01T00:00:00.000Z' },
    );
    expect(p.joinedAt).toMatch(/2024/);
    expect(p.joinedAt).toMatch(/Mar/);
  });

  it('passes through workspace profile badges', () => {
    const p = buildMemberProfile(
      {
        id: 'x',
        name: 'Pat',
        pfp: '',
        status: 'online',
        badges: ['og'],
      },
      'quantum',
      'Quantum',
    );
    expect(p.badges).toEqual(['og']);
  });

  it('stores guild icon URL only for real guild profile context', () => {
    const icon = 'https://cdn.discordapp.com/icons/123/abc.png';
    const guild = buildMemberProfile(
      { id: 'u1', name: 'A', pfp: '', status: 'online' },
      's1',
      'Quantum',
      { serverImageUrl: icon },
    );
    expect(guild.serverImageUrl).toBe(icon);
    const dm = buildMemberProfile(
      { id: 'u1', name: 'A', pfp: '', status: 'online' },
      'echo',
      MEMBER_PROFILE_DM_SERVER_LABEL,
      { serverImageUrl: icon },
    );
    expect(dm.serverImageUrl).toBeUndefined();
  });
});

describe('sessionUserDisplayName', () => {
  it('uses username when displayName is missing or empty', () => {
    expect(sessionUserDisplayName(undefined, 'u')).toBe('u');
    expect(sessionUserDisplayName('', 'u')).toBe('u');
  });

  it('uses displayName when set', () => {
    expect(sessionUserDisplayName('D', 'u')).toBe('D');
  });

  it('keeps whitespace-only displayName (callers may .trim() afterward)', () => {
    expect(sessionUserDisplayName('   ', 'u')).toBe('   ');
  });
});

describe('sessionUserToShellCurrentUserSummary', () => {
  it('returns undefined when there is no user', () => {
    expect(sessionUserToShellCurrentUserSummary(null)).toBeUndefined();
  });

  it('prefers displayName over username', () => {
    expect(
      sessionUserToShellCurrentUserSummary({
        id: '1',
        displayName: 'A',
        username: 'b',
        pfp: 'x',
      }),
    ).toEqual({ id: '1', name: 'A', pfp: 'x' });
  });

  it('falls back to username when displayName is empty', () => {
    expect(
      sessionUserToShellCurrentUserSummary({
        id: '1',
        displayName: '',
        username: 'b',
        pfp: '',
      }),
    ).toEqual({ id: '1', name: 'b', pfp: '' });
  });

  it('uses the live status override when provided', () => {
    expect(
      sessionUserToShellCurrentUserSummary(
        {
          id: '1',
          displayName: 'A',
          username: 'b',
          pfp: 'x',
          status: 'online',
        },
        'idle',
      ),
    ).toEqual({ id: '1', name: 'A', pfp: 'x', status: 'idle' });
  });
});

describe('lookupServerMemberJoinedAtIso', () => {
  it('returns joinedAt for a server member row', () => {
    const iso = '2024-03-01T00:00:00.000Z';
    expect(
      lookupServerMemberJoinedAtIso('srv', 'u1', {
        srv: [{ userId: 'u1', name: 'A', pfp: '', joinedAt: iso }],
      }),
    ).toBe(iso);
  });

  it('returns undefined for DM / echo pseudo-server', () => {
    expect(
      lookupServerMemberJoinedAtIso('echo', 'u1', {
        srv: [{ userId: 'u1', name: 'A', pfp: '', joinedAt: 'x' }],
      }),
    ).toBeUndefined();
  });
});

describe('getMemberSinceLeadText / isGuildMemberProfileContext', () => {
  it('uses guild wording for real server names', () => {
    expect(isGuildMemberProfileContext('Quantum')).toBe(true);
    expect(getMemberSinceLeadText('Quantum')).toBe('Member in Quantum since');
  });

  it('uses generic wording for DM / empty label', () => {
    expect(isGuildMemberProfileContext(MEMBER_PROFILE_DM_SERVER_LABEL)).toBe(
      false,
    );
    expect(getMemberSinceLeadText(MEMBER_PROFILE_DM_SERVER_LABEL)).toBe(
      'Member since',
    );
    expect(isGuildMemberProfileContext('')).toBe(false);
    expect(getMemberSinceLeadText('')).toBe('Member since');
    expect(isGuildMemberProfileContext('   ')).toBe(false);
  });
});

describe('buildSelfMemberProfileForShell', () => {
  it('returns null when there is no session user', () => {
    expect(buildSelfMemberProfileForShell(null, { id: 's1', name: 'S' })).toBe(
      null,
    );
  });

  it('uses echo / Direct Messages when no server is selected', () => {
    const p = buildSelfMemberProfileForShell(
      {
        id: 'u1',
        displayName: 'Me',
        username: 'me',
        pfp: '',
        status: 'online',
      },
      undefined,
    );
    expect(p?.serverName).toBe('Direct Messages');
  });

  it('matches buildMemberProfile for the same display fields', () => {
    const user = {
      id: 'u1',
      displayName: 'Alice',
      username: 'alice',
      pfp: 'https://x.test/a.png',
      status: 'online' as const,
    };
    const direct = buildMemberProfile(
      { id: user.id, name: 'Alice', pfp: user.pfp, status: 'online' },
      'quantum',
      'Quantum',
    );
    const via = buildSelfMemberProfileForShell(user, {
      id: 'quantum',
      name: 'Quantum',
    });
    expect(via?.displayName).toBe(direct.displayName);
    expect(via?.serverName).toBe(direct.serverName);
  });

  it('prefers the live status override when provided', () => {
    const via = buildSelfMemberProfileForShell(
      {
        id: 'u1',
        displayName: 'Alice',
        username: 'alice',
        pfp: '',
        status: 'online',
      },
      { id: 'quantum', name: 'Quantum' },
      'idle',
    );
    expect(via?.status).toBe('idle');
  });
});

describe('buildExpandedProfile', () => {
  it('computes mutual servers and friends', () => {
    const base = buildMemberProfile(
      { id: 'u2', name: 'Bob', pfp: '', status: 'offline' },
      'quantum',
      'Quantum',
    );
    const expanded = buildExpandedProfile(base, 'u1', {
      servers: [{ id: 'quantum', name: 'Q', imageUrl: '' }],
      users: [
        { id: 'u1', name: 'Me', pfp: '' },
        { id: 'u2', name: 'Bob', pfp: '' },
        { id: 'u3', name: 'Carl', pfp: '' },
      ],
      serverMemberIds: { quantum: ['u1', 'u2'], other: ['u1', 'u2'] },
      friendIdsByUserId: { u1: ['u2', 'u3'], u2: ['u1', 'u3'] },
    });
    expect(expanded.mutualFriends.some((f) => f.id === 'u3')).toBe(true);
    expect(expanded.mutualServers.some((s) => s.id === 'quantum')).toBe(true);
  });

  it('preserves mutual friend usernames when provided', () => {
    const base = buildMemberProfile(
      {
        id: 'u2',
        name: 'Bob Display',
        username: 'bob_handle',
        pfp: '',
        status: 'offline',
      },
      'quantum',
      'Quantum',
    );
    const expanded = buildExpandedProfile(base, 'u1', {
      servers: [{ id: 'quantum', name: 'Q', imageUrl: '' }],
      users: [
        { id: 'u1', name: 'Me', username: 'me_handle', pfp: '' },
        { id: 'u2', name: 'Bob Display', username: 'bob_handle', pfp: '' },
        { id: 'u3', name: 'Carl Display', username: 'carl_handle', pfp: '' },
      ],
      serverMemberIds: { quantum: ['u1', 'u2'], other: ['u1', 'u2'] },
      friendIdsByUserId: { u1: ['u2', 'u3'], u2: ['u1', 'u3'] },
    });
    expect(expanded.mutualFriends.find((f) => f.id === 'u3')?.username).toBe(
      'carl_handle',
    );
  });
});

describe('getPopoutAnchorRect', () => {
  it('returns null for null target', () => {
    expect(getPopoutAnchorRect(null)).toBe(null);
  });
});
