export function createIsServerUnread(
  getServerAttentionByServerId: () => Record<
    string,
    { unread?: boolean } | undefined
  >,
) {
  return (serverId: string) =>
    Boolean(getServerAttentionByServerId()[serverId]?.unread);
}
