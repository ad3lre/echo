import { resolveCanonicalPermissionKeys } from '../../permissions/echoPermissionPrimitives';
import { normalizeEchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import { normalizeEchoRoleType } from '../../../../../../contracts/echoRoleTypes';
import type { EchoRoleDto, EchoRoleRow } from './echoRoleDto';
import {
  normalizeRoleIconEmojiId,
  normalizeRoleIconUrl,
} from './roleFieldNormalization';

export function mapEchoRoleRowToDto(row: EchoRoleRow): EchoRoleDto {
  const name = String(row.name);
  const roleType = normalizeEchoRoleType(row.role_type);
  const raw = row.permissions;
  const permissions: string[] = (() => {
    if (raw == null) return [];
    const source = Array.isArray(raw)
      ? raw.filter((x: unknown): x is string => typeof x === 'string')
      : typeof raw === 'object'
        ? Object.entries(raw as Record<string, unknown>)
            .filter(([, value]) => value === true)
            .map(([key]) => key)
        : [];
    if (source.length === 0) return [];
    const seen = new Set<string>();
    const outPerms: string[] = [];
    for (const token of source) {
      for (const canon of resolveCanonicalPermissionKeys(token)) {
        if (seen.has(canon)) continue;
        seen.add(canon);
        outPerms.push(canon);
      }
    }
    if (roleType === 'visual') {
      return outPerms.filter((p) => p === 'MENTION_EVERYONE');
    }
    return outPerms;
  })();
  const rc = row.role_category_id;
  const roleCategoryId =
    rc != null && typeof rc === 'string' && rc.trim() ? rc.trim() : null;
  const roleIconUrl = normalizeRoleIconUrl(row.role_icon_url);
  const roleIconEmojiId = normalizeRoleIconEmojiId(row.role_icon_emoji_id);
  const color = String(row.color ?? '');
  let darkColor = String(row.dark_color ?? row.color ?? '');
  let lightColor = String(row.light_color ?? row.color ?? '');
  let separateThemeColors = Boolean(row.separate_theme_colors);
  let hoist = Boolean(row.hoist);
  const defaultOnJoin = Boolean(row.default_on_join);
  if (roleType === 'authority') {
    hoist = false;
    separateThemeColors = false;
    darkColor = color;
    lightColor = color;
  }
  if (roleType === 'visual') {
    separateThemeColors = false;
    darkColor = color;
    lightColor = color;
  }
  return {
    id: String(row.id),
    name,
    color,
    darkColor,
    lightColor,
    separateThemeColors,
    position: Number(row.position ?? 0),
    hoist,
    defaultOnJoin,
    isMembers: name === '@members',
    isEveryone: name === '@members', // deprecated alias for backward compatibility
    isGlobal: name === '@global',
    roleCategoryId,
    rankInCategory: Number(row.rank_in_category ?? 0),
    roleScope: normalizeEchoRoleScope(row.role_scope),
    roleIconUrl,
    roleIconEmojiId,
    permissions,
    roleType,
    syncWithCategoryDefaults: row.sync_with_category_defaults !== false,
  };
}
