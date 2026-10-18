import type { EchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import type { EchoRoleType } from '../../../../../../contracts/echoRoleTypes';

export type EchoRoleDto = {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
  separateThemeColors: boolean;
  position: number;
  hoist: boolean;
  defaultOnJoin: boolean;
  isMembers: boolean;
  /** @deprecated use isMembers */
  isEveryone: boolean;
  isGlobal: boolean;
  /** Server settings organizer only; omitted when column missing (legacy clients). */
  roleCategoryId: string | null;
  /** Display order within the role category (higher = higher in settings list). */
  rankInCategory: number;
  /** Whether manage/assign permissions on this role apply across all categories. */
  roleScope: EchoRoleScope;
  roleIconUrl: string | null;
  roleIconEmojiId: string | null;
  permissions: string[];
  roleType: EchoRoleType;
  /** When true, permissions/hoist/join defaults follow the role category template. */
  syncWithCategoryDefaults: boolean;
};

export type EchoRoleRow = {
  id: unknown;
  name: unknown;
  color: unknown;
  dark_color: unknown;
  light_color: unknown;
  separate_theme_colors: unknown;
  position: unknown;
  permissions: unknown;
  hoist: unknown;
  default_on_join: unknown;
  role_category_id: unknown;
  rank_in_category: unknown;
  role_scope: unknown;
  role_icon_url: unknown;
  role_icon_emoji_id: unknown;
  role_type: unknown;
  sync_with_category_defaults: unknown;
};

export type ListEchoRolesForServerOptions = {
  /**
   * When false, roles with `role_type = authority` are omitted (callers without
   * Manage Roles must not see them in member-facing role lists).
   */
  includeAuthorityRoles?: boolean;
};

export type UpdateEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export type EchoMemberRoleMutationResult =
  | 'ok'
  | 'unchanged'
  | 'forbidden'
  | 'not_member'
  | 'invalid_role'
  | 'cannot_remove_members';

/** @deprecated use cannot_remove_members */
export type EchoMemberRoleMutationResultLegacy =
  | EchoMemberRoleMutationResult
  | 'cannot_remove_everyone';

export type DeleteEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'cannot_delete_members';

/** @deprecated use cannot_delete_members */
export type DeleteEchoRoleResultLegacy =
  | DeleteEchoRoleResult
  | 'cannot_delete_everyone';
