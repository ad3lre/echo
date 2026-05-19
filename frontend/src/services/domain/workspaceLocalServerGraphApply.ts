import type { ChannelCategory } from '@/composables/useChannels';

export type WorkspaceServerRow = {
  id: string;
  name: string;
  imageUrl: string;
  ownerId?: string;
};

/** Default single text channel Echo returns after server create. */
export function bootstrapCategoriesForNewServer(
  serverId: string,
  defaultChannelId: string,
): ChannelCategory[] {
  return [
    {
      id: `echo-new-${serverId}-0`,
      name: 'Text Channels',
      channels: [{ id: defaultChannelId, name: 'general', type: 'text' }],
      channelPermissionDefaults: {},
    },
  ];
}

export function appendCreatedServerRow(
  prev: WorkspaceServerRow[],
  row: WorkspaceServerRow,
): WorkspaceServerRow[] {
  return [...prev, row];
}

export function setCategoriesForServerId(
  prev: Record<string, ChannelCategory[]>,
  serverId: string,
  categories: ChannelCategory[],
): Record<string, ChannelCategory[]> {
  return { ...prev, [serverId]: categories };
}

export function addSingleMemberToServerMemberIds(
  prev: Record<string, string[]>,
  serverId: string,
  memberUserId: string,
): Record<string, string[]> {
  return { ...prev, [serverId]: [memberUserId] };
}

export function collectChannelIdsForServer(
  categoriesByServer: Record<string, ChannelCategory[]>,
  serverId: string,
): string[] {
  const cats = categoriesByServer[serverId];
  if (!cats) return [];
  const ids: string[] = [];
  for (const c of cats) {
    for (const ch of c.channels) ids.push(ch.id);
  }
  return ids;
}

export function omitRecordKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function removeMessageKeys<T>(
  messages: Record<string, T>,
  channelIds: Iterable<string>,
): Record<string, T> {
  const next = { ...messages };
  for (const cid of channelIds) {
    delete next[cid];
  }
  return next;
}

export function filterServersExcept(
  servers: WorkspaceServerRow[],
  serverId: string,
): WorkspaceServerRow[] {
  return servers.filter((s) => s.id !== serverId);
}
