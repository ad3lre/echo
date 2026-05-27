import type { ChannelCategory } from '@/composables/useChannels';
import type { MockData } from '@/composables/workspace/types';
import type { ChannelSummary } from '@shared/types';
import { messagePreviewPlainText } from '@/services/domain/messagePreviewPlain';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { echoUserMatchesSearchQuery } from '@/utils/echoUserSearch';

export type ReportUserCandidate = {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  isFriend: boolean;
};

export type ReportChannelCandidate = {
  channelId: string;
  channelLabel: string;
  serverName: string;
};

export type ReportMessageCandidate = {
  messageId: string;
  channelId: string;
  authorName: string;
  preview: string;
  timestamp: string;
};

export function buildReportUserCandidates(input: {
  users: MockData['users'];
  friendIds: string[];
  serverMemberIds: Record<string, string[]>;
  query: string;
}): ReportUserCandidate[] {
  const friendSet = new Set(input.friendIds);
  const knownIds = new Set<string>(input.friendIds);
  for (const ids of Object.values(input.serverMemberIds)) {
    for (const id of ids) knownIds.add(id);
  }

  const usersById = new Map(input.users.map((u) => [u.id, u]));
  const rows: ReportUserCandidate[] = [];
  for (const id of knownIds) {
    const u = usersById.get(id);
    if (!u) continue;
    const candidate: ReportUserCandidate = {
      id: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: u.pfp?.trim() || undefined,
      isFriend: friendSet.has(u.id),
    };
    if (!echoUserMatchesSearchQuery(candidate, input.query)) continue;
    rows.push(candidate);
  }

  rows.sort((a, b) => {
    if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export function buildReportChannelCandidates(input: {
  servers: MockData['servers'];
  categoriesByServer: Record<string, ChannelCategory[]>;
  query: string;
}): ReportChannelCandidate[] {
  const q = input.query.trim().toLowerCase();
  const rows: ReportChannelCandidate[] = [];

  for (const server of input.servers) {
    if (server.id === 'echo') continue;
    const cats = input.categoriesByServer[server.id] ?? [];
    for (const cat of cats) {
      for (const ch of cat.channels) {
        if (ch.type !== 'text') continue;
        if (
          (ch as ChannelSummary & { canViewChannel?: boolean })
            .canViewChannel === false
        )
          continue;
        const channelLabel = ch.name.trim() || 'channel';
        const haystack = `${server.name} ${channelLabel}`.toLowerCase();
        if (q && !haystack.includes(q)) continue;
        rows.push({
          channelId: ch.id,
          channelLabel: `#${channelLabel}`,
          serverName: server.name,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const byServer = a.serverName.localeCompare(b.serverName);
    if (byServer !== 0) return byServer;
    return a.channelLabel.localeCompare(b.channelLabel);
  });
  return rows;
}

export function buildReportMessageCandidates(input: {
  channelId: string;
  messages: Record<string, RawMessage[]>;
  users: MockData['users'];
  query: string;
  limit?: number;
}): ReportMessageCandidate[] {
  const channelId = input.channelId.trim();
  if (!channelId) return [];

  const usersById = new Map(input.users.map((u) => [u.id, u]));
  const q = input.query.trim().toLowerCase();
  const limit = input.limit ?? 40;
  const bucket = input.messages[channelId] ?? [];

  const rows: ReportMessageCandidate[] = [];
  for (let i = bucket.length - 1; i >= 0; i -= 1) {
    const msg = bucket[i]!;
    const messageId = msg.id?.trim();
    if (!messageId || msg.systemMessage) continue;

    const author =
      usersById.get(msg.authorId)?.name?.trim() ||
      msg.authorDisplayName?.trim() ||
      'Someone';
    const preview = messagePreviewPlainText(msg, 120).trim() || '[No text]';
    const haystack = `${author} ${preview}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;

    rows.push({
      messageId,
      channelId,
      authorName: author,
      preview,
      timestamp: msg.timestamp,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
