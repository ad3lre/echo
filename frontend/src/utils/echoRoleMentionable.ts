import type { EchoServerRoleDto } from '@/api/echo/types';

const SYSTEM_NON_MENTION_ROLE_NAMES = new Set([
  '@members',
  '@everyone',
  '@global',
]);

/** Whether a guild role may appear in `@` mention autocomplete. */
export function isEchoRoleMentionable(role: EchoServerRoleDto): boolean {
  const name = role.name?.trim() ?? '';
  if (!name) return false;
  if (role.isMembers || role.isEveryone) return false;
  if (role.name === '@global' || SYSTEM_NON_MENTION_ROLE_NAMES.has(name)) {
    return false;
  }
  if (role.roleType === 'authority') return false;
  return role.permissions.includes('MENTION_EVERYONE');
}

export function resolveEchoRoleDisplayColor(
  role: EchoServerRoleDto,
  lightTheme: boolean,
): string {
  if (role.separateThemeColors) {
    const themed = lightTheme ? role.lightColor : role.darkColor;
    if (themed?.trim()) return themed.trim();
  }
  return role.color?.trim() || '#99aab5';
}

/** Strip leading `@` from system-style role names for display labels. */
export function echoRoleMentionLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
