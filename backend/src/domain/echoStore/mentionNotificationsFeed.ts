import type pg from 'pg';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  isEchoChannelSnoozed,
  mergeAttentionPingKinds,
  resolveEffectiveChannelNotificationLevel,
  selfPingingMentionKinds,
} from '../../../../shared/attentionPing';
import type {
  EchoMentionNotificationRow,
  EchoServerNotificationLevel,
  MentionEntity,
} from '../../../../shared/types';
import {
  queryEchoDmThreadsForUser,
  selectUnreadMentionFeedRowsForUser,
} from '../echoMessagesDal';
import { listEchoWorkspaceForUser } from './categoriesWorkspace';
import { listEchoChannelNotificationOverridesForUser } from './channelNotificationOverrides';
import { listEchoSelfRoleIdsByServer } from './roles';
import { listEchoServerNotificationLevelsForUser } from './serverNotificationPreferences';
import { getEchoUserPublicProfileRow } from './userTypingProfile';

const MENTION_FEED_MAX_ROWS = 200;

function parseMentions(raw: unknown): MentionEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is MentionEntity =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as MentionEntity).kind === 'string' &&
      typeof (item as MentionEntity).label === 'string',
  );
}

/**
 * Server-authoritative mention inbox: scans unread rows that mention the viewer
 * (or reply to them), applies each server's notification level, and returns
 * fully hydrated rows (body + author) newest-first. This replaces the client's
 * per-channel prefetch/hydration dance for the notifications panel.
 */
export async function buildEchoMentionNotificationsFeed(
  pool: pg.Pool,
  userId: string,
  opts?: { limit?: number },
): Promise<EchoMentionNotificationRow[]> {
  const maxRows = Math.min(
    Math.max(opts?.limit ?? 120, 1),
    MENTION_FEED_MAX_ROWS,
  );

  const viewerProfile = await getEchoUserPublicProfileRow(pool, userId);
  const viewerClassifyBase = {
    userId,
    ...(viewerProfile?.username?.trim()
      ? { username: viewerProfile.username.trim() }
      : {}),
    ...(viewerProfile?.name?.trim()
      ? { displayName: viewerProfile.name.trim() }
      : {}),
  };

  const [workspace, dmThreads] = await Promise.all([
    listEchoWorkspaceForUser(pool, userId),
    queryEchoDmThreadsForUser(pool, userId),
  ]);

  const serverIds = workspace.servers.map((server) => server.id);
  const categoriesByServer = workspace.categoriesByServer as Record<
    string,
    Array<{ channels: Array<{ id: string }> }>
  >;
  const serverChannelToServerId = new Map<string, string>();
  for (const [serverId, categories] of Object.entries(categoriesByServer)) {
    for (const category of categories) {
      for (const channel of category.channels) {
        serverChannelToServerId.set(channel.id, serverId);
      }
    }
  }

  const dmChannelIds = new Set<string>(
    dmThreads.map((thread) => thread.channelId),
  );

  const channelIds = [
    ...new Set([...serverChannelToServerId.keys(), ...dmChannelIds]),
  ];
  if (channelIds.length === 0) return [];

  const [storedLevels, selfRoleIdsByServer, channelOverridesByChannelId] =
    await Promise.all([
      listEchoServerNotificationLevelsForUser(pool, userId, serverIds),
      listEchoSelfRoleIdsByServer(pool, userId, serverIds),
      listEchoChannelNotificationOverridesForUser(pool, userId, channelIds),
    ]);
  const nowMs = Date.now();

  const serverNotificationLevelByServerId: Record<
    string,
    EchoServerNotificationLevel
  > = {};
  for (const serverId of serverIds) {
    serverNotificationLevelByServerId[serverId] =
      storedLevels[serverId] ?? 'mentions';
  }

  const feedRows = await selectUnreadMentionFeedRowsForUser(
    pool,
    userId,
    channelIds,
  );

  const rows: EchoMentionNotificationRow[] = [];
  const seen = new Set<string>();

  for (const row of feedRows) {
    const channelId = row.channel_id.trim();
    if (!channelId) continue;
    const key = `${channelId}:${row.id}`;
    if (seen.has(key)) continue;

    const serverId = serverChannelToServerId.get(channelId);
    const isServerChannel = !!serverId;
    if (!isServerChannel && !dmChannelIds.has(channelId)) continue;

    const override = channelOverridesByChannelId[channelId];
    // Snoozed channels (server or DM) drop out of the inbox entirely.
    if (isEchoChannelSnoozed(override, nowMs)) continue;

    const memberRoleIds = serverId
      ? selfRoleIdsByServer.get(serverId)
      : undefined;
    const classifyViewer = { ...viewerClassifyBase, memberRoleIds };
    const mentions = parseMentions(row.mentions);

    const rawPing = mergeAttentionPingKinds(
      classifyAttentionPingKind(mentions, classifyViewer),
      row.is_reply_to_self ? 'personal' : null,
    );
    // No actual ping for the viewer (e.g. a mention of someone else): skip.
    if (!rawPing) continue;

    if (isServerChannel) {
      const level = resolveEffectiveChannelNotificationLevel(
        serverNotificationLevelByServerId[serverId!] ?? 'mentions',
        override,
        nowMs,
      );
      const effective = applyAttentionNotificationLevel(level, rawPing);
      if (!effective) continue;
    }

    const mentionKinds = selfPingingMentionKinds(mentions, classifyViewer);
    if (row.is_reply_to_self && !mentionKinds.includes('user')) {
      mentionKinds.push('user');
    }

    seen.add(key);
    rows.push({
      key,
      channelId,
      channelKind: isServerChannel ? 'server' : 'dm',
      ...(serverId ? { serverId } : {}),
      messageId: row.id,
      authorId: row.author_id,
      authorName: row.author_display_label,
      ...(row.author_pfp ? { authorAvatar: row.author_pfp } : {}),
      content: row.content,
      timestamp: row.created_at,
      mentionKinds,
    });

    if (rows.length >= maxRows) break;
  }

  return rows;
}
