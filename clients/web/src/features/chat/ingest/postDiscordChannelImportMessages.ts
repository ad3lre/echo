import { postEchoDiscordImportMessages as postEchoDiscordImportMessagesApi } from '@/api/echo/discordImport';

export async function postDiscordChannelImportMessages(
  token: string,
  serverId: string,
  channelId: string,
  opts?: { limit?: number },
): Promise<{ importedCount: number }> {
  return postEchoDiscordImportMessagesApi(token, serverId, channelId, opts);
}
