import type { EchoRoleType } from '../../../../../../contracts/echoRoleTypes';

export type EchoRoleUpdatePatch = {
  name?: string;
  color?: string | null;
  darkColor?: string | null;
  lightColor?: string | null;
  separateThemeColors?: boolean;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  permissions?: unknown;
  /** Server settings category; null clears. Not valid for @members. */
  roleCategoryId?: string | null;
  roleScope?: unknown;
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
  roleType?: unknown;
  syncWithCategoryDefaults?: boolean;
};

export type LoadedRoleRow = {
  name: string;
  position: unknown;
  role_type?: unknown;
  color?: unknown;
  dark_color?: unknown;
  light_color?: unknown;
  separate_theme_colors?: unknown;
  hoist?: unknown;
  default_on_join?: unknown;
  role_category_id?: unknown;
  permissions?: unknown;
  role_scope?: unknown;
  sync_with_category_defaults?: unknown;
};

export type PreparedUpdate = {
  nextType: EchoRoleType;
  currentName: string;
  currentType: EchoRoleType;
  actorPerms: ReadonlySet<string>;
  actorIsOwner: boolean;
  row0: LoadedRoleRow;
};
