import { DISCORD_ECHO_PERMISSION_STRINGS } from '../../../../../shared/discordEchoPermissions';
import type { EchoRoleDto } from '../../../domain/echoStore/roles';
import type { EchoMessageRow } from '../../../domain/echoMessagesDal';
import { mapEchoEmbedsToDiscordApi } from '../../../../../shared/discordEmbedApi';
import type { Embed } from '../../../../../shared/types';
import type { BotApp } from './botAuth';

/**
 * Discord channel type integers.
 * https://discord.com/developers/docs/resources/channel#channel-object-channel-types
 */
const CHANNEL_TYPE_MAP: Record<string, number> = {
  text: 0,
  voice: 2,
  stage: 13,
  announcement: 5,
  forum: 15,
  category: 4,
};

/**
 * Bit positions for each Discord permission string, indexed by position in
 * DISCORD_ECHO_PERMISSION_STRINGS array. These correspond to the Discord API bitfield.
 *
 * Discord's official bit map (bit 0 = CREATE_INSTANT_INVITE, bit 1 = KICK_MEMBERS, etc.)
 */
const DISCORD_PERM_BITS: Record<string, bigint> = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_INSIGHTS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  USE_EMBEDDED_ACTIVITIES: 1n << 39n,
  MODERATE_MEMBERS: 1n << 40n,
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 1n << 41n,
  USE_SOUNDBOARD: 1n << 42n,
  CREATE_GUILD_EXPRESSIONS: 1n << 43n,
  CREATE_EVENTS: 1n << 44n,
  USE_EXTERNAL_SOUNDS: 1n << 45n,
  SEND_VOICE_MESSAGES: 1n << 46n,
  SEND_POLLS: 1n << 49n,
  USE_EXTERNAL_APPS: 1n << 50n,
  PIN_MESSAGES: 1n << 13n,
  BYPASS_SLOWMODE: 1n << 52n,
};

/**
 * Encodes an array of Echo permission strings to a Discord bitfield string (BigInt).
 */
export function permsBitfield(permStrings: string[]): string {
  let bits = 0n;
  for (const p of permStrings) {
    const bit = DISCORD_PERM_BITS[p];
    if (bit !== undefined) bits |= bit;
  }
  return bits.toString();
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot: boolean;
  system: boolean;
  flags: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon: null;
  unicode_emoji: null;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  tags: Record<string, unknown>;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id: string;
  name: string;
  position: number;
  parent_id: string | null;
  permission_overwrites: unknown[];
  topic: string | null;
  nsfw: boolean;
  last_message_id: null;
  bitrate?: number;
  user_limit?: number;
}

export interface DiscordGuildMember {
  user: DiscordUser;
  nick: string | null;
  roles: string[];
  joined_at: string;
  deaf: boolean;
  mute: boolean;
  flags: number;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: DiscordAttachment[];
  embeds: unknown[];
  reactions: unknown[];
  pinned: boolean;
  type: number;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  permissions: string;
  verification_level: number;
  default_message_notifications: number;
  explicit_content_filter: number;
  roles: DiscordRole[];
  emojis: unknown[];
  features: string[];
  mfa_level: number;
  system_channel_id: null;
  rules_channel_id: null;
  public_updates_channel_id: null;
  preferred_locale: string;
  description: string | null;
  premium_tier: number;
  premium_subscription_count: number;
  nsfw_level: number;
  approximate_member_count: number;
  approximate_presence_count: number;
}

/** Convert hex color string (#rrggbb) to Discord integer color. */
function hexColorToInt(hex: string): number {
  if (!hex || !hex.startsWith('#')) return 0;
  const n = parseInt(hex.slice(1), 16);
  return isNaN(n) ? 0 : n;
}

export function serializeUser(opts: {
  id: string;
  username: string;
  displayName?: string;
  pfp?: string;
  isBot?: boolean;
}): DiscordUser {
  return {
    id: opts.id,
    username: opts.username || opts.displayName || 'user',
    discriminator: '0',
    global_name: opts.displayName ?? opts.username ?? null,
    avatar: opts.pfp && opts.pfp.trim() ? opts.pfp : null,
    bot: opts.isBot ?? false,
    system: false,
    flags: 0,
  };
}

export function serializeBotUser(bot: BotApp): DiscordUser {
  return {
    id: bot.id,
    username: bot.name,
    discriminator: '0',
    global_name: bot.name,
    avatar: null,
    bot: true,
    system: false,
    flags: 0,
  };
}

export function serializeRole(role: EchoRoleDto): DiscordRole {
  return {
    id: role.id,
    name: role.name,
    color: hexColorToInt(role.color),
    hoist: role.hoist,
    icon: null,
    unicode_emoji: null,
    position: role.position,
    permissions: permsBitfield(role.permissions),
    managed: false,
    mentionable: false,
    tags: {},
  };
}

export function serializeChannel(
  channel: {
    id: string;
    name: string;
    type: string;
    position: number;
    categoryId?: string;
    nsfw?: boolean;
    bitrateBps?: number | null;
    userLimit?: number;
  },
  guildId: string,
): DiscordChannel {
  const type = CHANNEL_TYPE_MAP[channel.type] ?? 0;
  const result: DiscordChannel = {
    id: channel.id,
    type,
    guild_id: guildId,
    name: channel.name,
    position: channel.position,
    parent_id: channel.categoryId || null,
    permission_overwrites: [],
    topic: null,
    nsfw: channel.nsfw ?? false,
    last_message_id: null,
  };
  if (channel.type === 'voice' || channel.type === 'stage') {
    result.bitrate = channel.bitrateBps ?? 64000;
    result.user_limit = channel.userLimit ?? 0;
  }
  return result;
}

export function serializeGuildMember(
  member: {
    userId: string;
    username?: string;
    displayName?: string;
    pfp?: string;
    serverNickname?: string;
    joinedAt?: string;
  },
  roleIds: string[],
): DiscordGuildMember {
  return {
    user: serializeUser({
      id: member.userId,
      username: member.username ?? member.displayName ?? 'user',
      displayName: member.displayName,
      pfp: member.pfp,
    }),
    nick: member.serverNickname ?? null,
    roles: roleIds,
    joined_at: member.joinedAt ?? new Date(0).toISOString(),
    deaf: false,
    mute: false,
    flags: 0,
  };
}

export function serializeMessage(
  msg: EchoMessageRow,
  author: DiscordUser,
): DiscordMessage {
  const content = (msg.searchIndexText ?? msg.content ?? '').trim();
  const attachments: DiscordAttachment[] = (msg.attachments ?? []).map(
    (att, idx) => ({
      id: String(idx),
      filename: att.filename ?? 'attachment',
      size: 0,
      url: att.url,
      proxy_url: att.url,
      ...(att.mimeType ? { content_type: att.mimeType } : {}),
    }),
  );

  return {
    id: msg.id,
    channel_id: msg.channelId,
    author,
    content,
    timestamp: msg.timestamp,
    edited_timestamp: msg.editedAt ?? null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments,
    embeds: mapEchoEmbedsToDiscordApi(
      Array.isArray(msg.embeds) ? (msg.embeds as Embed[]) : undefined,
    ),
    reactions: [],
    pinned: false,
    type: 0,
  };
}

export function serializeGuild(
  server: {
    id: string;
    name: string;
    iconUrl: string;
    ownerId: string;
    description?: string;
  },
  roles: EchoRoleDto[],
  memberCount: number,
): DiscordGuild {
  return {
    id: server.id,
    name: server.name,
    icon: server.iconUrl && server.iconUrl.trim() ? server.iconUrl : null,
    owner_id: server.ownerId,
    permissions: permsBitfield(['ADMINISTRATOR']),
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: roles.map(serializeRole),
    emojis: [],
    features: [],
    mfa_level: 0,
    system_channel_id: null,
    rules_channel_id: null,
    public_updates_channel_id: null,
    preferred_locale: 'en-US',
    description: server.description ?? null,
    premium_tier: 0,
    premium_subscription_count: 0,
    nsfw_level: 0,
    approximate_member_count: memberCount,
    approximate_presence_count: 0,
  };
}

// Re-export so gateway can use it
export { DISCORD_ECHO_PERMISSION_STRINGS };
