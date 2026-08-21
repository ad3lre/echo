import type { EchoDmThreadFromApi } from '@/features/dm/echoDmThreadsFromHttp';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import type { EchoDmRealtimeThread } from '@shared/types';

export type EchoDmThreadInput = EchoDmThreadFromApi | EchoDmRealtimeThread;

export type EchoDmGroupRecord = {
  id: string;
  name: string;
  memberIds: string[];
  pfp?: string;
};

export type EchoDmThreadRegistryUser = {
  id: string;
  pfp?: string;
};

export type EchoDmThreadRegistryState = {
  peerByChannelId: ReadonlyMap<string, string>;
  threadIds: ReadonlySet<string>;
  lastActivityIdByChannelId: ReadonlyMap<string, string>;
  lastActivityAtMsByChannelId: ReadonlyMap<string, number>;
  activeCallParticipantUserIdsByChannelId: ReadonlyMap<string, string[]>;
  groupDMs: Readonly<Record<string, EchoDmGroupRecord>>;
};

export type EchoDmThreadRegistryContext = {
  selfId?: string;
  users?: readonly EchoDmThreadRegistryUser[];
};

export function compareEchoActivityIdDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  try {
    const ai = BigInt(a);
    const bi = BigInt(b);
    if (ai === bi) return 0;
    return ai > bi ? -1 : 1;
  } catch {
    return b.localeCompare(a);
  }
}

export function parseEchoIsoToMs(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function normalizeActiveCallParticipants(thread: EchoDmThreadInput): string[] {
  if (!('activeCallParticipantUserIds' in thread)) return [];
  if (!Array.isArray(thread.activeCallParticipantUserIds)) return [];
  return thread.activeCallParticipantUserIds
    .map((id) => String(id).trim())
    .filter(Boolean);
}

function resolveFallbackGroupPfp(
  thread: Extract<EchoDmThreadInput, { kind: 'group' }>,
  ctx: EchoDmThreadRegistryContext,
): string {
  const persisted =
    'pfp' in thread && typeof thread.pfp === 'string' ? thread.pfp.trim() : '';
  if (persisted) return persisted;

  const otherId =
    thread.memberUserIds.find((id) => id !== ctx.selfId) ??
    thread.memberUserIds[0];
  if (!otherId) return '';
  return ctx.users?.find((u) => u.id === otherId)?.pfp ?? '';
}

export function mergeEchoDmThreadIntoRegistry(
  state: EchoDmThreadRegistryState,
  thread: EchoDmThreadInput,
  opts: EchoDmThreadRegistryContext & { overrideLastActivityId?: string } = {},
): EchoDmThreadRegistryState {
  const peerByChannelId = new Map(state.peerByChannelId);
  const threadIds = new Set(state.threadIds);
  const lastActivityIdByChannelId = new Map(state.lastActivityIdByChannelId);
  const lastActivityAtMsByChannelId = new Map(
    state.lastActivityAtMsByChannelId,
  );
  const activeCallParticipantUserIdsByChannelId = new Map(
    state.activeCallParticipantUserIdsByChannelId,
  );
  const groupDMs: Record<string, EchoDmGroupRecord> = { ...state.groupDMs };

  threadIds.add(thread.channelId);

  const lastActivityId =
    opts.overrideLastActivityId?.trim() ||
    ('lastActivityId' in thread && typeof thread.lastActivityId === 'string'
      ? thread.lastActivityId.trim()
      : '');
  if (lastActivityId) {
    const prev = lastActivityIdByChannelId.get(thread.channelId) ?? '';
    if (!prev || compareEchoActivityIdDesc(lastActivityId, prev) < 0) {
      lastActivityIdByChannelId.set(thread.channelId, lastActivityId);
    }
  }

  const lastActivityAtMs =
    'lastActivityAt' in thread ? parseEchoIsoToMs(thread.lastActivityAt) : 0;
  if (lastActivityAtMs > 0) {
    const prevAt = lastActivityAtMsByChannelId.get(thread.channelId) ?? 0;
    if (lastActivityAtMs > prevAt) {
      lastActivityAtMsByChannelId.set(thread.channelId, lastActivityAtMs);
    }
  }

  if ('activeCallParticipantUserIds' in thread) {
    const ids = normalizeActiveCallParticipants(thread);
    if (ids.length > 0) {
      activeCallParticipantUserIdsByChannelId.set(thread.channelId, ids);
    } else {
      activeCallParticipantUserIdsByChannelId.delete(thread.channelId);
    }
  }

  if (thread.kind === 'group') {
    groupDMs[thread.channelId] = {
      id: thread.channelId,
      name: thread.name,
      memberIds: thread.memberUserIds,
      pfp: resolveFallbackGroupPfp(thread, opts),
    };
  } else if (thread.peerUserId) {
    peerByChannelId.set(thread.channelId, thread.peerUserId);
  }

  return {
    peerByChannelId,
    threadIds,
    lastActivityIdByChannelId,
    lastActivityAtMsByChannelId,
    activeCallParticipantUserIdsByChannelId,
    groupDMs,
  };
}

export function pruneEchoDmGraphThreadsMissingFromSnapshot(
  state: EchoDmThreadRegistryState,
  incomingChannelIds: ReadonlySet<string>,
): EchoDmThreadRegistryState {
  const toRemove: string[] = [];
  for (const ch of state.threadIds) {
    if (!isEchoGraphId(ch)) continue;
    if (!incomingChannelIds.has(ch)) toRemove.push(ch);
  }
  return removeEchoDmThreadsByChannelId(state, toRemove);
}

export function mergeEchoDmThreadSnapshotIntoRegistry(
  state: EchoDmThreadRegistryState,
  threads: readonly EchoDmThreadFromApi[],
  ctx: EchoDmThreadRegistryContext = {},
): EchoDmThreadRegistryState {
  const incomingIds = new Set(
    threads
      .map((t) => String(t.channelId).trim())
      .filter((id): id is string => Boolean(id)),
  );
  let next = state;
  for (const thread of threads) {
    next = mergeEchoDmThreadIntoRegistry(next, thread, ctx);
  }
  return pruneEchoDmGraphThreadsMissingFromSnapshot(next, incomingIds);
}

export function removeEchoDmThreadsByChannelId(
  state: EchoDmThreadRegistryState,
  channelIds: readonly string[],
): EchoDmThreadRegistryState {
  if (!channelIds.length) return state;

  const peerByChannelId = new Map(state.peerByChannelId);
  const threadIds = new Set(state.threadIds);
  const lastActivityIdByChannelId = new Map(state.lastActivityIdByChannelId);
  const lastActivityAtMsByChannelId = new Map(
    state.lastActivityAtMsByChannelId,
  );
  const activeCallParticipantUserIdsByChannelId = new Map(
    state.activeCallParticipantUserIdsByChannelId,
  );
  const groupDMs: Record<string, EchoDmGroupRecord> = { ...state.groupDMs };

  for (const channelId of channelIds) {
    peerByChannelId.delete(channelId);
    threadIds.delete(channelId);
    lastActivityIdByChannelId.delete(channelId);
    lastActivityAtMsByChannelId.delete(channelId);
    activeCallParticipantUserIdsByChannelId.delete(channelId);
    delete groupDMs[channelId];
  }

  return {
    peerByChannelId,
    threadIds,
    lastActivityIdByChannelId,
    lastActivityAtMsByChannelId,
    activeCallParticipantUserIdsByChannelId,
    groupDMs,
  };
}

export function removeEchoDmThreadsForPeer(
  state: EchoDmThreadRegistryState,
  peerUserId: string,
): EchoDmThreadRegistryState {
  const toRemove: string[] = [];
  for (const [channelId, peer] of state.peerByChannelId) {
    if (peer === peerUserId) toRemove.push(channelId);
  }
  return removeEchoDmThreadsByChannelId(state, toRemove);
}
