import type {
  ManagedRole,
  RolePermissionKey,
  RolePermissions,
} from '@/features/server-settings/types';
import { ROLE_PERMISSION_DEFS } from '@/features/server-settings/types';

/** Permissions that warrant a warning before auto-assigning a role to new members. */
const DEFAULT_ON_JOIN_HIGH_RISK_KEYS: readonly RolePermissionKey[] = [
  'administrator',
  'manageServer',
  'manageRoles',
  'manageChannels',
  'kickMembers',
  'banMembers',
  'timeoutMembers',
  'manageMessages',
  'mentionEveryone',
];

export function labelsForEnabledRiskyDefaultOnJoinPermissions(
  permissions: RolePermissions,
): string[] {
  if (permissions.administrator) {
    const def = ROLE_PERMISSION_DEFS.find((d) => d.key === 'administrator');
    return [def?.label ?? 'administrator'];
  }
  const labels: string[] = [];
  for (const key of DEFAULT_ON_JOIN_HIGH_RISK_KEYS) {
    if (key === 'administrator') continue;
    if (permissions[key]) {
      const def = ROLE_PERMISSION_DEFS.find((d) => d.key === key);
      labels.push(def?.label ?? key);
    }
  }
  return labels;
}

export function roleIsRiskyForDefaultOnJoin(
  permissions: RolePermissions,
): boolean {
  if (permissions.administrator) return true;
  for (const key of DEFAULT_ON_JOIN_HIGH_RISK_KEYS) {
    if (key === 'administrator') continue;
    if (permissions[key]) return true;
  }
  return false;
}

export function applyRolePermissionCascade(
  role: ManagedRole,
  key: RolePermissionKey,
  value: boolean,
): void {
  if (key === 'administrator' && value) {
    for (const def of ROLE_PERMISSION_DEFS) {
      role.permissions[def.key] = true;
    }
  } else {
    role.permissions[key] = value;
    if (key !== 'administrator') {
      const allOtherEnabled = ROLE_PERMISSION_DEFS.filter(
        (def) => def.key !== 'administrator',
      ).every((def) => role.permissions[def.key]);
      role.permissions.administrator = allOtherEnabled;
    }
  }
  if (key === 'mentionEveryone') {
    role.mentionable = value;
  }
  if (key === 'administrator' && value) {
    role.mentionable = true;
  }
}

export function applyRoleMentionableLink(
  role: ManagedRole,
  value: boolean,
): void {
  role.mentionable = value;
  role.permissions.mentionEveryone = value;
}
