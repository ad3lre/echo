import { hasPriorRegistration } from '@/utils/priorRegistration';
import { readSavedServerRailOrder } from '@/utils/serverRailOrderPersistence';
import {
  readLastVisitedGuildId,
  readLastVisitedServerChannelMap,
} from '@/utils/lastVisitedNavigationPersistence';

const PINNED_MORE_SERVERS_STORAGE_KEY = 'echo-pinned-more-servers-v1';

export type WorkspaceEmptyRecoveryHints = {
  hasPriorRegistration: boolean;
  savedServerRailOrderCount: number;
  lastVisitedGuildId: string | null;
  lastVisitedServerChannelCount: number;
  pinnedMoreServerIdsCount: number;
};

function readPinnedMoreServerIdsCount(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(PINNED_MORE_SERVERS_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return 0;
    let count = 0;
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const id = entry.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/** Best-effort client persistence that implies the account previously had joined guilds. */
export function readWorkspaceEmptyRecoveryHints(): WorkspaceEmptyRecoveryHints {
  return {
    hasPriorRegistration: hasPriorRegistration(),
    savedServerRailOrderCount: readSavedServerRailOrder().length,
    lastVisitedGuildId: readLastVisitedGuildId(),
    lastVisitedServerChannelCount: Object.keys(
      readLastVisitedServerChannelMap(),
    ).length,
    pinnedMoreServerIdsCount: readPinnedMoreServerIdsCount(),
  };
}

export function hasJoinedServersPersistenceEvidence(
  hints: WorkspaceEmptyRecoveryHints,
): boolean {
  return (
    hints.hasPriorRegistration ||
    hints.savedServerRailOrderCount > 0 ||
    !!hints.lastVisitedGuildId ||
    hints.lastVisitedServerChannelCount > 0 ||
    hints.pinnedMoreServerIdsCount > 0
  );
}
