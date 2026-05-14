import { isKnownPresenceStatus } from '@/services/domain/presence';

export function isValidEchoPresenceStatus(status: string): boolean {
  return isKnownPresenceStatus(status);
}

export function isTransientPresenceFetchError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = 'message' in e && typeof e.message === 'string' ? e.message : '';
  const name = 'name' in e && typeof e.name === 'string' ? e.name : '';
  if (name === 'AbortError') return true;
  const low = msg.trim().toLowerCase();
  return (
    low === 'failed to fetch' ||
    low.includes('networkerror') ||
    low.includes('network request failed')
  );
}
