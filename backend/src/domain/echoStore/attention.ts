import type pg from 'pg';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  mergeAttentionPingKinds,
} from '../../../../shared/attentionPing';
import type {
  EchoAttentionChannelSummary,
  EchoAttentionPingKind,
  EchoAttentionSnapshot,
  MentionEntity,
  EchoAttentionServerSummary,
  EchoServerNotificationLevel,
} from '../../../../shared/types';
import {
  queryEchoDmThreadsForUser,
  selectUnreadAttentionAggregatesByChannel,
  selectUnreadMentionRowsForAttention,
  type UnreadAttentionAggregate,
} from '../echoMessagesDal';
import { listEchoWorkspaceForUser } from './categoriesWorkspace';
import { listEchoChannelReadStatesForUser } from './channelReadState';
import { listEchoMemberRoleAssignmentsByUser } from './roles';
import { listEchoServerNotificationLevelsForUser } from './serverNotificationPreferences';
import { getEchoUserPublicProfileRow } from './userTypingProfile';

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

export async function buildEchoAttentionSnapshot(
  pool: pg.Pool,
  userId: string,
): Promise<EchoAttentionSnapshot> {
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
  const visibleServerChannelIds: string[] = [];
  for (const [serverId, categories] of Object.entries(categoriesByServer)) {
    for (const category of categories) {
      for (const channel of category.channels) {
        serverChannelToServerId.set(channel.id, serverId);
        visibleServerChannelIds.push(channel.id);
      }
    }
  }

  const channelAttentionSeed = new Map<string, EchoAttentionChannelSummary>();
  for (const channelId of visibleServerChannelIds) {
    channelAttentionSeed.set(channelId, {
      channelId,
      kind: 'server',
      serverId: serverChannelToServerId.get(channelId),
      lastReadMessageId: null,
      unreadCount: 0,
    });
  }
  for (const thread of dmThreads) {
    channelAttentionSeed.set(thread.channelId, {
      channelId: thread.channelId,
      kind: 'dm',
      lastReadMessageId: null,
      unreadCount: 0,
      ...(thread.kind === 'direct' && thread.peerId
        ? { peerUserId: thread.peerId }
        : {}),
    });
  }

  const channelIds = [
    ...new Set([
      ...visibleServerChannelIds,
      ...Array.from(channelAttentionSeed.keys()),
    ]),
  ];
  const [readStateByChannelId, storedLevels, roleAssignmentsByServer] =
    await Promise.all([
      listEchoChannelReadStatesForUser(pool, userId, channelIds),
      listEchoServerNotificationLevelsForUser(pool, userId, serverIds),
      Promise.all(
        serverIds.map(
          async (serverId): Promise<[string, Record<string, string[]>]> => [
            serverId,
            await listEchoMemberRoleAssignmentsByUser(pool, serverId),
          ],
        ),
      ),
    ]);

  const serverNotificationLevelByServerId: Record<
    string,
    EchoServerNotificationLevel
  > = {};
  for (const serverId of serverIds) {
    serverNotificationLevelByServerId[serverId] =
      storedLevels[serverId] ?? 'mentions';
  }

  const selfRoleIdsByServer = new Map<string, Set<string>>();
  for (const [serverId, byUser] of roleAssignmentsByServer) {
    selfRoleIdsByServer.set(serverId, new Set(byUser[userId] ?? []));
  }

  const [aggregates, mentionRows] =
    channelIds.length > 0
      ? await Promise.all([
          selectUnreadAttentionAggregatesByChannel(pool, userId, channelIds),
          selectUnreadMentionRowsForAttention(pool, userId, channelIds),
        ])
      : [[], []];

  for (const [channelId, lastReadMessageId] of Object.entries(
    readStateByChannelId,
  )) {
    const current = channelAttentionSeed.get(channelId);
    if (!current) continue;
    channelAttentionSeed.set(channelId, {
      ...current,
      lastReadMessageId,
    });
  }

  // Build per-channel ping kinds from the bounded mention scan.
  const pingKindByChannel = new Map<string, EchoAttentionPingKind | null>();
  for (const row of mentionRows) {
    const channelId = row.channel_id;
    const serverId = serverChannelToServerId.get(channelId);
    if (!serverId) continue;
    const level = serverNotificationLevelByServerId[serverId] ?? 'mentions';
    const classified = applyAttentionNotificationLevel(
      level,
      classifyAttentionPingKind(parseMentions(row.mentions), {
        ...viewerClassifyBase,
        memberRoleIds: selfRoleIdsByServer.get(serverId),
      }),
    );
    pingKindByChannel.set(
      channelId,
      mergeAttentionPingKinds(
        pingKindByChannel.get(channelId) ?? null,
        classified,
      ),
    );
  }

  for (const agg of aggregates) {
    const current = channelAttentionSeed.get(agg.channel_id);
    if (!current) continue;
    const pingKind = mergeAttentionPingKinds(
      current.pingKind ?? null,
      pingKindByChannel.get(agg.channel_id) ?? null,
    );
    channelAttentionSeed.set(agg.channel_id, {
      ...current,
      unreadCount: agg.unread_count,
      firstUnreadMessageId: agg.first_unread_message_id ?? undefined,
      latestUnreadMessageId: agg.latest_unread_message_id ?? undefined,
      latestUnreadMessageAt: agg.latest_unread_created_at ?? undefined,
      ...(pingKind ? { pingKind } : {}),
    });
  }

  const channelAttentionByChannelId: Record<
    string,
    EchoAttentionChannelSummary
  > = {};
  const serverAttentionByServerId: Record<string, EchoAttentionServerSummary> =
    {};
  for (const [channelId, summary] of channelAttentionSeed.entries()) {
    channelAttentionByChannelId[channelId] = summary;
    if (
      summary.kind !== 'server' ||
      !summary.serverId ||
      summary.unreadCount <= 0
    ) {
      continue;
    }
    const previous = serverAttentionByServerId[summary.serverId];
    const mergedPingKind = mergeAttentionPingKinds(
      previous?.pingKind ?? null,
      summary.pingKind ?? null,
    );
    serverAttentionByServerId[summary.serverId] = {
      unread: true,
      ...(mergedPingKind ? { pingKind: mergedPingKind } : {}),
    };
  }

  return {
    channelAttentionByChannelId,
    serverAttentionByServerId,
    serverNotificationLevelByServerId,
  };
}

/**
 * Build an {@link EchoAttentionChannelSummary} for a single channel after a
 * read-state upsert. Reuses the same aggregate + bounded-mention queries so
 * the numbers match {@link buildEchoAttentionSnapshot}.
 */
export async function buildEchoSingleChannelAttention(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  opts: {
    lastReadMessageId: string | null;
    serverId?: string;
    notificationLevel?: EchoServerNotificationLevel;
    memberRoleIds?: Set<string>;
  },
): Promise<EchoAttentionChannelSummary> {
  const base: EchoAttentionChannelSummary = {
    channelId,
    kind: opts.serverId ? 'server' : 'dm',
    ...(opts.serverId ? { serverId: opts.serverId } : {}),
    lastReadMessageId: opts.lastReadMessageId,
    unreadCount: 0,
  };

  const [aggregates, mentionRows] = await Promise.all([
    selectUnreadAttentionAggregatesByChannel(pool, userId, [channelId]),
    selectUnreadMentionRowsForAttention(pool, userId, [channelId]),
  ]);

  const agg: UnreadAttentionAggregate | undefined = aggregates[0];
  if (!agg || agg.unread_count === 0) return base;

  let pingKind: EchoAttentionPingKind | null = null;
  if (opts.serverId) {
    const prof = await getEchoUserPublicProfileRow(pool, userId);
    const classifyViewer = {
      userId,
      ...(prof?.username?.trim() ? { username: prof.username.trim() } : {}),
      ...(prof?.name?.trim() ? { displayName: prof.name.trim() } : {}),
      memberRoleIds: opts.memberRoleIds,
    };
    const level = opts.notificationLevel ?? 'mentions';
    for (const row of mentionRows) {
      pingKind = mergeAttentionPingKinds(
        pingKind,
        applyAttentionNotificationLevel(
          level,
          classifyAttentionPingKind(
            parseMentions(row.mentions),
            classifyViewer,
          ),
        ),
      );
    }
  }

  return {
    ...base,
    unreadCount: agg.unread_count,
    firstUnreadMessageId: agg.first_unread_message_id ?? undefined,
    latestUnreadMessageId: agg.latest_unread_message_id ?? undefined,
    latestUnreadMessageAt: agg.latest_unread_created_at ?? undefined,
    ...(pingKind ? { pingKind } : {}),
  };
}
