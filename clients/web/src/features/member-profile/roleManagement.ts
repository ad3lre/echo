import type { EchoRoleCategoryDto } from '@/api/echo/types';

/** Compact role-checkbox panel used by the member list popout. */
export type MemberRoleManagementSpec = {
  enabled: boolean;
  assignableRoles: {
    id: string;
    name: string;
    color: string;
    darkColor?: string;
    lightColor?: string;
    separateThemeColors?: boolean;
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    isEveryone?: boolean;
    position?: number;
    /** Server Settings organizer group; omit when uncategorized. */
    roleCategoryId?: string | null;
  }[];
  /** When non-empty, Manage Roles can show category tabs. */
  roleCategories?: EchoRoleCategoryDto[];
  /**
   * Whether the viewer may assign (`assign: true`) or remove (`assign: false`)
   * `roleId` on `targetUserId`. Omitted in mock workspaces (all rows stay enabled).
   */
  canMutateMemberRole?: (
    targetUserId: string,
    roleId: string,
    assign: boolean,
  ) => boolean;
  busy?: boolean;
  resolveAssignedRoleIds: (userId: string) => string[];
  onToggleRole: (payload: {
    targetUserId: string;
    roleId: string;
    assign: boolean;
  }) => void | Promise<void>;
};
