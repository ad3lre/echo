/** Echo-only permission strings (not in Discord's bitfield). */
export const ECHO_EXTENDED_PERMISSION_STRINGS = [
  'ASSIGN_ROLES',
  'COMMENT_ON_PAPER',
  'MANAGE_TICKETS',
  /** Role may be picked up by members via the self-assignable roles channel. */
  'SELF_SELECTABLE',
] as const;

export type EchoExtendedPermissionString =
  (typeof ECHO_EXTENDED_PERMISSION_STRINGS)[number];
