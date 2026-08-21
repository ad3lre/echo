import type { EchoPresenceStatus } from '../../../../contracts/types/presence';

export const ECHO_PRESENCE_STATUS_VALUES: readonly EchoPresenceStatus[] = [
  'online',
  'idle',
  'do_not_disturb',
  'offline',
];

const ECHO_PRESENCE_STATUS_SET = new Set<string>(ECHO_PRESENCE_STATUS_VALUES);

const PRESENCE_ALIASES: Readonly<Record<string, EchoPresenceStatus>> = {
  dnd: 'do_not_disturb',
  busy: 'do_not_disturb',
};

export type EchoPresenceState = {
  status: EchoPresenceStatus;
  updatedAtMs: number;
};

export type EchoPresenceSignal = {
  source: 'http' | 'socket:set' | 'socket:heartbeat' | 'disconnect' | 'sweep';
  status?: string | null | undefined;
  occurredAtMs: number;
};

export type EchoPresenceAuthorityRow = {
  userId: string;
  status: string | null | undefined;
  activeClient?: 'web' | 'mobile' | null;
};

export function normalizePresenceStatus(
  input: string | null | undefined,
): EchoPresenceStatus | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return undefined;
  const canonical = PRESENCE_ALIASES[trimmed] ?? trimmed;
  if (!ECHO_PRESENCE_STATUS_SET.has(canonical)) return undefined;
  return canonical as EchoPresenceStatus;
}

export function applyPresenceSignal(
  existing: EchoPresenceState | undefined,
  signal: EchoPresenceSignal,
): EchoPresenceState | undefined {
  let nextStatus: EchoPresenceStatus | undefined;
  switch (signal.source) {
    case 'disconnect':
    case 'sweep':
      nextStatus = 'offline';
      break;
    case 'http':
      nextStatus = normalizePresenceStatus(signal.status) ?? 'online';
      break;
    case 'socket:set':
    case 'socket:heartbeat':
      nextStatus = normalizePresenceStatus(signal.status);
      break;
  }

  if (!nextStatus) return existing;
  return {
    status: nextStatus,
    updatedAtMs: signal.occurredAtMs,
  };
}

export function buildPresenceMap(
  rows: readonly EchoPresenceAuthorityRow[],
  requestedIds: readonly string[],
): Record<string, EchoPresenceStatus> {
  const requested = requestedIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const requestedSet = new Set(requested);
  const out: Record<string, EchoPresenceStatus> = {};
  for (const userId of requested) {
    out[userId] = 'offline';
  }
  for (const row of rows) {
    const userId = row.userId.trim();
    if (!userId || !requestedSet.has(userId)) continue;
    const status = normalizePresenceStatus(row.status);
    if (!status) continue;
    out[userId] = status;
  }
  return out;
}

/** Sparse map: only users on a phone-style client (for avatar “mobile” glyph). */
export function buildPresenceClientMap(
  rows: readonly EchoPresenceAuthorityRow[],
  requestedIds: readonly string[],
): Record<string, 'mobile'> {
  const requested = requestedIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const requestedSet = new Set(requested);
  const out: Record<string, 'mobile'> = {};
  for (const row of rows) {
    const userId = row.userId.trim();
    if (!userId || !requestedSet.has(userId)) continue;
    if (row.activeClient === 'mobile') {
      out[userId] = 'mobile';
    }
  }
  return out;
}

export function shouldMarkOffline(
  lastHeartbeatAtMs: number,
  nowMs: number,
  staleAfterMinutes: number,
): boolean {
  if (!Number.isFinite(lastHeartbeatAtMs)) return false;
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(staleAfterMinutes) || staleAfterMinutes <= 0) {
    return false;
  }
  return nowMs - lastHeartbeatAtMs >= staleAfterMinutes * 60_000;
}

export function hasFreshActivePresence(
  existing: EchoPresenceState | undefined,
  nowMs: number,
  staleAfterMinutes: number,
): boolean {
  if (!existing) return false;
  if (existing.status === 'offline') return false;
  return !shouldMarkOffline(existing.updatedAtMs, nowMs, staleAfterMinutes);
}

export function resolveSocketPresenceSetState(
  existing: EchoPresenceState | undefined,
  signal: {
    payloadStatus?: string | null | undefined;
    authenticatedStatus?: string | null | undefined;
    occurredAtMs: number;
    staleAfterMinutes: number;
  },
): EchoPresenceState | undefined {
  if (
    hasFreshActivePresence(
      existing,
      signal.occurredAtMs,
      signal.staleAfterMinutes,
    )
  ) {
    return {
      status: existing!.status,
      updatedAtMs: signal.occurredAtMs,
    };
  }

  const nextStatus =
    normalizePresenceStatus(signal.authenticatedStatus) ??
    normalizePresenceStatus(signal.payloadStatus);
  if (!nextStatus) return undefined;
  return {
    status: nextStatus,
    updatedAtMs: signal.occurredAtMs,
  };
}
