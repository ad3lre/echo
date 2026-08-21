/**
 * Maps Echo API permission strings (`echo_roles.permissions`, channel `permission_overrides`)
 * ↔ UI role matrix and channel permission keys.
 *
 * Stored strings follow [Discord API permission names](https://discord.com/developers/docs/topics/permissions).
 */

import type { ChannelPermissionKey } from './types/channel';
import {
  DISCORD_ECHO_PERMISSION_STRINGS,
  ECHO_DISABLED_DISCORD_PERMISSION_NAMES,
} from './discordEchoPermissions';
import { ECHO_EXTENDED_PERMISSION_STRINGS } from './echoExtendedPermissions';

export const ECHO_API_PERMISSIONS = [
  ...DISCORD_ECHO_PERMISSION_STRINGS,
  ...ECHO_EXTENDED_PERMISSION_STRINGS,
] as const;

export type EchoApiPermission = (typeof ECHO_API_PERMISSIONS)[number];

const THREAD_PERMISSION_NAMES = new Set([
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'CREATE_PRIVATE_THREADS',
  'SEND_MESSAGES_IN_THREADS',
]);

function isEchoEvaluatedPermission(name: string): boolean {
  return (
    !THREAD_PERMISSION_NAMES.has(name) &&
    !ECHO_DISABLED_DISCORD_PERMISSION_NAMES.has(name)
  );
}

const UI_TO_ECHO: Record<string, EchoApiPermission | EchoApiPermission[]> = {
  viewChannels: 'VIEW_CHANNEL',
  sendMessages: 'SEND_MESSAGES',
  manageChannels: 'MANAGE_CHANNELS',
  createInvite: 'CREATE_INSTANT_INVITE',
  manageMessages: 'MANAGE_MESSAGES',
  manageRoles: 'MANAGE_ROLES',
  assignRoles: 'ASSIGN_ROLES',
  selfSelectable: 'SELF_SELECTABLE',
  manageServer: 'MANAGE_GUILD',
  kickMembers: 'KICK_MEMBERS',
  banMembers: 'BAN_MEMBERS',
  timeoutMembers: 'MODERATE_MEMBERS',
  administrator: 'ADMINISTRATOR',
  changeNickname: 'CHANGE_NICKNAME',
  manageNicknames: 'MANAGE_NICKNAMES',
  addExpressions: ['USE_EXTERNAL_EMOJIS', 'USE_EXTERNAL_STICKERS'],
  manageExpressions: 'MANAGE_GUILD_EXPRESSIONS',
  muteDeafenMembers: ['MUTE_MEMBERS', 'DEAFEN_MEMBERS'],
  moveMembers: 'MOVE_MEMBERS',
  connectToVoice: 'CONNECT',
  video: 'STREAM',
  mentionEveryone: 'MENTION_EVERYONE',
  viewAuditLog: 'VIEW_AUDIT_LOG',
  viewServerStats: 'VIEW_GUILD_INSIGHTS',
  sendMedia: 'ATTACH_FILES',
  readMessageHistory: 'READ_MESSAGE_HISTORY',
  createPolls: 'SEND_POLLS',
  commentOnPaper: 'COMMENT_ON_PAPER',
  manageTickets: 'MANAGE_TICKETS',
};

function addUiEchoKeys(
  set: Set<string>,
  uiKey: string,
  perms: Record<string, boolean>,
): void {
  if (perms[uiKey] !== true) return;
  const echo = UI_TO_ECHO[uiKey];
  if (echo == null) return;
  if (Array.isArray(echo)) {
    for (const k of echo) set.add(k);
  } else {
    set.add(echo);
  }
}

/** Echo permission bits controlled by the server settings role UI matrix. */
export function echoPermissionsManagedByRoleUi(): ReadonlySet<string> {
  const set = new Set<string>();
  for (const echo of Object.values(UI_TO_ECHO)) {
    if (Array.isArray(echo)) {
      for (const k of echo) set.add(k);
    } else {
      set.add(echo);
    }
  }
  return set;
}

/** Build Echo `permissions` array from UI role matrix (Discord/Echo API keys only). */
export function roleUiPermissionsToEchoStrings(
  perms: Record<string, boolean>,
): string[] {
  if (perms.administrator) {
    return [...ECHO_API_PERMISSIONS].filter((k) =>
      isEchoEvaluatedPermission(k),
    );
  }
  const set = new Set<string>();
  for (const uiKey of Object.keys(UI_TO_ECHO)) {
    addUiEchoKeys(set, uiKey, perms);
  }
  return [...ECHO_API_PERMISSIONS].filter(
    (k) => set.has(k) && isEchoEvaluatedPermission(k),
  );
}

/**
 * Merge UI-edited role permissions with stored Echo strings, preserving bits
 * that are not exposed in the server settings role editor (e.g. EMBED_LINKS).
 */
export function mergeRoleUiPermissionsWithStoredEcho(
  uiPerms: Record<string, boolean>,
  storedEcho: readonly string[],
): string[] {
  const uiManaged = echoPermissionsManagedByRoleUi();
  const fromUi = new Set(roleUiPermissionsToEchoStrings(uiPerms));
  const preserved = storedEcho.filter((p) => !uiManaged.has(p));
  const merged = new Set([...preserved, ...fromUi]);
  return [...ECHO_API_PERMISSIONS].filter(
    (k) => merged.has(k) && isEchoEvaluatedPermission(k),
  );
}

/** Minimal UI keys used for Echo servers (rest of RolePermissions stay default from factory). */
export function roleUiPermissionsFromEchoStrings(
  arr: string[],
): Record<string, boolean> {
  const s = new Set(arr);
  const has = (k: string) => s.has(k);
  if (arr.includes('ADMINISTRATOR')) {
    const o: Record<string, boolean> = {};
    for (const k of Object.keys(UI_TO_ECHO)) {
      o[k] = true;
    }
    o.administrator = true;
    return o;
  }
  return {
    viewChannels: has('VIEW_CHANNEL'),
    sendMessages: has('SEND_MESSAGES') || has('SEND_MESSAGE'),
    manageChannels: has('MANAGE_CHANNELS') || has('CREATE_CHANNEL'),
    createInvite: has('CREATE_INSTANT_INVITE') || has('CREATE_INVITE'),
    manageMessages: has('MANAGE_MESSAGES'),
    manageRoles: has('MANAGE_ROLES'),
    assignRoles:
      has('ASSIGN_ROLES') || has('MANAGE_ROLES') || has('ADMINISTRATOR'),
    selfSelectable: has('SELF_SELECTABLE'),
    manageServer: has('MANAGE_GUILD') || has('MANAGE_SERVER'),
    kickMembers: has('KICK_MEMBERS'),
    banMembers: has('BAN_MEMBERS'),
    timeoutMembers: has('MODERATE_MEMBERS'),
    changeNickname: has('CHANGE_NICKNAME'),
    manageNicknames: has('MANAGE_NICKNAMES'),
    addExpressions:
      has('USE_EXTERNAL_EMOJIS') ||
      has('USE_EXTERNAL_STICKERS') ||
      has('USE_EXPRESSIONS'),
    manageExpressions:
      has('MANAGE_GUILD_EXPRESSIONS') || has('MANAGE_EXPRESSIONS'),
    muteDeafenMembers:
      has('MUTE_MEMBERS') ||
      has('DEAFEN_MEMBERS') ||
      has('VC_MUTE') ||
      has('VC_DEAFEN'),
    moveMembers: has('MOVE_MEMBERS') || has('VC_MOVE'),
    connectToVoice: has('CONNECT') || has('CONNECT_TO_VOICE'),
    video: has('STREAM') || has('USE_VIDEO'),
    mentionEveryone: has('MENTION_EVERYONE') || has('MENTION_NICKNAMES'),
    viewAuditLog: has('VIEW_AUDIT_LOG'),
    viewServerStats: has('VIEW_GUILD_INSIGHTS'),
    sendMedia: has('ATTACH_FILES'),
    readMessageHistory: has('READ_MESSAGE_HISTORY'),
    createPolls: has('SEND_POLLS'),
    commentOnPaper: has('COMMENT_ON_PAPER'),
    manageTickets: has('MANAGE_TICKETS'),
    administrator: false,
  };
}

/**
 * Every `ChannelPermissionKey` maps to the same Echo/Discord string names the RBAC evaluator uses.
 * (`video` and `stream` both use `STREAM`; `echoPartialToChannelOverrides` picks the first registered key.)
 */
const CH_TO_ECHO: Record<
  ChannelPermissionKey,
  EchoApiPermission | EchoApiPermission[]
> = {
  viewChannel: 'VIEW_CHANNEL',
  manageChannel: 'MANAGE_CHANNELS',
  managePermissions: 'MANAGE_ROLES',
  manageWebhooks: 'MANAGE_WEBHOOKS',
  createInvite: 'CREATE_INSTANT_INVITE',
  sendMessages: 'SEND_MESSAGES',
  sendMessagesInThreads: 'SEND_MESSAGES_IN_THREADS',
  createPublicThreads: 'CREATE_PUBLIC_THREADS',
  createPrivateThreads: 'CREATE_PRIVATE_THREADS',
  embedLinks: 'EMBED_LINKS',
  attachFiles: 'ATTACH_FILES',
  addReactions: 'ADD_REACTIONS',
  useExternalEmoji: 'USE_EXTERNAL_EMOJIS',
  useExternalStickers: 'USE_EXTERNAL_STICKERS',
  mentionEveryone: 'MENTION_EVERYONE',
  manageMessages: 'MANAGE_MESSAGES',
  manageThreads: 'MANAGE_THREADS',
  readMessageHistory: 'READ_MESSAGE_HISTORY',
  sendTTS: 'SEND_TTS_MESSAGES',
  useApplicationCommands: 'USE_APPLICATION_COMMANDS',
  createPolls: 'SEND_POLLS',
  sendVoiceMessages: 'SEND_VOICE_MESSAGES',
  pinMessages: 'PIN_MESSAGES',
  bypassSlowmode: 'BYPASS_SLOWMODE',
  useExternalApps: 'USE_EXTERNAL_APPS',
  connect: 'CONNECT',
  speak: 'SPEAK',
  video: 'STREAM',
  muteMembers: 'MUTE_MEMBERS',
  deafenMembers: 'DEAFEN_MEMBERS',
  moveMembers: 'MOVE_MEMBERS',
  useVoiceActivity: 'USE_VAD',
  prioritySpeaker: 'PRIORITY_SPEAKER',
  stream: 'STREAM',
  useEmbeddedActivities: 'USE_EMBEDDED_ACTIVITIES',
  requestToSpeak: 'REQUEST_TO_SPEAK',
  manageEvents: 'MANAGE_EVENTS',
  createEvents: 'CREATE_EVENTS',
  useSoundboard: 'USE_SOUNDBOARD',
  useExternalSounds: 'USE_EXTERNAL_SOUNDS',
  commentOnPaper: 'COMMENT_ON_PAPER',
};

export function channelOverridesToEchoPartial(
  overrides: Partial<Record<ChannelPermissionKey, boolean>>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const echo = CH_TO_ECHO[k as ChannelPermissionKey];
    if (!echo || (v !== true && v !== false)) continue;
    if (Array.isArray(echo)) {
      for (const bit of echo) if (isEchoEvaluatedPermission(bit)) out[bit] = v;
    } else {
      if (isEchoEvaluatedPermission(echo)) out[echo] = v;
    }
  }
  return out;
}

/** Reverse map: first Echo bit wins for UI key when multiple bits map to same UI field. */
const ECHO_TO_CH: Partial<Record<string, ChannelPermissionKey>> = {};
for (const [ck, ev] of Object.entries(CH_TO_ECHO)) {
  const bits = Array.isArray(ev) ? ev : [ev];
  for (const b of bits) {
    if (!isEchoEvaluatedPermission(b)) continue;
    if (!(b in ECHO_TO_CH)) ECHO_TO_CH[b] = ck as ChannelPermissionKey;
  }
}

export function echoPartialToChannelOverrides(
  raw: Record<string, unknown> | null | undefined,
): Partial<Record<ChannelPermissionKey, boolean>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Record<ChannelPermissionKey, boolean>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ck = ECHO_TO_CH[k];
    if (!ck || (v !== true && v !== false)) continue;
    out[ck] = v;
  }
  return out;
}
