/**
 * In-memory gates for DM call signaling: invite rate limits + pending-invite
 * binding so forged `accept` cannot spoof an answered call without a prior ring.
 */

export const DM_CALL_INVITE_WINDOW_MS = 30_000;
export const DM_CALL_INVITE_MAX_PER_WINDOW = 5;
export const DM_CALL_INVITE_GLOBAL_WINDOW_MS = 60_000;
export const DM_CALL_INVITE_GLOBAL_MAX = 12;
export const DM_CALL_PENDING_TTL_MS = 90_000;
export const DM_CALL_ACCEPT_WINDOW_MS = 30_000;
export const DM_CALL_ACCEPT_MAX_PER_WINDOW = 8;
export const DM_CALL_END_WINDOW_MS = 30_000;
export const DM_CALL_END_MAX_PER_WINDOW = 12;

type PendingInvite = {
  inviterUserId: string;
  correlationId: string;
  expiresAt: number;
};

const inviteTimestampsByUser = new Map<string, number[]>();
const inviteTimestampsByUserChannel = new Map<string, number[]>();
const acceptTimestampsByUserChannel = new Map<string, number[]>();
const endTimestampsByUserChannel = new Map<string, number[]>();
const pendingInviteByChannel = new Map<string, PendingInvite>();

let nextSweepAt = 0;

function pruneTimestampMap(
  map: Map<string, number[]>,
  now: number,
  windowMs: number,
): void {
  for (const [key, stamps] of map) {
    const kept = stamps.filter((t) => now - t < windowMs);
    if (kept.length === 0) map.delete(key);
    else map.set(key, kept);
  }
}

function sweep(now: number): void {
  if (now < nextSweepAt) return;
  nextSweepAt = now + 30_000;
  pruneTimestampMap(
    inviteTimestampsByUser,
    now,
    DM_CALL_INVITE_GLOBAL_WINDOW_MS,
  );
  pruneTimestampMap(
    inviteTimestampsByUserChannel,
    now,
    DM_CALL_INVITE_WINDOW_MS,
  );
  pruneTimestampMap(
    acceptTimestampsByUserChannel,
    now,
    DM_CALL_ACCEPT_WINDOW_MS,
  );
  pruneTimestampMap(endTimestampsByUserChannel, now, DM_CALL_END_WINDOW_MS);
  for (const [channelId, pending] of pendingInviteByChannel) {
    if (pending.expiresAt <= now) pendingInviteByChannel.delete(channelId);
  }
}

function allowAgainstWindow(
  map: Map<string, number[]>,
  key: string,
  now: number,
  windowMs: number,
  max: number,
): boolean {
  const prev = map.get(key) ?? [];
  const kept = prev.filter((t) => now - t < windowMs);
  if (kept.length >= max) {
    map.set(key, kept);
    return false;
  }
  kept.push(now);
  map.set(key, kept);
  return true;
}

export function resetDmCallSignalGateForTests(): void {
  inviteTimestampsByUser.clear();
  inviteTimestampsByUserChannel.clear();
  acceptTimestampsByUserChannel.clear();
  endTimestampsByUserChannel.clear();
  pendingInviteByChannel.clear();
  nextSweepAt = 0;
}

export function clearDmCallPendingInvite(channelId: string): void {
  pendingInviteByChannel.delete(channelId.trim());
}

export function getDmCallPendingInviteForTests(
  channelId: string,
): PendingInvite | undefined {
  return pendingInviteByChannel.get(channelId.trim());
}

export type DmCallSignalGateDecision =
  | { ok: true }
  | { ok: false; reason: string };

export function gateDmCallInvite(opts: {
  userId: string;
  channelId: string;
  correlationId: string;
  now?: number;
}): DmCallSignalGateDecision {
  const now = opts.now ?? Date.now();
  sweep(now);
  const userId = opts.userId.trim();
  const channelId = opts.channelId.trim();
  if (!userId || !channelId) return { ok: false, reason: 'missing_channel' };

  if (
    !allowAgainstWindow(
      inviteTimestampsByUser,
      userId,
      now,
      DM_CALL_INVITE_GLOBAL_WINDOW_MS,
      DM_CALL_INVITE_GLOBAL_MAX,
    )
  ) {
    return { ok: false, reason: 'invite_rate_global' };
  }
  if (
    !allowAgainstWindow(
      inviteTimestampsByUserChannel,
      `${userId}\0${channelId}`,
      now,
      DM_CALL_INVITE_WINDOW_MS,
      DM_CALL_INVITE_MAX_PER_WINDOW,
    )
  ) {
    return { ok: false, reason: 'invite_rate_channel' };
  }

  pendingInviteByChannel.set(channelId, {
    inviterUserId: userId,
    correlationId: opts.correlationId.trim(),
    expiresAt: now + DM_CALL_PENDING_TTL_MS,
  });
  return { ok: true };
}

export function gateDmCallAccept(opts: {
  userId: string;
  channelId: string;
  correlationId: string;
  now?: number;
}): DmCallSignalGateDecision {
  const now = opts.now ?? Date.now();
  sweep(now);
  const userId = opts.userId.trim();
  const channelId = opts.channelId.trim();
  if (!userId || !channelId) return { ok: false, reason: 'missing_channel' };

  if (
    !allowAgainstWindow(
      acceptTimestampsByUserChannel,
      `${userId}\0${channelId}`,
      now,
      DM_CALL_ACCEPT_WINDOW_MS,
      DM_CALL_ACCEPT_MAX_PER_WINDOW,
    )
  ) {
    return { ok: false, reason: 'accept_rate_channel' };
  }

  const pending = pendingInviteByChannel.get(channelId);
  if (!pending || pending.expiresAt <= now) {
    pendingInviteByChannel.delete(channelId);
    return { ok: false, reason: 'no_pending_invite' };
  }
  if (pending.inviterUserId === userId) {
    return { ok: false, reason: 'accept_by_inviter' };
  }
  const corr = opts.correlationId.trim();
  if (pending.correlationId && corr && pending.correlationId !== corr) {
    return { ok: false, reason: 'correlation_mismatch' };
  }

  pendingInviteByChannel.delete(channelId);
  return { ok: true };
}

export function gateDmCallEnd(opts: {
  userId: string;
  channelId: string;
  now?: number;
}): DmCallSignalGateDecision {
  const now = opts.now ?? Date.now();
  sweep(now);
  const userId = opts.userId.trim();
  const channelId = opts.channelId.trim();
  if (!userId || !channelId) return { ok: false, reason: 'missing_channel' };

  if (
    !allowAgainstWindow(
      endTimestampsByUserChannel,
      `${userId}\0${channelId}`,
      now,
      DM_CALL_END_WINDOW_MS,
      DM_CALL_END_MAX_PER_WINDOW,
    )
  ) {
    return { ok: false, reason: 'end_rate_channel' };
  }

  // Ending clears any outstanding ring so a later forged accept cannot land.
  pendingInviteByChannel.delete(channelId);
  return { ok: true };
}
