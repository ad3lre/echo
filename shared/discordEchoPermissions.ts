/**
 * Canonical permission strings stored in `echo_roles.permissions`, overwrites, etc.
 *
 * One entry per **named** flag in Discord’s bitwise table ([Permissions](https://discord.com/developers/docs/topics/permissions)):
 * 51 strings covering bits `0…46` and `49…52` (bits `47` and `48` are unused in the API; there is no placeholder here because Echo keys are names, not contiguous bit indices).
 *
 * Deprecated API name `MANAGE_EMOJIS_AND_STICKERS` is the same bit as `MANAGE_GUILD_EXPRESSIONS`; resolve imports via `LEGACY_ECHO_PERMISSION_ALIASES`.
 */

/**
 * Discord API permission strings Echo does not implement yet (excluded from RBAC fold, UI, and import).
 */
export const ECHO_DISABLED_DISCORD_PERMISSION_STRINGS = [
  'SEND_TTS_MESSAGES',
] as const;

export const ECHO_DISABLED_DISCORD_PERMISSION_NAMES = new Set<string>(
  ECHO_DISABLED_DISCORD_PERMISSION_STRINGS,
);

export const DISCORD_ECHO_PERMISSION_STRINGS = [
  'CREATE_INSTANT_INVITE',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'ADMINISTRATOR',
  'MANAGE_CHANNELS',
  'MANAGE_GUILD',
  'ADD_REACTIONS',
  'VIEW_AUDIT_LOG',
  'PRIORITY_SPEAKER',
  'STREAM',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'SEND_TTS_MESSAGES',
  'MANAGE_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'READ_MESSAGE_HISTORY',
  'MENTION_EVERYONE',
  'USE_EXTERNAL_EMOJIS',
  'VIEW_GUILD_INSIGHTS',
  'CONNECT',
  'SPEAK',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'USE_VAD',
  'CHANGE_NICKNAME',
  'MANAGE_NICKNAMES',
  'MANAGE_ROLES',
  'MANAGE_WEBHOOKS',
  'MANAGE_GUILD_EXPRESSIONS',
  'USE_APPLICATION_COMMANDS',
  'REQUEST_TO_SPEAK',
  'MANAGE_EVENTS',
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'CREATE_PRIVATE_THREADS',
  'USE_EXTERNAL_STICKERS',
  'SEND_MESSAGES_IN_THREADS',
  'USE_EMBEDDED_ACTIVITIES',
  'MODERATE_MEMBERS',
  'VIEW_CREATOR_MONETIZATION_ANALYTICS',
  'USE_SOUNDBOARD',
  'CREATE_GUILD_EXPRESSIONS',
  'CREATE_EVENTS',
  'USE_EXTERNAL_SOUNDS',
  'SEND_VOICE_MESSAGES',
  'SEND_POLLS',
  'USE_EXTERNAL_APPS',
  'PIN_MESSAGES',
  'BYPASS_SLOWMODE',
] as const;

export type DiscordEchoPermissionString =
  (typeof DISCORD_ECHO_PERMISSION_STRINGS)[number];
