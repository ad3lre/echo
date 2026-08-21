import { describe, expect, it, vi } from 'vitest';
import type { ManagedRole } from '@/features/server-settings/types';
import type { EchoRoleCategoryDto } from '@/api/echo/types';
import {
  applyCategoryDefaultsToManagedRole,
  buildInitialManagedRoles,
  buildManagedRolesFromEcho,
  calculateRoleDiff,
  calculateRoleLinksDiff,
  calculateRoleOrderDiff,
  categoryDefaultsAreConfigured,
  cloneRoleManagerState,
  createManagedRole,
  defaultRolePermissions,
  mergeEchoRoleListPreservingLocalEdits,
  permissionsFromName,
  topEchoRoleIdForUserServerSettings,
} from './roleManagerState';

function role(overrides: Partial<ManagedRole> = {}): ManagedRole {
  return {
    id: 'role-1',
    name: 'Member',
    color: '#60a5fa',
    roleIconUrl: null,
    roleIconEmojiId: null,
    darkColor: '#60a5fa',
    lightColor: '#60a5fa',
    separateThemeColors: false,
    displaySeparately: false,
    defaultOnJoin: false,
    linkedRoles: [],
    mentionable: false,
    memberCount: 0,
    roleCategoryId: null,
    roleScope: 'category',
    syncWithCategoryDefaults: true,
    permissions: defaultRolePermissions(),
    storedEchoPermissions: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
    roleType: 'mixed',
    ...overrides,
  };
}

describe('role manager state domain', () => {
  it('derives starter permissions from role names', () => {
    expect(permissionsFromName('Server Owner').administrator).toBe(true);
    expect(
      Object.values(permissionsFromName('Server Owner')).every(Boolean),
    ).toBe(true);

    const admin = permissionsFromName('Admin');
    expect(admin.manageRoles).toBe(true);
    expect(admin.manageServer).toBe(false);
    expect(admin.administrator).toBe(true);

    const mod = permissionsFromName('Moderator');
    expect(mod.kickMembers).toBe(true);
    expect(mod.banMembers).toBe(false);

    const member = permissionsFromName('Member');
    expect(member.sendMessages).toBe(true);
    expect(member.manageMessages).toBe(false);
  });

  it('builds initial managed roles from cards or a fallback member role', () => {
    expect(buildInitialManagedRoles([])).toMatchObject([
      {
        id: 'role-member',
        name: 'Member',
        roleScope: 'category',
        roleType: 'mixed',
      },
    ]);

    expect(
      buildInitialManagedRoles([
        { id: 'r-admin', name: 'Admin', color: '#f00', count: 3 },
      ]),
    ).toMatchObject([
      {
        id: 'r-admin',
        darkColor: '#f00',
        lightColor: '#f00',
        displaySeparately: true,
        memberCount: 3,
        permissions: { administrator: true },
      },
    ]);
  });

  it('maps Echo role rows into UI roles with counts, links, and role type rules', () => {
    const roles = buildManagedRolesFromEcho(
      [
        {
          id: 'everyone',
          name: '@everyone',
          color: '#999999',
          position: 0,
          isEveryone: true,
          permissions: ['VIEW_CHANNEL'],
        },
        {
          id: 'admin',
          name: 'Admin',
          color: '#ff0000',
          darkColor: '#aa0000',
          lightColor: '#ffcccc',
          separateThemeColors: true,
          position: 10,
          hoist: true,
          defaultOnJoin: true,
          isEveryone: false,
          roleCategoryId: ' cat-a ',
          roleIconUrl: ' https://cdn/icon.png ',
          roleIconEmojiId: ' emoji-1 ',
          permissions: ['ADMINISTRATOR'],
          roleScope: 'global',
          roleType: 'authority',
          syncWithCategoryDefaults: false,
        },
        {
          id: 'visual',
          name: 'Color',
          color: '#00ff00',
          position: 5,
          isEveryone: false,
          permissions: ['MENTION_EVERYONE', 'SEND_MESSAGES'],
          roleType: 'visual',
        },
      ],
      { u1: ['admin'], u2: [], u3: ['visual', 'missing'] },
      [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
      [
        { anchorRoleId: 'admin', linkedRoleId: 'visual', twoWay: true },
        { anchorRoleId: 'admin', linkedRoleId: 'everyone', twoWay: false },
      ],
    );

    expect(roles.map((r) => r.id)).toEqual(['admin', 'visual', 'everyone']);
    expect(roles[0]).toMatchObject({
      memberCount: 1,
      roleCategoryId: 'cat-a',
      roleIconUrl: 'https://cdn/icon.png',
      roleIconEmojiId: 'emoji-1',
      displaySeparately: true,
      defaultOnJoin: true,
      roleScope: 'global',
      roleType: 'authority',
      syncWithCategoryDefaults: false,
      linkedRoles: [
        { linkedRoleId: 'visual', twoWay: true },
        { linkedRoleId: 'everyone', twoWay: false },
      ],
    });
    expect(Object.values(roles[0]!.permissions).every(Boolean)).toBe(true);
    expect(roles[1]!.permissions.mentionEveryone).toBe(true);
    expect(roles[1]!.permissions.sendMessages).toBe(false);
    expect(roles[2]!.memberCount).toBe(1);
  });

  it('resolves each user to the highest assigned Echo role or everyone fallback', () => {
    const ordered = [
      role({ id: 'admin', name: 'Admin' }),
      role({ id: 'mod', name: 'Mod' }),
      role({ id: 'everyone', name: '@everyone' }),
    ];
    expect(
      topEchoRoleIdForUserServerSettings(
        'u1',
        { u1: ['mod', 'admin'] },
        ordered,
      ),
    ).toBe('admin');
    expect(topEchoRoleIdForUserServerSettings('u2', {}, ordered)).toBe(
      'everyone',
    );
    expect(
      topEchoRoleIdForUserServerSettings('u3', { u3: ['ghost'] }, ordered),
    ).toBeNull();
  });

  it('applies category defaults into a managed role', () => {
    const managed = role({ permissions: permissionsFromName('Member') });
    expect(
      categoryDefaultsAreConfigured({
        defaultPermissions: [],
        defaultHoist: false,
        defaultOnJoin: false,
        defaultRoleScope: 'category',
        defaultRoleType: 'mixed',
      }),
    ).toBe(false);
    expect(
      categoryDefaultsAreConfigured({
        defaultPermissions: ['MANAGE_MESSAGES'],
        defaultHoist: false,
        defaultOnJoin: false,
        defaultRoleScope: 'category',
        defaultRoleType: 'mixed',
      }),
    ).toBe(true);

    applyCategoryDefaultsToManagedRole(managed, {
      id: 'cat-a',
      name: 'Mods',
      position: 0,
      defaultPermissions: ['ADMINISTRATOR'],
      defaultHoist: true,
      defaultOnJoin: true,
      defaultRoleScope: 'global',
      defaultRoleType: 'authority',
      selfAssignableDefaults: false,
    } as EchoRoleCategoryDto);

    expect(Object.values(managed.permissions).every(Boolean)).toBe(true);
    expect(managed).toMatchObject({
      displaySeparately: true,
      defaultOnJoin: true,
      roleScope: 'global',
      roleType: 'authority',
      syncWithCategoryDefaults: true,
    });
  });

  it('clones and merges server refreshes without discarding local edits', () => {
    const local = role({ id: 'r1', name: 'Locally renamed', memberCount: 2 });
    const fresh = role({ id: 'r1', name: 'Server name', memberCount: 7 });
    const snapshot = role({ id: 'r1', name: 'Snapshot name', memberCount: 1 });

    const cloned = cloneRoleManagerState([local]);
    cloned[0]!.name = 'Changed clone';
    expect(local.name).toBe('Locally renamed');

    const { merged, nextSnapshot } = mergeEchoRoleListPreservingLocalEdits({
      fresh: [fresh],
      local: [local],
      snapshot: [snapshot],
    });
    expect(merged[0]).toMatchObject({
      name: 'Locally renamed',
      memberCount: 7,
    });
    expect(nextSnapshot[0]).toMatchObject({ name: 'Snapshot name' });
  });

  it('calculates role, link, and order diffs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    expect(createManagedRole('New role')).toMatchObject({
      id: 'role-123',
      name: 'New role',
      displaySeparately: true,
    });
    vi.restoreAllMocks();

    const initial = role({
      linkedRoles: [{ linkedRoleId: 'b', twoWay: false }],
    });
    expect(
      calculateRoleDiff(initial, cloneRoleManagerState([initial])[0]!),
    ).toBeNull();

    const current = role({
      name: 'Renamed',
      roleIconUrl: null,
      roleIconEmojiId: 'emoji-2',
      displaySeparately: true,
      permissions: {
        ...defaultRolePermissions(),
        manageMessages: true,
      },
    });
    expect(calculateRoleDiff(initial, current)).toMatchObject({
      name: 'Renamed',
      hoist: true,
      roleIconUrl: null,
      roleIconEmojiId: 'emoji-2',
      permissions: expect.arrayContaining(['MANAGE_MESSAGES']),
    });

    expect(
      calculateRoleLinksDiff(initial, {
        ...initial,
        linkedRoles: [
          { linkedRoleId: 'c', twoWay: true },
          { linkedRoleId: 'a', twoWay: false },
        ],
      }),
    ).toEqual([
      { linkedRoleId: 'a', twoWay: false },
      { linkedRoleId: 'c', twoWay: true },
    ]);
    expect(calculateRoleLinksDiff(initial, { ...initial })).toBeNull();
    expect(
      calculateRoleOrderDiff(
        [role({ id: 'a' }), role({ id: 'b' })],
        [role({ id: 'a' }), role({ id: 'b' })],
      ),
    ).toBeNull();
    expect(
      calculateRoleOrderDiff(
        [role({ id: 'a' }), role({ id: 'b' })],
        [role({ id: 'b' }), role({ id: 'a' })],
      ),
    ).toEqual(['b', 'a']);
  });
});
