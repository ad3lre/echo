import { postEchoDiscordForumImportMessages as postEchoDiscordForumImportMessagesApi } from '@/api/echo/discordImport';

export async function postDiscordForumImportMessages(
  token: string,
  serverId: string,
  forumChannelId: string,
  opts?: { limit?: number },
) {
  return postEchoDiscordForumImportMessagesApi(
    token,
    serverId,
    forumChannelId,
    opts,
  );
}
