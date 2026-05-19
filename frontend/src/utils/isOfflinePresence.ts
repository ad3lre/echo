import { selectPresence } from '@/services/domain/presence';

/**
 * Whether to render a user with offline styling (muted name, grayscale avatar).
 * Unknown / empty status is not treated as offline; wait for authoritative presence.
 */
export function isOfflinePresence(status: string | undefined): boolean {
  return selectPresence({ rowStatus: status }).isOffline;
}

/**
 * Chat message author / mention row: only grey when `status` is present and offline.
 * Missing or blank status means “unknown” — keep default styling (API/workspace rows
 * sometimes use `''` before presence sync; that must not read as “offline”).
 */
export function isMessageAuthorOffline(status: string | undefined): boolean {
  return selectPresence({ rowStatus: status }).isLoaded
    ? isOfflinePresence(status)
    : false;
}
