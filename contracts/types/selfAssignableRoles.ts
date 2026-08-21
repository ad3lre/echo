/** Legacy auto-provisioned slug; existing servers may still use this until renamed. */
export const ECHO_SELF_ROLES_CHANNEL_NAME = 'self-assignable-roles';

/** Suggested default when admins first enable the widget channel. */
export const ECHO_SELF_ROLES_DEFAULT_CHANNEL_NAME = 'roles';

/** Admin-defined category in the self-assignable roles channel (not a role-settings organizer tab). */
export type SelfRolesCustomCategory = {
  id: string;
  name: string;
  position: number;
  /** Explicit role ids when `randomEligible` is false. */
  roleIds: string[];
  /**
   * When true, include every self-selectable role not explicitly listed in other
   * custom categories' `roleIds`.
   */
  randomEligible?: boolean;
};

export interface EchoSelfRolesConfig {
  enabled: boolean;
  /** Server-managed widget channel id; set automatically when `enabled` is true. */
  panelChannelId: string | null;
  /** Sidebar / header label (`echo_channels.name` for the widget channel). */
  channelName: string | null;
  customCategories: SelfRolesCustomCategory[];
}

export type SelfRolesPanelRole = {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
  separateThemeColors: boolean;
  roleIconUrl: string | null;
  roleIconEmojiId: string | null;
  position: number;
};

export type SelfRolesPanelCategory = {
  id: string;
  name: string;
  position: number;
  source: 'derived' | 'custom';
  /** Set when `source === 'derived'`. */
  roleCategoryId?: string | null;
  randomEligible?: boolean;
  roles: SelfRolesPanelRole[];
};

export type EchoSelfRolesPanel = {
  categories: SelfRolesPanelCategory[];
  assignedRoleIds: string[];
};
