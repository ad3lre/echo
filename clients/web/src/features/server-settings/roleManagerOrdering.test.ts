import { describe, expect, it } from 'vitest';
import type { ManagedRole } from '@/features/server-settings/types';
import {
  moveRoleToIndex,
  pinPinnedBottomEchoRoles,
  setRolePosition,
} from '@/features/server-settings/roleManagerOrdering';

function role(id: string, name: string): ManagedRole {
  return {
    id,
    name,
    color: '',
    roleIconUrl: null,
    roleIconEmojiId: null,
    darkColor: '',
    lightColor: '',
    separateThemeColors: false,
    displaySeparately: false,
    defaultOnJoin: false,
    linkedRoles: [],
    mentionable: false,
    memberCount: 0,
    roleCategoryId: null,
    roleScope: 'category',
    syncWithCategoryDefaults: true,
    permissions: {} as ManagedRole['permissions'],
    storedEchoPermissions: [],
    roleType: 'mixed',
  };
}

describe('roleManagerOrdering pinned bottom roles', () => {
  it('keeps @members and @global at the bottom with @global last', () => {
    const roles = [
      role('members', '@members'),
      role('admin', 'Admin'),
      role('global', '@global'),
      role('mod', 'Mod'),
    ];
    expect(pinPinnedBottomEchoRoles(roles).map((r) => r.id)).toEqual([
      'admin',
      'mod',
      'members',
      'global',
    ]);
  });

  it('does not move pinned roles via setRolePosition', () => {
    const roles = [
      role('admin', 'Admin'),
      role('members', '@members'),
      role('global', '@global'),
    ];
    expect(setRolePosition(roles, 'members', 1)).toBe(roles);
    expect(setRolePosition(roles, 'global', 1)).toBe(roles);
  });

  it('does not allow dragging a pinned role', () => {
    const roles = [
      role('admin', 'Admin'),
      role('mod', 'Mod'),
      role('members', '@members'),
      role('global', '@global'),
    ];
    expect(moveRoleToIndex(roles, 'members', 0)).toBe(roles);
    expect(moveRoleToIndex(roles, 'global', 0)).toBe(roles);
  });

  it('reorders movable roles above pinned tail', () => {
    const roles = [
      role('admin', 'Admin'),
      role('mod', 'Mod'),
      role('members', '@members'),
      role('global', '@global'),
    ];
    expect(moveRoleToIndex(roles, 'mod', 0).map((r) => r.id)).toEqual([
      'mod',
      'admin',
      'members',
      'global',
    ]);
  });
});
