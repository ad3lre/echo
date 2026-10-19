import type pg from 'pg';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  compareEchoTimelineIds,
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
  selectUnreadMentionRowsForUsersOnChannel,
  selectUnreadMentionRowsForAttention,
  selectUnreadReplyingUsersOnChannel,
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
import {
  getEchoUserPublicProfileRow,
  getEchoUserPublicProfileRows,
} from '../members/userTypingProfile';

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

/** Keep the newest timeline id when classifying mention-inbox anchors. */
function newerTimelineId(
  current: string | undefined,
  candidate: string,
): string {
  const next = candidate.trim();
  if (!next) return current?.trim() ?? '';
  const prev = current?.trim() ?? '';
  if (!prev) return next;
  return compareEchoTimelineIds(next, prev) > 0 ? next : prev;
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

  // Build per-channel ping kinds + newest self-pinging mention id from the scan.
  const pingKindByChannel = new Map<string, EchoAttentionPingKind | null>();
  const latestMentionIdByChannel = new Map<string, string>();
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
    if (classified) {
      latestMentionIdByChannel.set(
        channelId,
        newerTimelineId(latestMentionIdByChannel.get(channelId), row.id),
      );
    }
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
    if (classified) {
      latestMentionIdByChannel.set(
        channelId,
        newerTimelineId(latestMentionIdByChannel.get(channelId), row.id),
      );
    }
  }

  for (const agg of aggregates) {
    const current = channelAttentionSeed.get(agg.channel_id);
    if (!current) continue;
    const pingKind = mergeAttentionPingKinds(
      current.pingKind ?? null,
      pingKindByChannel.get(agg.channel_id) ?? null,
    );
    const mentionMessageId = latestMentionIdByChannel
      .get(agg.channel_id)
      ?.trim();
    channelAttentionSeed.set(agg.channel_id, {
      ...current,
      unreadCount: agg.unread_count,
      firstUnreadMessageId: agg.first_unread_message_id ?? undefined,
      latestUnreadMessageId: agg.latest_unread_message_id ?? undefined,
      latestUnreadMessageAt: agg.latest_unread_created_at ?? undefined,
      ...(mentionMessageId
        ? { latestUnreadMentionMessageId: mentionMessageId }
        : {}),
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
  let latestMentionMessageId = '';
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
      const classified = applyAttentionNotificationLevel(
        level,
        classifyAttentionPingKind(parseMentions(row.mentions), classifyViewer),
      );
      pingKind = mergeAttentionPingKinds(pingKind, classified);
      if (classified) {
        latestMentionMessageId = newerTimelineId(
          latestMentionMessageId,
          row.id,
        );
      }
    }
    for (const row of replyToSelfRows) {
      const classified = applyAttentionNotificationLevel(level, 'personal');
      pingKind = mergeAttentionPingKinds(pingKind, classified);
      if (classified) {
        latestMentionMessageId = newerTimelineId(
          latestMentionMessageId,
          row.id,
        );
      }
    }
  }

  return {
    ...base,
    unreadCount: agg.unread_count,
    firstUnreadMessageId: agg.first_unread_message_id ?? undefined,
    latestUnreadMessageId: agg.latest_unread_message_id ?? undefined,
    latestUnreadMessageAt: agg.latest_unread_created_at ?? undefined,
    ...(latestMentionMessageId
      ? { latestUnreadMentionMessageId: latestMentionMessageId }
      : {}),
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
  const unreadUserIds = unique.filter(
    (userId) => (unreadMap.get(userId)?.unread_count ?? 0) > 0,
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

  const profileRowsByUserId = new Map<
    string,
    Awaited<ReturnType<typeof getEchoUserPublicProfileRow>>
  >();
  const mentionRowsByUserId = new Map<
    string,
    { id: string; mentions: unknown }[]
  >();
  let replyingUserIds = new Set<string>();
  if (isGuild && unreadUserIds.length > 0) {
    const profileBatches: string[][] = [];
    for (let offset = 0; offset < unreadUserIds.length; offset += 200) {
      profileBatches.push(unreadUserIds.slice(offset, offset + 200));
    }
    const [mentionRows, replying, profilesByBatch] = await Promise.all([
      selectUnreadMentionRowsForUsersOnChannel(pool, ch, unreadUserIds),
      selectUnreadReplyingUsersOnChannel(pool, ch, unreadUserIds),
      Promise.all(
        profileBatches.map((ids) => getEchoUserPublicProfileRows(pool, ids)),
      ),
    ]);
    for (const row of mentionRows) {
      const rows = mentionRowsByUserId.get(row.user_id) ?? [];
      rows.push({ id: row.id, mentions: row.mentions });
      mentionRowsByUserId.set(row.user_id, rows);
    }
    replyingUserIds = new Set(replying);
    for (const profile of profilesByBatch.flat()) {
      profileRowsByUserId.set(profile.id, profile);
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
    let pingKind: EchoAttentionPingKind | null = null;
    let latestMentionMessageId = '';
    if (isGuild) {
      const profile = profileRowsByUserId.get(userId);
      const level = notificationLevelByUserId[userId] ?? 'mentions';
      const memberRoleIds = new Set(roleIdsByUserId[userId] ?? []);
      for (const row of mentionRowsByUserId.get(userId) ?? []) {
        const classified = applyAttentionNotificationLevel(
          level,
          classifyAttentionPingKind(parseMentions(row.mentions), {
            userId,
            ...(profile?.username?.trim()
              ? { username: profile.username.trim() }
              : {}),
            ...(profile?.name?.trim()
              ? { displayName: profile.name.trim() }
              : {}),
            memberRoleIds,
          }),
        );
        pingKind = mergeAttentionPingKinds(pingKind, classified);
        if (classified) {
          latestMentionMessageId = newerTimelineId(
            latestMentionMessageId,
            row.id,
          );
        }
      }
      if (replyingUserIds.has(userId)) {
        const classified = applyAttentionNotificationLevel(level, 'personal');
        pingKind = mergeAttentionPingKinds(pingKind, classified);
        // Reply-to-self scan is existence-only in fanout; the newest unread is
        // the best available anchor when no mention entity row classified.
        if (classified && !latestMentionMessageId) {
          latestMentionMessageId =
            agg.latest_unread_message_id?.trim() ??
            agg.first_unread_message_id?.trim() ??
            '';
        }
      }
    }
    const channelAttention: EchoAttentionChannelSummary = {
      channelId: ch,
      kind: isGuild ? 'server' : 'dm',
      ...(isGuild && serverId ? { serverId } : {}),
      lastReadMessageId,
      unreadCount: agg.unread_count,
      firstUnreadMessageId: agg.first_unread_message_id ?? undefined,
      latestUnreadMessageId: agg.latest_unread_message_id ?? undefined,
      latestUnreadMessageAt: agg.latest_unread_created_at ?? undefined,
      ...(latestMentionMessageId
        ? { latestUnreadMentionMessageId: latestMentionMessageId }
        : {}),
      ...(pingKind ? { pingKind } : {}),
    };
    out.push({ userId, lastReadMessageId, channelAttention });
  }
  return out;
}
