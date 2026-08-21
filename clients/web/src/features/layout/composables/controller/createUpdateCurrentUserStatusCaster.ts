import type { EchoPresenceStatus } from '@shared/types';
import { normalizeCanonicalPresenceStatus } from '@/features/layout/presence';

export function createUpdateCurrentUserStatusCaster(
  updateCurrentUserStatus: (status: EchoPresenceStatus) => void,
) {
  return (status: string) => {
    const canonical = normalizeCanonicalPresenceStatus(status);
    if (!canonical) return;
    updateCurrentUserStatus(canonical);
  };
}
