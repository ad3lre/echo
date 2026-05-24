import { computed, type Ref } from 'vue';
import type { EchoAttentionDmSummary } from '@shared/types';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import { compareActivityRankDesc } from '@/features/dm/buildDmPanelUserList';

/**
 * Rail rank source-of-truth: server `lastActivityAt` for this channel, falling back
 * to the attention summary's `lastMessageAt` only when no live activity is known yet.
 */
function rankForRail(
  channelId: string,
  lastActivityAtMsByChannelId: ReadonlyMap<string, number> | undefined,
  fallbackLastMessageAt: string | undefined,
): { ms: number } {
  const server = lastActivityAtMsByChannelId?.get(channelId) ?? 0;
  if (server > 0) return { ms: server };
  if (fallbackLastMessageAt) {
    const t = new Date(fallbackLastMessageAt).getTime();
    if (Number.isFinite(t) && t > 0) return { ms: t };
  }
  return { ms: 0 };
}

/** Avatar slot under the DM rail icon (1:1 or group thread). */
export type DmIncomingRailAvatar =
  | {
      kind: 'user';
      userId: string;
      name: string;
      pfp: string;
      unreadCount: number;
      /** Active DM call with this peer; UI shows call badge instead of unread count. */
      inCall?: boolean;
    }
  | {
      kind: 'group';
      channelId: string;
      name: string;
      pfp: string;
      unreadCount: number;
      /** Active group DM call for this thread; UI shows call badge instead of unread count. */
      inCall?: boolean;
    };

type UserRow = {
  userId: string;
  name: string;
  pfp: string;
  rank: { ms: number };
  unreadCount: number;
  inCall: boolean;
};

type GroupRow = {
  channelId: string;
  name: string;
  pfp: string;
  rank: { ms: number };
  unreadCount: number;
  inCall: boolean;
};

type MergedRailRow =
  | ({
      kind: 'user';
    } & UserRow)
  | ({
      kind: 'group';
    } & GroupRow);

export function useAppLayoutDmRailUnread(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  activeChannelId: Ref<string>;
  activeDmPeerUserId?: Ref<string | null>;
  dmAttentionByChannelId: Ref<Record<string, EchoAttentionDmSummary>>;
  /** Local unread-by-channel map derived from message ids + read cursor. */
  dmUnreadCountByChannelId?: Ref<ReadonlyMap<string, number>>;
  /** Known group DM threads (snowflake ids); used to classify attention rows without a peer. */
  groupDMs?: Ref<
    Readonly<Record<string, { name?: string; pfp?: string } | undefined>>
  >;
  isDmChannelId?: (
    channelId: string,
    summary: EchoAttentionDmSummary,
  ) => boolean;
  /** Client “close DM” — exclude from rail stack until new activity. */
  isHiddenDmUser?: (userId: string) => boolean;
  isHiddenDmGroup?: (channelId: string) => boolean;
  /** Active 1:1 DM call peers to keep pinned in rail while call is live. */
  activeCallUserIds?: Ref<ReadonlySet<string>>;
  /** Active group DM call thread ids to keep pinned in rail while call is live. */
  activeCallGroupIds?: Ref<ReadonlySet<string>>;
  /** Authoritative ms-epoch activity timestamps per channel id; matches the DM panel sort. */
  lastActivityAtMsByChannelId?: Ref<ReadonlyMap<string, number>>;
  /** Persisted 1:1 DM channel id → peer user id (for threads missing from attention snapshots). */
  echoDmPeerByChannelId?: Ref<ReadonlyMap<string, string>>;
}) {
  const {
    authSession,
    workspace,
    activeChannelId,
    activeDmPeerUserId,
    dmAttentionByChannelId,
  } = deps;

  /**
   * Unread DM threads where the latest message is from someone other than the
   * active reader context, newest first. Drives server-rail avatar stack under
   * the DM icon (stacked avatar shortcuts). Includes group DMs.
   */
  const dmIncomingRailCluster = computed(() => {
    const selfId = authSession.backendUser?.id?.trim();
    if (!selfId || !authSession.isAuthenticated) {
      return {
        avatars: [] as DmIncomingRailAvatar[],
        overflowCount: 0,
        totalUnreadCount: 0,
      };
    }
    const active = activeChannelId.value;
    const activePeer = activeDmPeerUserId?.value?.trim() || '';
    const unreadAttentionChannelIds = new Set<string>();
    const railChannelIds = new Set<string>();

    const byUser = new Map<string, UserRow>();
    const groupRows = new Map<string, GroupRow>();

    function upsertRow(next: UserRow) {
      const prev = byUser.get(next.userId);
      if (!prev) {
        byUser.set(next.userId, next);
        return;
      }
      byUser.set(next.userId, {
        ...prev,
        rank: { ms: Math.max(prev.rank.ms, next.rank.ms) },
        unreadCount: prev.unreadCount + next.unreadCount,
        inCall: prev.inCall || next.inCall,
      });
    }

    for (const [channelId, summary] of Object.entries(
      dmAttentionByChannelId.value,
    )) {
      if (deps.isDmChannelId && !deps.isDmChannelId(channelId, summary))
        continue;

      const localUnreadCount =
        deps.dmUnreadCountByChannelId?.value.get(channelId) ?? null;
      const effectiveUnreadCount =
        localUnreadCount != null
          ? localUnreadCount
          : typeof summary.unreadCount === 'number' && summary.unreadCount > 0
            ? summary.unreadCount
            : summary.unread
              ? 1
              : 0;
      if (effectiveUnreadCount < 1) continue;

      const groupMeta = deps.groupDMs?.value[channelId];
      if (groupMeta) {
        const inCall = deps.activeCallGroupIds?.value.has(channelId) ?? false;
        if (channelId === active && !inCall) continue;
        unreadAttentionChannelIds.add(channelId);
        railChannelIds.add(channelId);
        groupRows.set(channelId, {
          channelId,
          name: groupMeta.name?.trim() || 'Group',
          pfp: groupMeta.pfp ?? '',
          rank: rankForRail(
            channelId,
            deps.lastActivityAtMsByChannelId?.value,
            summary.lastMessageAt,
          ),
          unreadCount: effectiveUnreadCount,
          inCall,
        });
        continue;
      }

      const peer = summary.peerUserId ?? null;
      if (!peer || peer === selfId) continue;
      const inCall = deps.activeCallUserIds?.value.has(peer) ?? false;
      if (deps.isHiddenDmUser?.(peer)) continue;
      if (activePeer && peer === activePeer && !inCall) continue;
      if (channelId === active && !inCall) continue;
      unreadAttentionChannelIds.add(channelId);
      railChannelIds.add(channelId);

      const u = workspace.users.value.find((x) => x.id === peer);
      upsertRow({
        userId: peer,
        name: u?.name ?? 'User',
        pfp: u?.pfp ?? '',
        rank: rankForRail(
          channelId,
          deps.lastActivityAtMsByChannelId?.value,
          summary.lastMessageAt,
        ),
        unreadCount: effectiveUnreadCount,
        inCall,
      });
    }

    function rankForLocalUnreadRailRow(channelId: string) {
      const r = rankForRail(
        channelId,
        deps.lastActivityAtMsByChannelId?.value,
        undefined,
      );
      return r.ms > 0 ? r : { ms: Date.now() };
    }

    function mergeLocalUnreadRailRow(
      channelId: string,
      effectiveUnreadCount: number,
    ) {
      if (effectiveUnreadCount < 1) return;
      if (
        deps.isDmChannelId &&
        !deps.isDmChannelId(channelId, {} as EchoAttentionDmSummary)
      ) {
        return;
      }

      const groupMeta = deps.groupDMs?.value[channelId];
      if (groupMeta) {
        const inCall = deps.activeCallGroupIds?.value.has(channelId) ?? false;
        if (channelId === active && !inCall) return;
        railChannelIds.add(channelId);
        groupRows.set(channelId, {
          channelId,
          name: groupMeta.name?.trim() || 'Group',
          pfp: groupMeta.pfp ?? '',
          rank: rankForLocalUnreadRailRow(channelId),
          unreadCount: effectiveUnreadCount,
          inCall,
        });
        return;
      }

      const peer =
        deps.echoDmPeerByChannelId?.value.get(channelId)?.trim() ?? null;
      if (!peer || peer === selfId) return;
      const inCall = deps.activeCallUserIds?.value.has(peer) ?? false;
      if (deps.isHiddenDmUser?.(peer)) return;
      if (activePeer && peer === activePeer && !inCall) return;
      if (channelId === active && !inCall) return;

      railChannelIds.add(channelId);
      const u = workspace.users.value.find((x) => x.id === peer);
      upsertRow({
        userId: peer,
        name: u?.name ?? 'User',
        pfp: u?.pfp ?? '',
        rank: rankForLocalUnreadRailRow(channelId),
        unreadCount: effectiveUnreadCount,
        inCall,
      });
    }

    for (const [channelId, unreadCount] of deps.dmUnreadCountByChannelId
      ?.value ?? []) {
      if (railChannelIds.has(channelId)) continue;
      mergeLocalUnreadRailRow(channelId, unreadCount);
    }

    // Pending incoming message requests can surface on the rail as inbox
    // activity, but they must not inflate unread-message counters.
    for (const req of workspace.messageRequests?.value ?? []) {
      const peer = req.fromUserId?.trim();
      if (!peer || peer === selfId) continue;
      if (deps.isHiddenDmUser?.(peer)) continue;
      if (activePeer && peer === activePeer) continue;
      if (req.channelId === active) continue;
      // If server attention already reports this DM channel as unread, do not
      // count the same pending request again.
      if (unreadAttentionChannelIds.has(req.channelId)) continue;
      const u = workspace.users.value.find((x) => x.id === peer);
      upsertRow({
        userId: peer,
        name: u?.name ?? 'User',
        pfp: u?.pfp ?? '',
        rank: { ms: 0 },
        unreadCount: 0,
        inCall: deps.activeCallUserIds?.value.has(peer) ?? false,
      });
    }

    const now = Date.now();
    for (const peer of deps.activeCallUserIds?.value ?? []) {
      const userId = peer.trim();
      if (!userId || userId === selfId) continue;
      if (deps.groupDMs?.value[userId]) continue;
      if (deps.isHiddenDmUser?.(userId)) continue;
      const u = workspace.users.value.find((x) => x.id === userId);
      upsertRow({
        userId,
        name: u?.name ?? 'User',
        pfp: u?.pfp ?? '',
        rank: { ms: now },
        unreadCount: 0,
        inCall: true,
      });
    }

    for (const channelId of deps.activeCallGroupIds?.value ?? []) {
      const cid = channelId.trim();
      if (!cid || deps.isHiddenDmGroup?.(cid)) continue;
      const groupMeta = deps.groupDMs?.value[cid];
      groupRows.set(cid, {
        channelId: cid,
        name: groupMeta?.name?.trim() || 'Group',
        pfp: groupMeta?.pfp ?? '',
        rank: { ms: now },
        unreadCount: groupRows.get(cid)?.unreadCount ?? 0,
        inCall: true,
      });
    }

    const userMerged: MergedRailRow[] = Array.from(byUser.values()).map(
      (r) => ({
        kind: 'user' as const,
        ...r,
      }),
    );
    const groupMerged: MergedRailRow[] = Array.from(groupRows.values()).map(
      (r) => ({
        kind: 'group' as const,
        ...r,
      }),
    );
    const deduped = [...userMerged, ...groupMerged].sort((a, b) => {
      const byActivity = compareActivityRankDesc(a.rank, b.rank);
      if (byActivity !== 0) return byActivity;
      return a.name.localeCompare(b.name);
    });

    const avatars: DmIncomingRailAvatar[] = deduped.slice(0, 3).map((row) => {
      if (row.kind === 'user') {
        return {
          kind: 'user',
          userId: row.userId,
          name: row.name,
          pfp: row.pfp,
          unreadCount: row.unreadCount,
          ...(row.inCall ? { inCall: true } : {}),
        };
      }
      return {
        kind: 'group',
        channelId: row.channelId,
        name: row.name,
        pfp: row.pfp,
        unreadCount: row.unreadCount,
        ...(row.inCall ? { inCall: true } : {}),
      };
    });
    const overflowCount = Math.max(0, deduped.length - 3);
    const totalUnreadCount = deduped.reduce(
      (sum, row) => sum + row.unreadCount,
      0,
    );
    return { avatars, overflowCount, totalUnreadCount };
  });

  return {
    dmIncomingRailCluster,
  };
}
