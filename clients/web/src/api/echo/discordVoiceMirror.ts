import { echoFetch } from './transport';

export type DiscordVoiceMirrorRosterMember = {
  discordUserId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type DiscordVoiceMirrorRosterChannel = {
  discordChannelId: string;
  echoChannelId: string | null;
  members: DiscordVoiceMirrorRosterMember[];
};

export async function fetchDiscordVoiceMirrorRoster(
  token: string,
  serverId: string,
): Promise<{ channels: DiscordVoiceMirrorRosterChannel[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-voice-mirror/roster`,
  );
}

export async function getDiscordVoiceMirrorCategorySettings(
  token: string,
  serverId: string,
  categoryId: string,
): Promise<{ enabled: boolean; discordCategoryId: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/discord-voice-mirror`,
  );
}

/**
 * Always send `discordCategoryId` (use `''` to clear). The backend treats a missing
 * key as "keep previous value", so omitting it on save silently kept stale filters.
 */
export async function putDiscordVoiceMirrorCategorySettings(
  token: string,
  serverId: string,
  categoryId: string,
  body: { enabled: boolean; discordCategoryId: string },
): Promise<{ enabled: boolean; discordCategoryId: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/discord-voice-mirror`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export async function getDiscordVoiceMirrorVoiceChannelSettings(
  token: string,
  serverId: string,
  channelId: string,
): Promise<{ enabled: boolean }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-voice-mirror`,
  );
}

export async function putDiscordVoiceMirrorVoiceChannelSettings(
  token: string,
  serverId: string,
  channelId: string,
  body: { enabled: boolean },
): Promise<{ enabled: boolean }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-voice-mirror`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}
