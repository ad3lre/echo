import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  EchoAttentionDmSummary,
  EchoAttentionChannelSummary,
  EchoAttentionPingKind,
  EchoAttentionSnapshot,
  EchoAttentionServerSummary,
} from '@shared/types';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import { loadServerNotificationOverrides } from '@/composables/workspace/utils';
import { compareEchoTimelineIds } from '@/services/domain/echoMessageReadState';
import {
  isServerChannelUnreadForPingBubble,
  resolveEchoUnreadUpperBoundMessageId,
} from '@shared/attentionPing';
import { dbgReadState } from '@/utils/echoReadStateDebug';

function shallowEqualRecord<T>(
  a: Record<string, T>,
  b: Record<string, T>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

function buildReadStateByChannelId(
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>,
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(channelAttentionByChannelId).map(([channelId, summary]) => [
      channelId,
      summary.lastReadMessageId,
    ]),
  );
}

function mergePingKinds(
  current: EchoAttentionPingKind | undefined,
  next: EchoAttentionPingKind | undefined,
): EchoAttentionPingKind | undefined {
  const rank: Record<EchoAttentionPingKind, number> = {
    personal: 3,
    role: 2,
    broadcast: 1,
  };
  if (!current) return next;
  if (!next) return current;
  return rank[next] > rank[current] ? next : current;
}

function isServerChannelEffectivelyUnread(params: {
  summary: EchoAttentionChannelSummary;
  lastReadMessageId: string | null;
}): boolean {
  const { summary, lastReadMessageId } = params;
  const unread = isServerChannelUnreadForPingBubble(summary, lastReadMessageId);
  if (!unread && summary.unreadCount > 0 && summary.kind === 'server') {
    const lr = String(lastReadMessageId ?? '').trim();
    const latest = summary.latestUnreadMessageId?.trim() ?? '';
    const first = summary.firstUnreadMessageId?.trim() ?? '';
    const boundary = latest || (summary.unreadCount === 1 ? first : '');
    if (boundary && lr && compareEchoTimelineIds(lr, boundary) >= 0) {
      dbgReadState('attention_server_unread_suppressed_by_cursor', {
        channelId: summary.channelId,
        serverId: summary.serverId,
        unreadCount: summary.unreadCount,
        lastReadMessageId: lr,
        latestUnreadMessageId: latest || null,
        firstUnreadMessageId: first || null,
      });
    }
  }
  return unread;
}

function computeServerAttentionForServer(params: {
  serverId: string;
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>;
  readStateByChannelId: Record<string, string | null>;
}): EchoAttentionServerSummary | undefined {
  let pingKind: EchoAttentionPingKind | undefined = undefined;
  let hasUnread = false;
  for (const summary of Object.values(params.channelAttentionByChannelId)) {
    if (summary.kind !== 'server' || summary.serverId !== params.serverId)
      continue;
    const lastReadMessageId =
      params.readStateByChannelId[summary.channelId] ??
      summary.lastReadMessageId;
    if (!isServerChannelEffectivelyUnread({ summary, lastReadMessageId }))
      continue;
    hasUnread = true;
    pingKind = mergePingKinds(pingKind, summary.pingKind);
  }
  if (!hasUnread) return undefined;
  return { unread: true, ...(pingKind ? { pingKind } : {}) };
}

function isSameServerAttentionSummary(
  a: EchoAttentionServerSummary | undefined,
  b: EchoAttentionServerSummary | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.unread === b.unread && a.pingKind === b.pingKind;
}

function buildServerAttentionByServerId(
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>,
  readStateByChannelId: Record<string, string | null>,
): Record<string, EchoAttentionServerSummary> {
  const serverAttentionByServerId: Record<string, EchoAttentionServerSummary> =
    {};
  for (const summary of Object.values(channelAttentionByChannelId)) {
    const lastReadMessageId =
      readStateByChannelId[summary.channelId] ?? summary.lastReadMessageId;
    if (
      summary.kind !== 'server' ||
      !summary.serverId ||
      !isServerChannelEffectivelyUnread({ summary, lastReadMessageId })
    ) {
      continue;
    }
    const previous = serverAttentionByServerId[summary.serverId];
    const pingKind = mergePingKinds(previous?.pingKind, summary.pingKind);
    serverAttentionByServerId[summary.serverId] = {
      unread: true,
      ...(pingKind ? { pingKind } : {}),
    };
  }
  return serverAttentionByServerId;
}

function buildDmAttentionByChannelId(
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>,
  readStateByChannelId: Record<string, string | null>,
): Record<string, EchoAttentionDmSummary> {
  return Object.fromEntries(
    Object.entries(channelAttentionByChannelId)
      .filter(([channelId, summary]) => {
        if (summary.kind !== 'dm' || summary.unreadCount <= 0) return false;
        // If the local read cursor has already reached or passed the latest
        // unread message, treat this DM as read immediately — don't wait for the
        // next server snapshot to clear `unreadCount`.
        const cursor =
          readStateByChannelId[channelId] ?? summary.lastReadMessageId ?? null;
        if (!cursor) return true;
        const boundary = resolveEchoUnreadUpperBoundMessageId(summary);
        if (!boundary) return true;
        return compareEchoTimelineIds(cursor, boundary) < 0;
      })
      .map(([channelId, summary]) => [
        channelId,
        {
          channelId,
          unread: summary.unreadCount > 0,
          unreadCount: summary.unreadCount,
          ...(summary.peerUserId ? { peerUserId: summary.peerUserId } : {}),
          ...(summary.latestUnreadMessageId
            ? { lastMessageId: summary.latestUnreadMessageId }
            : {}),
          ...(summary.latestUnreadMessageAt
            ? { lastMessageAt: summary.latestUnreadMessageAt }
            : {}),
          ...(summary.firstUnreadMessageId
            ? { firstUnreadMessageId: summary.firstUnreadMessageId }
            : {}),
        },
      ]),
  );
}

function mergeChannelAttentionByChannelId(params: {
  currentChannelAttentionByChannelId: Record<
    string,
    EchoAttentionChannelSummary
  >;
  currentReadStateByChannelId: Record<string, string | null>;
  incomingChannelAttentionByChannelId: Record<
    string,
    EchoAttentionChannelSummary
  >;
}): Record<string, EchoAttentionChannelSummary> {
  return Object.fromEntries(
    Object.entries(params.incomingChannelAttentionByChannelId).map(
      ([channelId, incomingSummary]) => {
        const currentReadState =
          params.currentReadStateByChannelId[channelId] ??
          params.currentChannelAttentionByChannelId[channelId]
            ?.lastReadMessageId ??
          null;
        const currentSummary =
          params.currentChannelAttentionByChannelId[channelId];
        const effectiveSummary: EchoAttentionChannelSummary = {
          ...incomingSummary,
          latestUnreadMessageId:
            incomingSummary.latestUnreadMessageId ??
            currentSummary?.latestUnreadMessageId,
          firstUnreadMessageId:
            incomingSummary.firstUnreadMessageId ??
            currentSummary?.firstUnreadMessageId,
        };
        if (currentReadState) {
          const cursorAheadOfIncoming =
            !incomingSummary.lastReadMessageId ||
            compareEchoTimelineIds(
              currentReadState,
              incomingSummary.lastReadMessageId,
            ) > 0;
          const effectivelyRead = !isServerChannelUnreadForPingBubble(
            effectiveSummary,
            currentReadState,
          );
          if (cursorAheadOfIncoming || effectivelyRead) {
            return [
              channelId,
              {
                ...effectiveSummary,
                lastReadMessageId: currentReadState,
                ...(effectivelyRead ? { unreadCount: 0 } : {}),
              },
            ];
          }
        }
        return [channelId, incomingSummary];
      },
    ),
  );
}

export const useEchoAttentionStore = defineStore('echoAttention', () => {
  const channelAttentionByChannelId = ref<
    Record<string, EchoAttentionChannelSummary>
  >({});
  const readStateByChannelId = ref<Record<string, string | null>>({});
  const serverAttentionByServerId = ref<
    Record<string, EchoAttentionServerSummary>
  >({});
  const dmAttentionByChannelId = computed(() =>
    buildDmAttentionByChannelId(
      channelAttentionByChannelId.value,
      readStateByChannelId.value,
    ),
  );

  /**
   * Monotonic-ish scalar for **desktop shell** attention (notifications / taskbar cue).
   * Uses the same derived server + DM summaries as the rest of the UI — no second unread model.
   */
  const desktopAttentionScore = computed(() => {
    let score = 0;
    for (const s of Object.values(serverAttentionByServerId.value)) {
      if (!s.unread) continue;
      score += 100;
      if (s.pingKind === 'personal') score += 40;
      else if (s.pingKind === 'role') score += 20;
      else score += 10;
    }
    for (const d of Object.values(dmAttentionByChannelId.value)) {
      const n = d.unreadCount ?? 0;
      score += Math.min(10_000, n * 10);
    }
    return score;
  });
  const serverNotificationLevelByServerId = ref<
    Record<string, ServerNotificationLevel>
  >(loadServerNotificationOverrides());

  function replaceSnapshot(snapshot: EchoAttentionSnapshot): void {
    const nextChannelAttentionByChannelId = mergeChannelAttentionByChannelId({
      currentChannelAttentionByChannelId: channelAttentionByChannelId.value,
      currentReadStateByChannelId: readStateByChannelId.value,
      incomingChannelAttentionByChannelId: {
        ...snapshot.channelAttentionByChannelId,
      },
    });
    if (
      !shallowEqualRecord(
        channelAttentionByChannelId.value,
        nextChannelAttentionByChannelId,
      )
    ) {
      channelAttentionByChannelId.value = nextChannelAttentionByChannelId;
    }
    const nextReadStateByChannelId = buildReadStateByChannelId(
      nextChannelAttentionByChannelId,
    );
    if (
      !shallowEqualRecord(readStateByChannelId.value, nextReadStateByChannelId)
    ) {
      dbgReadState('attention_replace_snapshot_read_state_changed', {
        channelCount: Object.keys(nextReadStateByChannelId).length,
      });
      readStateByChannelId.value = nextReadStateByChannelId;
    }
    const nextServerAttentionByServerId = buildServerAttentionByServerId(
      nextChannelAttentionByChannelId,
      nextReadStateByChannelId,
    );
    if (
      !shallowEqualRecord(
        serverAttentionByServerId.value,
        nextServerAttentionByServerId,
      )
    ) {
      serverAttentionByServerId.value = nextServerAttentionByServerId;
    }
    const nextServerNotificationLevelByServerId = {
      ...snapshot.serverNotificationLevelByServerId,
    };
    if (
      !shallowEqualRecord(
        serverNotificationLevelByServerId.value,
        nextServerNotificationLevelByServerId,
      )
    ) {
      serverNotificationLevelByServerId.value =
        nextServerNotificationLevelByServerId;
    }
  }

  function patchReadState(
    channelId: string,
    lastReadMessageId: string | null,
  ): boolean {
    const prevLastReadMessageId = readStateByChannelId.value[channelId] ?? null;
    if (prevLastReadMessageId === lastReadMessageId) return false;
    if (prevLastReadMessageId && lastReadMessageId) {
      try {
        const prevBig = BigInt(prevLastReadMessageId);
        const nextBig = BigInt(lastReadMessageId);
        if (nextBig < prevBig) {
          dbgReadState('attention_patch_read_state_rejected_regression', {
            channelId,
            prevLastReadMessageId,
            nextLastReadMessageId: lastReadMessageId,
          });
          return false;
        }
      } catch {
        // Non-numeric (UUID) IDs — callers already ensure correct ordering
      }
    }
    dbgReadState('attention_patch_read_state_applied', {
      channelId,
      prevLastReadMessageId,
      nextLastReadMessageId: lastReadMessageId,
    });
    const nextReadStateByChannelId = {
      ...readStateByChannelId.value,
      [channelId]: lastReadMessageId,
    };
    readStateByChannelId.value = nextReadStateByChannelId;

    // Keep server rail badges in sync with local read cursor advances (e.g. seen-message scroll)
    // even when the backend attention snapshot lags.
    const ch = channelAttentionByChannelId.value[channelId];
    const serverId = ch?.kind === 'server' ? (ch.serverId?.trim() ?? '') : '';
    if (serverId) {
      const prev = serverAttentionByServerId.value[serverId];
      const next = computeServerAttentionForServer({
        serverId,
        channelAttentionByChannelId: channelAttentionByChannelId.value,
        readStateByChannelId: nextReadStateByChannelId,
      });
      if (!isSameServerAttentionSummary(prev, next)) {
        const nextMap = { ...serverAttentionByServerId.value };
        if (next) nextMap[serverId] = next;
        else delete nextMap[serverId];
        serverAttentionByServerId.value = nextMap;
      }
    }

    return true;
  }

  /**
   * Merge a `read_state:update` event that includes an optional single-channel
   * attention summary.  Updates both the read cursor and the channel/server
   * badge maps so other tabs converge without a full snapshot round-trip.
   */
  /**
   * Optimistic mark-read for server + DM graph channels: advance cursor and zero
   * `unreadCount` / align unread anchors so rail + sidebar indicators drop immediately
   * when attention omits `latestUnreadMessageId` (plain `patchReadState` would leave
   * volume-based unread stuck until the next snapshot).
   */
  function applyServerChannelMarkRead(
    channelId: string,
    lastReadMessageId: string,
  ): void {
    const markId = lastReadMessageId.trim();
    if (!markId) return;
    const existing = channelAttentionByChannelId.value[channelId];
    if (!existing || (existing.kind !== 'server' && existing.kind !== 'dm')) {
      patchReadState(channelId, markId);
      return;
    }
    const { pingKind: _ping, unreadCount: _unread, ...rest } = existing;
    mergeReadStateUpdate(channelId, markId, {
      ...rest,
      channelId,
      kind: existing.kind,
      lastReadMessageId: markId,
      latestUnreadMessageId: markId,
      unreadCount: 0,
    });
  }

  function mergeReadStateUpdate(
    channelId: string,
    lastReadMessageId: string | null,
    channelAttention?: EchoAttentionChannelSummary,
  ): void {
    patchReadState(channelId, lastReadMessageId);

    if (!channelAttention) return;

    const existing = channelAttentionByChannelId.value[channelId];
    const previousServerId =
      existing?.kind === 'server' ? (existing.serverId?.trim() ?? '') : '';
    const merged: EchoAttentionChannelSummary = {
      ...(existing ?? {}),
      ...channelAttention,
      kind: channelAttention.kind ?? existing?.kind ?? 'server',
      serverId: channelAttention.serverId ?? existing?.serverId,
      peerUserId: channelAttention.peerUserId ?? existing?.peerUserId,
    };
    if (merged.unreadCount <= 0) {
      delete (merged as Partial<EchoAttentionChannelSummary>).pingKind;
    }

    channelAttentionByChannelId.value = {
      ...channelAttentionByChannelId.value,
      [channelId]: merged,
    };

    const nextServerId =
      merged.kind === 'server' ? (merged.serverId?.trim() ?? '') : '';

    // Only recompute the affected server(s) instead of rebuilding the entire map.
    const recompute = (serverId: string) => {
      const sid = serverId.trim();
      if (!sid) return;
      const prev = serverAttentionByServerId.value[sid];
      const next = computeServerAttentionForServer({
        serverId: sid,
        channelAttentionByChannelId: channelAttentionByChannelId.value,
        readStateByChannelId: readStateByChannelId.value,
      });
      if (isSameServerAttentionSummary(prev, next)) return;
      const nextMap = { ...serverAttentionByServerId.value };
      if (next) nextMap[sid] = next;
      else delete nextMap[sid];
      serverAttentionByServerId.value = nextMap;
    };

    if (previousServerId && previousServerId !== nextServerId) {
      recompute(previousServerId);
    }
    if (nextServerId) {
      recompute(nextServerId);
    }
  }

  function patchServerNotificationLevel(
    serverId: string,
    level: ServerNotificationLevel,
  ): void {
    if (serverNotificationLevelByServerId.value[serverId] === level) return;
    serverNotificationLevelByServerId.value = {
      ...serverNotificationLevelByServerId.value,
      [serverId]: level,
    };
  }

  function getLastReadMessageId(channelId: string): string | null | undefined {
    return readStateByChannelId.value[channelId];
  }

  function getServerAttention(
    serverId: string,
  ): EchoAttentionServerSummary | undefined {
    return serverAttentionByServerId.value[serverId];
  }

  function getChannelAttention(
    channelId: string,
  ): EchoAttentionChannelSummary | undefined {
    return channelAttentionByChannelId.value[channelId];
  }

  function getServerNotificationLevel(
    serverId: string,
  ): ServerNotificationLevel | undefined {
    return serverNotificationLevelByServerId.value[serverId];
  }

  function reset(): void {
    channelAttentionByChannelId.value = {};
    readStateByChannelId.value = {};
    serverAttentionByServerId.value = {};
    serverNotificationLevelByServerId.value = {};
  }

  return {
    channelAttentionByChannelId,
    readStateByChannelId,
    serverAttentionByServerId,
    dmAttentionByChannelId,
    desktopAttentionScore,
    serverNotificationLevelByServerId,
    replaceSnapshot,
    patchReadState,
    applyServerChannelMarkRead,
    mergeReadStateUpdate,
    patchServerNotificationLevel,
    getLastReadMessageId,
    getServerAttention,
    getChannelAttention,
    getServerNotificationLevel,
    reset,
  };
});
