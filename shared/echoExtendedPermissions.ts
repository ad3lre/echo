/** Echo-only permission strings (not in Discord's bitfield). */
export const ECHO_EXTENDED_PERMISSION_STRINGS = [
  'ASSIGN_ROLES',
  'COMMENT_ON_PAPER',
  'MANAGE_TICKETS',
] as const;

export type EchoExtendedPermissionString =
  (typeof ECHO_EXTENDED_PERMISSION_STRINGS)[number];
