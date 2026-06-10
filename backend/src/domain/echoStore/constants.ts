import { ECHO_PERMISSIONS } from '../echoPermissionPrimitives';
import { ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_LOWER } from '../../../../shared/exploreDirectoryExcludedNames';

/**
 * Default server-level @members permissions for new servers and `ensureEchoTables` resets.
 * Includes voice connect + video (Discord `STREAM`) so members can join VC with camera by default.
 */
export const DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS: readonly string[] = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'CREATE_INSTANT_INVITE',
  'ADD_REACTIONS',
  'CONNECT',
  'STREAM',
];

/** @deprecated use DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS */
export const DEFAULT_ECHO_EVERYONE_ROLE_PERMISSIONS =
  DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS;

/**
 * Default server-level @global permissions for new servers.
 * Authenticated non-members start with 0 permissions; must be explicitly granted.
 */
export const DEFAULT_ECHO_GLOBAL_ROLE_PERMISSIONS: readonly string[] = [];

/** Seeded on new servers; assign manually — not granted to the owner (owner bypass is enough). */
export const DEFAULT_ECHO_SEEDED_ADMIN_ROLE_PERMISSIONS: readonly string[] = [
  'ADMINISTRATOR',
];

/** Seeded on new servers for moderation workflows. */
export const DEFAULT_ECHO_SEEDED_MODERATOR_ROLE_PERMISSIONS: readonly string[] =
  ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS', 'MANAGE_MESSAGES'];

export const ALL_PERMS_SET = new Set<string>(ECHO_PERMISSIONS);
export const ALLOWED_PERMS_SET = ALL_PERMS_SET;

/** Matches channel settings UI / PATCH validation. */
export const ALLOWED_SLOWMODE_SECONDS = new Set([
  0, 5, 10, 15, 30, 60, 300, 600, 900, 3600, 21600, 86400,
]);

export const ECHO_VOICE_BITRATE_MIN_BPS = 8_000;
export const ECHO_VOICE_BITRATE_MAX_BPS = 128_000;

export function echoDirectoryExcludedNamesSql(): string {
  const list = [...ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_LOWER]
    .map((n) => `'${n.replace(/'/g, "''")}'`)
    .join(', ');
  return `LOWER(TRIM(name)) NOT IN (${list})`;
}

export const MAX_ECHO_SERVER_MEDIA_URL_LEN = 12_000_000;
export const MAX_ECHO_SERVER_DESCRIPTION_LEN = 400;
export const MAX_ECHO_SERVER_NAME_LEN = 100;
