import type { EchoPresenceStatus } from '@shared/types';

export type User = {
  id: string;
  name?: string;
  pfp?: string;
  status?: string;
  customStatus?: string;
};

const CANONICAL_PRESENCE = new Set<EchoPresenceStatus>([
  'online',
  'idle',
  'do_not_disturb',
  'offline',
]);

const PRESENCE_LABELS: Readonly<Record<EchoPresenceStatus, string>> = {
  online: 'Online',
  idle: 'Idle',
  do_not_disturb: 'Do Not Disturb',
  offline: 'Offline',
};

const PRESENCE_SORT_ORDER: Readonly<Record<EchoPresenceStatus, number>> = {
  online: 0,
  idle: 1,
  do_not_disturb: 2,
  offline: 4,
};

const warnedPresenceKeys = new Set<string>();

function warnPresenceOnce(key: string, message: string, data: unknown): void {
  if (!key || warnedPresenceKeys.has(key)) return;
  warnedPresenceKeys.add(key);
  console.warn(message, data);
}

/** Hover / native title for {@link StatusIndicator} and similar presence dots. */
export function presenceIndicatorTitle(input: {
  status?: string | null;
  mobileSurface?: boolean;
  /** Blue Discord dot when active on Discord but not Echo. */
  discordOnline?: boolean;
}): string {
  if (input.discordOnline) {
    return 'Active on Discord';
  }
  const status = normalizeCanonicalPresenceStatus(input.status) ?? 'offline';
  const label = PRESENCE_LABELS[status];
  if (input.mobileSurface && status !== 'offline') {
    return `${label} · Mobile`;
  }
  return label;
}

export function normalizeCanonicalPresenceStatus(
  status: string | undefined | null,
): EchoPresenceStatus | undefined {
  if (typeof status !== 'string') return undefined;
  const trimmed = status.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!CANONICAL_PRESENCE.has(trimmed as EchoPresenceStatus)) return undefined;
  return trimmed as EchoPresenceStatus;
}

export function isKnownPresenceStatus(
  status: string | undefined | null,
): status is EchoPresenceStatus {
  return normalizeCanonicalPresenceStatus(status) !== undefined;
}

export type PresenceSelection = {
  status: EchoPresenceStatus | undefined;
  isLoaded: boolean;
  isOffline: boolean;
  label: string;
  sortOrder: number;
  indicatorStatus: EchoPresenceStatus | undefined;
  /** True when the user is on a phone-class Echo client (compact mobile badge). */
  indicatorMobileSurface: boolean;
};

export function selectPresence(input: {
  authoritativeStatus?: string | null | undefined;
  rowStatus?: string | null | undefined;
  diagnosticsKey?: string;
  /** From Echo `active_client` / presence batch when the peer uses a mobile Web client. */
  mobileSurface?: boolean;
}): PresenceSelection {
  const authoritative = normalizeCanonicalPresenceStatus(
    input.authoritativeStatus,
  );
  const row = normalizeCanonicalPresenceStatus(input.rowStatus);
  const hasAuthoritativeInput =
    typeof input.authoritativeStatus === 'string' &&
    input.authoritativeStatus.trim().length > 0;
  const hasRowInput =
    typeof input.rowStatus === 'string' && input.rowStatus.trim().length > 0;
  const hasUnknownInput =
    (hasAuthoritativeInput && !authoritative) || (hasRowInput && !row);

  if (input.diagnosticsKey && authoritative && row && authoritative !== row) {
    warnPresenceOnce(
      `presence-mismatch:${input.diagnosticsKey}`,
      '[presence] authoritative status disagrees with row status',
      {
        diagnosticsKey: input.diagnosticsKey,
        authoritativeStatus: authoritative,
        rowStatus: row,
      },
    );
  }

  const status = authoritative ?? row;
  if (!status) {
    if (input.diagnosticsKey && hasUnknownInput) {
      warnPresenceOnce(
        `presence-unknown:${input.diagnosticsKey}`,
        '[presence] unknown presence status value',
        {
          diagnosticsKey: input.diagnosticsKey,
          authoritativeStatus: input.authoritativeStatus,
          rowStatus: input.rowStatus,
        },
      );
    }
    return {
      status: undefined,
      isLoaded: false,
      isOffline: false,
      label: 'Unknown',
      sortOrder: 3,
      indicatorStatus: undefined,
      indicatorMobileSurface: false,
    };
  }

  const indicatorMobileSurface = !!input.mobileSurface && status !== 'offline';

  return {
    status,
    isLoaded: true,
    isOffline: status === 'offline',
    label: PRESENCE_LABELS[status],
    sortOrder: PRESENCE_SORT_ORDER[status],
    indicatorStatus: status,
    indicatorMobileSurface,
  };
}

export function selectSelfPresence(input: {
  userId?: string | null | undefined;
  authoritativeStatusesByUserId?:
    | Record<string, string | undefined>
    | null
    | undefined;
  sessionStatus?: string | null | undefined;
  rowStatus?: string | null | undefined;
  diagnosticsKey?: string;
  mobileSurface?: boolean;
}): PresenceSelection {
  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const liveStatus = userId
    ? input.authoritativeStatusesByUserId?.[userId]
    : undefined;
  return selectPresence({
    authoritativeStatus: liveStatus ?? input.sessionStatus,
    rowStatus: input.rowStatus,
    diagnosticsKey: input.diagnosticsKey,
    mobileSurface: input.mobileSurface,
  });
}

export function applyPresenceUpdate(
  users: User[],
  event: { userId: string; status: string },
): User[] {
  const status = normalizeCanonicalPresenceStatus(event.status);
  if (!status) return users;
  return users.map((u) => (u.id === event.userId ? { ...u, status } : u));
}

export function resolveMessageAuthorPresenceStatus(input: {
  rowStatus?: string | null | undefined;
  overlayStatus?: string | null | undefined;
}): EchoPresenceStatus | undefined {
  return selectPresence({
    authoritativeStatus: input.overlayStatus,
    rowStatus: input.rowStatus,
  }).status;
}
