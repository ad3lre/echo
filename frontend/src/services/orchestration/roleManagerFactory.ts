import type { EchoRoleLinkDto } from '@/api/echo/types';
import type {
  ManagedRole,
  RolePermissions,
} from '@/features/server-settings/types';
import { roleUiPermissionsFromEchoStrings } from '@shared/rolePermissionBridge';

type RoleCard = { id: string; name: string; color: string; count: number };

export function defaultRolePermissions(): RolePermissions {
  return {
    viewChannels: true,
    manageChannels: false,
    manageRoles: false,
    assignRoles: false,
    addExpressions: true,
    manageExpressions: false,
    viewAuditLog: false,
    viewServerStats: true,
    manageServer: false,
    createInvite: true,
    changeNickname: true,
    manageNicknames: false,
    manageApprovals: false,
    kickMembers: false,
    banMembers: false,
    timeoutMembers: false,
    sendMessages: true,
    sendMedia: true,
    mentionEveryone: false,
    mentionActive: false,
    manageMessages: false,
    readMessageHistory: true,
    createPolls: true,
    commentOnPaper: true,
    manageTickets: false,
    connectToVoice: true,
    video: true,
    muteDeafenMembers: false,
    moveMembers: false,
    setVoiceChannelStatus: false,
    administrator: false,
  };
}

export function permissionsFromName(name: string): RolePermissions {
  const n = name.toLowerCase();
  const isOwner = n.includes('owner');
  const isAdmin = n.includes('admin');
  const isMod = n.includes('mod') || n.includes('moderator');
  const base = defaultRolePermissions();

  if (isOwner) {
    return Object.fromEntries(
      Object.keys(base).map((k) => [k, true]),
    ) as RolePermissions;
  }

  if (isAdmin) {
    return {
      ...base,
      manageChannels: true,
      manageRoles: true,
      manageExpressions: true,
      viewAuditLog: true,
      manageServer: false,
      manageNicknames: true,
      manageApprovals: true,
      kickMembers: true,
      banMembers: true,
      timeoutMembers: true,
      mentionEveryone: true,
      mentionActive: true,
      manageMessages: true,
      muteDeafenMembers: true,
      moveMembers: true,
      setVoiceChannelStatus: true,
      administrator: true,
    };
  }

  if (isMod) {
    return {
      ...base,
      viewAuditLog: true,
      kickMembers: true,
      timeoutMembers: true,
      mentionActive: true,
      manageMessages: true,
      muteDeafenMembers: true,
      moveMembers: true,
    };
  }

  return base;
}

export function cloneRoleManagerState(roles: ManagedRole[]) {
  return JSON.parse(JSON.stringify(roles)) as ManagedRole[];
}

export function buildInitialManagedRoles(roleCards: RoleCard[]): ManagedRole[] {
  if (!roleCards.length) {
    return [
      {
        id: 'role-member',
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
        permissions: permissionsFromName('member'),
        roleType: 'mixed',
      },
    ];
  }

  return roleCards.map((role) => {
    const perms = permissionsFromName(role.name);
    return {
      id: role.id,
      name: role.name,
      color: role.color,
      roleIconUrl: null,
      roleIconEmojiId: null,
      darkColor: role.color,
      lightColor: role.color,
      separateThemeColors: false,
      displaySeparately: true,
      defaultOnJoin: false,
      linkedRoles: [],
      mentionable: perms.mentionEveryone,
      memberCount: role.count,
      roleCategoryId: null,
      roleScope: 'category',
      permissions: perms,
      roleType: 'mixed',
    };
  });
}

export type EchoRoleRow = {
  id: string;
  name: string;
  color: string;
  darkColor?: string;
  lightColor?: string;
  separateThemeColors?: boolean;
  position: number;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  isEveryone: boolean;
  roleCategoryId?: string | null;
  roleScope?: 'global' | 'category';
  permissions: string[];
};

export function buildManagedRolesFromEcho(
  roles: EchoRoleRow[],
  assignments: Record<string, string[]>,
  users: { id: string }[],
  roleLinks: EchoRoleLinkDto[] = [],
): ManagedRole[] {
  const byAnchor = new Map<
    string,
    { linkedRoleId: string; twoWay: boolean }[]
  >();
  for (const l of roleLinks) {
    const cur = byAnchor.get(l.anchorRoleId);
    const entry = { linkedRoleId: l.linkedRoleId, twoWay: l.twoWay };
    if (cur) cur.push(entry);
    else byAnchor.set(l.anchorRoleId, [entry]);
  }
  const byId = new Map(roles.map((r) => [r.id, r]));
  const sorted = [...roles].sort((a, b) => b.position - a.position);
  function topRoleForUser(uid: string): string {
    const ids = assignments[uid] ?? [];
    let best: string | null = null;
    let bestPos = -Infinity;
    for (const rid of ids) {
      const r = byId.get(rid);
      if (!r) continue;
      if (r.position > bestPos) {
        bestPos = r.position;
        best = rid;
      }
    }
    if (best) return best;
    const everyone = roles.find((r) => r.isEveryone);
    return everyone?.id ?? '';
  }
  const counts = new Map<string, number>();
  for (const u of users) {
    const tr = topRoleForUser(u.id);
    if (!tr) continue;
    counts.set(tr, (counts.get(tr) ?? 0) + 1);
  }
  return sorted.map((r) => {
    const partial = roleUiPermissionsFromEchoStrings(r.permissions);
    const full = { ...defaultRolePermissions(), ...partial } as RolePermissions;
    if (r.permissions.includes('ADMINISTRATOR')) {
      for (const k of Object.keys(full) as (keyof RolePermissions)[]) {
        full[k] = true;
      }
    }
    const rc = r.roleCategoryId;
    const roleCategoryId =
      rc != null && typeof rc === 'string' && rc.trim() ? rc.trim() : null;
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      roleIconUrl: null,
      roleIconEmojiId: null,
      darkColor: r.darkColor ?? r.color,
      lightColor: r.lightColor ?? r.color,
      separateThemeColors: r.separateThemeColors === true,
      displaySeparately: r.hoist === true,
      defaultOnJoin: r.defaultOnJoin === true,
      linkedRoles: (byAnchor.get(r.id) ?? []).map((x) => ({ ...x })),
      mentionable: full.mentionEveryone,
      memberCount: counts.get(r.id) ?? 0,
      roleCategoryId,
      roleScope: r.roleScope === 'global' ? 'global' : 'category',
      permissions: full,
      roleType: 'mixed',
    };
  });
}

export function createManagedRole(
  name: string,
  id = `role-${Date.now()}`,
): ManagedRole {
  return {
    id,
    name,
    color: '',
    roleIconUrl: null,
    roleIconEmojiId: null,
    darkColor: '',
    lightColor: '',
    separateThemeColors: false,
    displaySeparately: true,
    defaultOnJoin: false,
    linkedRoles: [],
    mentionable: false,
    memberCount: 0,
    roleCategoryId: null,
    roleScope: 'category',
    permissions: defaultRolePermissions(),
    roleType: 'mixed',
  };
}
