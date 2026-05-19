import type { EchoRoleLinkDto, EchoRolePatch } from '@/api/echo/types';
import type {
  ManagedRole,
  RolePermissions,
} from '@/features/server-settings/types';
import {
  roleUiPermissionsFromEchoStrings,
  roleUiPermissionsToEchoStrings,
} from '@shared/rolePermissionBridge';
import {
  normalizeEchoRoleType,
  type EchoRoleType,
} from '@shared/echoRoleTypes';

type RoleCard = { id: string; name: string; color: string; count: number };

export function defaultRolePermissions(): RolePermissions {
  return {
    viewChannels: true,
    manageChannels: false,
    manageRoles: false,
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
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
  permissions: string[];
  roleType?: EchoRoleType;
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
    const roleType: EchoRoleType = r.isEveryone
      ? 'mixed'
      : normalizeEchoRoleType(r.roleType);
    const partial = roleUiPermissionsFromEchoStrings(r.permissions);
    const full = { ...defaultRolePermissions(), ...partial } as RolePermissions;
    if (r.permissions.includes('ADMINISTRATOR')) {
      for (const k of Object.keys(full) as (keyof RolePermissions)[]) {
        full[k] = true;
      }
    }
    if (roleType === 'visual') {
      const mentionEveryone = full.mentionEveryone;
      for (const k of Object.keys(full) as (keyof RolePermissions)[]) {
        full[k] = false;
      }
      full.mentionEveryone = mentionEveryone;
    }
    const rc = r.roleCategoryId;
    const roleCategoryId =
      rc != null && typeof rc === 'string' && rc.trim() ? rc.trim() : null;
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      roleIconUrl:
        typeof r.roleIconUrl === 'string' && r.roleIconUrl.trim()
          ? r.roleIconUrl.trim()
          : null,
      roleIconEmojiId:
        typeof r.roleIconEmojiId === 'string' && r.roleIconEmojiId.trim()
          ? r.roleIconEmojiId.trim()
          : null,
      darkColor: r.darkColor ?? r.color,
      lightColor: r.lightColor ?? r.color,
      separateThemeColors: r.separateThemeColors === true,
      displaySeparately: r.hoist === true,
      defaultOnJoin: r.defaultOnJoin === true,
      linkedRoles: (byAnchor.get(r.id) ?? []).map((x) => ({ ...x })),
      mentionable: full.mentionEveryone,
      memberCount: counts.get(r.id) ?? 0,
      roleCategoryId,
      permissions: full,
      roleType,
    };
  });
}

/**
 * Echo roles UI: which role id drives sidebar {@link ManagedRole.memberCount} for a user —
 * the assigned role with the highest position, else @everyone when they have no explicit rows.
 * `rolesOrderedByPositionDesc` must match {@link buildManagedRolesFromEcho} ordering
 * (descending Echo `position`, i.e. strongest role first in the array).
 */
export function topEchoRoleIdForUserServerSettings(
  userId: string,
  assignments: Record<string, string[]>,
  rolesOrderedByPositionDesc: ManagedRole[],
): string | null {
  const ids = assignments[userId] ?? [];
  const assigned = new Set(ids);
  if (assigned.size === 0) {
    const everyone = rolesOrderedByPositionDesc.find(
      (r) => r.name === '@everyone',
    );
    return everyone?.id ?? null;
  }
  for (const r of rolesOrderedByPositionDesc) {
    if (assigned.has(r.id)) return r.id;
  }
  let fallback: string | null = null;
  let bestIdx = Infinity;
  for (let i = 0; i < rolesOrderedByPositionDesc.length; i++) {
    const r = rolesOrderedByPositionDesc[i]!;
    if (!assigned.has(r.id)) continue;
    if (i < bestIdx) {
      bestIdx = i;
      fallback = r.id;
    }
  }
  return fallback;
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
    permissions: defaultRolePermissions(),
    roleType: 'mixed',
  };
}

export function mergeEchoRoleListPreservingLocalEdits(opts: {
  fresh: ManagedRole[];
  local: ManagedRole[];
  snapshot: ManagedRole[];
}): { merged: ManagedRole[]; nextSnapshot: ManagedRole[] } {
  const { fresh, local, snapshot } = opts;
  const merged = fresh.map((fr) => {
    const loc = local.find((r) => r.id === fr.id);
    if (!loc) return cloneRoleManagerState([fr])[0]!;
    const row = cloneRoleManagerState([loc])[0]!;
    row.memberCount = fr.memberCount;
    return row;
  });
  const nextSnapshot = fresh.map((fr) => {
    const prev = snapshot.find((r) => r.id === fr.id);
    return cloneRoleManagerState([prev ?? fr])[0]!;
  });
  return { merged, nextSnapshot };
}

function normalizedEchoPermsForRole(role: ManagedRole): string[] {
  return roleUiPermissionsToEchoStrings(
    role.permissions as Record<string, boolean>,
  );
}

function stableJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

export function calculateRoleDiff(
  initial: ManagedRole,
  current: ManagedRole,
): EchoRolePatch | null {
  const patch: EchoRolePatch = {};
  if (initial.name !== current.name) patch.name = current.name;
  if (initial.color !== current.color) patch.color = current.color;
  if (initial.darkColor !== current.darkColor)
    patch.darkColor = current.darkColor;
  if (initial.lightColor !== current.lightColor)
    patch.lightColor = current.lightColor;
  if (initial.separateThemeColors !== current.separateThemeColors)
    patch.separateThemeColors = current.separateThemeColors;
  if (initial.displaySeparately !== current.displaySeparately)
    patch.hoist = current.displaySeparately;
  if (initial.defaultOnJoin !== current.defaultOnJoin)
    patch.defaultOnJoin = current.defaultOnJoin;
  if (initial.roleCategoryId !== current.roleCategoryId)
    patch.roleCategoryId = current.roleCategoryId;
  /** Role icon is a paired shape (preview URL + optional library emoji id); patch both whenever either changes. */
  const roleIconUrlChanged = initial.roleIconUrl !== current.roleIconUrl;
  const roleIconEmojiIdChanged =
    initial.roleIconEmojiId !== current.roleIconEmojiId;
  if (roleIconUrlChanged || roleIconEmojiIdChanged) {
    patch.roleIconUrl = current.roleIconUrl ?? null;
    patch.roleIconEmojiId = current.roleIconEmojiId ?? null;
  }
  if (initial.roleType !== current.roleType) patch.roleType = current.roleType;

  const initialPerms = normalizedEchoPermsForRole(initial);
  const currentPerms = normalizedEchoPermsForRole(current);
  if (stableJson(initialPerms) !== stableJson(currentPerms)) {
    patch.permissions = currentPerms;
  }

  return Object.keys(patch).length ? patch : null;
}

export function calculateRoleLinksDiff(
  initial: ManagedRole,
  current: ManagedRole,
): { linkedRoleId: string; twoWay: boolean }[] | null {
  const norm = (r: ManagedRole) =>
    [...(r.linkedRoles ?? [])]
      .map((x) => ({ linkedRoleId: x.linkedRoleId, twoWay: !!x.twoWay }))
      .sort((a, b) => a.linkedRoleId.localeCompare(b.linkedRoleId));
  const a = norm(initial);
  const b = norm(current);
  if (stableJson(a) === stableJson(b)) return null;
  return b;
}

export function calculateRoleOrderDiff(
  initialSnapshot: ManagedRole[],
  current: ManagedRole[],
): string[] | null {
  const a = (initialSnapshot ?? []).map((r) => r.id);
  const b = (current ?? []).map((r) => r.id);
  if (a.length === b.length && a.every((id, i) => id === b[i])) return null;
  return b;
}
