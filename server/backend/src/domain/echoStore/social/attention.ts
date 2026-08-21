import type pg from 'pg';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  mergeAttentionPingKinds,
  resolveEffectiveChannelNotificationLevel,
} from '../../../../../../contracts/attentionPing';
import type { EchoChannelNotificationOverride } from '../../../../../../contracts/types';
import type {
  EchoAttentionChannelSummary,
  EchoAttentionPingKind,
  EchoAttentionSnapshot,
  MentionEntity,
  EchoAttentionServerSummary,
  EchoServerNotificationLevel,
} from '../../../../../../contracts/types';
import {
  queryEchoDmThreadsForUser,
  selectUnreadAttentionAggregatesByChannel,
  selectUnreadAttentionAggregatesForUsersOnChannel,
  selectUnreadMentionRowsForAttention,
  selectUnreadReplyToSelfRowsForAttention,
  type UnreadAttentionAggregate,
} from '../../echoMessagesDal';
import { listEchoWorkspaceForUser } from '../channels/categoriesWorkspace';
import {
  listEchoChannelReadStatesForUser,
  listEchoChannelReadStatesForUsersOnChannel,
} from '../channels/channelReadState';
import { ECHO_DM_REALM_SERVER_ID } from './dmThreads';
import { listEchoMemberRoleAssignmentsForUsers } from '../roles/memberRoleAssignments';
import { listEchoSelfRoleIdsByServer } from '../roles/roles';
import { listEchoServerNotificationLevelsForUser } from '../servers/serverNotificationPreferences';
import { listEchoChannelNotificationOverridesForUser } from '../channels/channelNotificationOverrides';
import { getEchoUserPublicProfileRow } from '../members/userTypingProfile';

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
  const [
    readStateByChannelId,
    storedLevels,
    selfRoleIdsByServer,
    channelOverridesByChannelId,
  ] = await Promise.all([
    listEchoChannelReadStatesForUser(pool, userId, channelIds),
    listEchoServerNotificationLevelsForUser(pool, userId, serverIds),
    listEchoSelfRoleIdsByServer(pool, userId, serverIds),
    listEchoChannelNotificationOverridesForUser(pool, userId, channelIds),
  ]);
  const nowMs = Date.now();
  const effectiveChannelLevel = (
    channelId: string,
    serverLevel: EchoServerNotificationLevel,
  ): EchoServerNotificationLevel =>
    resolveEffectiveChannelNotificationLevel(
      serverLevel,
      channelOverridesByChannelId[channelId] as
        | EchoChannelNotificationOverride
        | undefined,
      nowMs,
    );

  const serverNotificationLevelByServerId: Record<
    string,
    EchoServerNotificationLevel
  > = {};
  for (const serverId of serverIds) {
    serverNotificationLevelByServerId[serverId] =
      storedLevels[serverId] ?? 'mentions';
  }

  // Servers where the viewer has no roles get an explicit empty set so the
  // classify path sees the same shape as before (never undefined).
  for (const serverId of serverIds) {
    if (!selfRoleIdsByServer.has(serverId)) {
      selfRoleIdsByServer.set(serverId, new Set());
    }
  }

  const [aggregates, mentionRows, replyToSelfRows] =
    channelIds.length > 0
      ? await Promise.all([
          selectUnreadAttentionAggregatesByChannel(pool, userId, channelIds),
          selectUnreadMentionRowsForAttention(pool, userId, channelIds),
          selectUnreadReplyToSelfRowsForAttention(pool, userId, channelIds),
        ])
      : [[], [], []];

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
    const level = effectiveChannelLevel(
      channelId,
      serverNotificationLevelByServerId[serverId] ?? 'mentions',
    );
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

  for (const row of replyToSelfRows) {
    const channelId = row.channel_id;
    const serverId = serverChannelToServerId.get(channelId);
    if (!serverId) continue;
    const level = effectiveChannelLevel(
      channelId,
      serverNotificationLevelByServerId[serverId] ?? 'mentions',
    );
    const classified = applyAttentionNotificationLevel(level, 'personal');
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
    /** When set (fanout batch), skips re-querying unread aggregates for this channel. */
    unreadAggregate?: UnreadAttentionAggregate | null;
  },
): Promise<EchoAttentionChannelSummary> {
  const base: EchoAttentionChannelSummary = {
    channelId,
    kind: opts.serverId ? 'server' : 'dm',
    ...(opts.serverId ? { serverId: opts.serverId } : {}),
    lastReadMessageId: opts.lastReadMessageId,
    unreadCount: 0,
  };

  const aggPromise =
    opts.unreadAggregate !== undefined
      ? Promise.resolve(opts.unreadAggregate ? [opts.unreadAggregate] : [])
      : selectUnreadAttentionAggregatesByChannel(pool, userId, [channelId]);

  const [aggregates, mentionRows, replyToSelfRows] = await Promise.all([
    aggPromise,
    selectUnreadMentionRowsForAttention(pool, userId, [channelId]),
    selectUnreadReplyToSelfRowsForAttention(pool, userId, [channelId]),
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
    if (replyToSelfRows.length > 0) {
      pingKind = mergeAttentionPingKinds(
        pingKind,
        applyAttentionNotificationLevel(level, 'personal'),
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

export type EchoChannelAttentionFanoutDelta = {
  userId: string;
  lastReadMessageId: string | null;
  channelAttention: EchoAttentionChannelSummary;
};

/**
 * Build per-user channel attention deltas after a message in one channel.
 * Uses batched read-state + unread SQL; full mention/ping classification only
 * for users with unread > 0.
 */
export async function buildEchoChannelAttentionFanoutDeltas(
  pool: pg.Pool,
  channelId: string,
  userIds: Iterable<string>,
  opts: { serverId?: string | null },
): Promise<EchoChannelAttentionFanoutDelta[]> {
  const ch = channelId.trim();
  const unique = [
    ...new Set([...userIds].map((id) => id.trim()).filter(Boolean)),
  ];
  if (!ch || unique.length === 0) return [];

  const serverId = opts.serverId?.trim() || null;
  const isGuild = !!serverId && serverId !== ECHO_DM_REALM_SERVER_ID;

  const [readStateByUserId, unreadByUser] = await Promise.all([
    listEchoChannelReadStatesForUsersOnChannel(pool, ch, unique),
    selectUnreadAttentionAggregatesForUsersOnChannel(pool, ch, unique),
  ]);
  const unreadMap = new Map(
    unreadByUser.map((row) => [row.user_id, row] as const),
  );

  const notificationLevelByUserId: Record<string, EchoServerNotificationLevel> =
    {};
  let roleIdsByUserId: Record<string, string[]> = {};
  if (isGuild && serverId) {
    const [levelsRes, roleAssignments] = await Promise.all([
      pool.query(
        `
        SELECT user_id, level
        FROM echo_server_notification_preferences
        WHERE server_id = $1
          AND user_id = ANY($2::text[])
        `,
        [serverId, unique],
      ),
      listEchoMemberRoleAssignmentsForUsers(pool, serverId, unique),
    ]);
    roleIdsByUserId = roleAssignments;
    for (const row of levelsRes.rows) {
      const uid = String(row.user_id ?? '').trim();
      const level = String(row.level ?? '').trim();
      if (
        uid &&
        (level === 'all' ||
          level === 'mentions' ||
          level === 'mentions_direct' ||
          level === 'none')
      ) {
        notificationLevelByUserId[uid] = level as EchoServerNotificationLevel;
      }
    }
  }

  const out: EchoChannelAttentionFanoutDelta[] = [];
  for (const userId of unique) {
    const lastReadMessageId = readStateByUserId[userId] ?? null;
    const agg = unreadMap.get(userId);
    if (!agg || agg.unread_count <= 0) {
      out.push({
        userId,
        lastReadMessageId,
        channelAttention: {
          channelId: ch,
          kind: isGuild ? 'server' : 'dm',
          ...(isGuild && serverId ? { serverId } : {}),
          lastReadMessageId,
          unreadCount: 0,
        },
      });
      continue;
    }
    const channelAttention = await buildEchoSingleChannelAttention(
      pool,
      userId,
      ch,
      {
        lastReadMessageId,
        serverId: isGuild ? (serverId ?? undefined) : undefined,
        notificationLevel: isGuild
          ? (notificationLevelByUserId[userId] ?? 'mentions')
          : undefined,
        memberRoleIds: isGuild
          ? new Set(roleIdsByUserId[userId] ?? [])
          : undefined,
        unreadAggregate: {
          channel_id: agg.channel_id,
          server_id: agg.server_id,
          unread_count: agg.unread_count,
          first_unread_message_id: agg.first_unread_message_id,
          first_unread_created_at: agg.first_unread_created_at,
          latest_unread_message_id: agg.latest_unread_message_id,
          latest_unread_created_at: agg.latest_unread_created_at,
        },
      },
    );
    out.push({ userId, lastReadMessageId, channelAttention });
  }
  return out;
}
