import {
  getDiscordVoiceMirrorCategorySettings,
  getDiscordVoiceMirrorVoiceChannelSettings,
  putDiscordVoiceMirrorCategorySettings,
  putDiscordVoiceMirrorVoiceChannelSettings,
} from '@/api/echo/discordVoiceMirror';

export async function fetchDiscordVoiceMirrorCategorySettings(
  token: string,
  serverId: string,
  categoryId: string,
) {
  return getDiscordVoiceMirrorCategorySettings(token, serverId, categoryId);
}

export async function saveDiscordVoiceMirrorCategorySettings(
  token: string,
  serverId: string,
  categoryId: string,
  input: { enabled: boolean; discordCategoryId: string },
) {
  return putDiscordVoiceMirrorCategorySettings(
    token,
    serverId,
    categoryId,
    input,
  );
}

export async function fetchDiscordVoiceMirrorVoiceChannelSettings(
  token: string,
  serverId: string,
  channelId: string,
) {
  return getDiscordVoiceMirrorVoiceChannelSettings(token, serverId, channelId);
}

export async function saveDiscordVoiceMirrorVoiceChannelSettings(
  token: string,
  serverId: string,
  channelId: string,
  input: { enabled: boolean },
) {
  return putDiscordVoiceMirrorVoiceChannelSettings(
    token,
    serverId,
    channelId,
    input,
  );
}
