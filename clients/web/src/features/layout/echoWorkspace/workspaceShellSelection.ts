import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import {
  hasJoinedServersPersistenceEvidence,
  type WorkspaceEmptyRecoveryHints,
} from '@/features/layout/echoWorkspace/workspaceEmptyRecoveryHints';

export type WorkspaceShellEmptyOnboardingParams = {
  activeRailTab: string;
  serverCount: number;
  selectedServerId: string | null | undefined;
  categoriesForServer: ChannelCategory[];
  /**
   * When false, workspace data is still loading or the server list is not trusted
   * (e.g. failed sync). Avoid showing the “no servers yet” onboarding surface.
   */
  workspaceReady?: boolean;
  /**
   * When true, the authoritative snapshot is empty but client persistence says the
   * member previously had guilds — treat as a sync issue, not onboarding.
   */
  suspiciousEmptyWorkspace?: boolean;
};

export type SuspiciousEmptyWorkspaceParams = {
  serverCount: number;
  workspaceFromApi: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  recoveryExhausted?: boolean;
  hints: WorkspaceEmptyRecoveryHints;
};

/**
 * True when the workspace snapshot says “zero guilds” but local evidence says the
 * account should have joined servers (stale cache, failed hydrate, etc.).
 */
export function isSuspiciousEmptyWorkspace(
  p: SuspiciousEmptyWorkspaceParams,
): boolean {
  if (p.recoveryExhausted) return false;
  if (!p.isAuthenticated || p.isGuest) return false;
  if (p.serverCount !== 0) return false;
  if (!p.workspaceFromApi) return false;
  return hasJoinedServersPersistenceEvidence(p.hints);
}

/**
 * Derives whether the shell is in the "empty server onboarding" state.
 */
export function isServerEmptyOnboarding(
  p: WorkspaceShellEmptyOnboardingParams,
): boolean {
  if (p.workspaceReady === false) return false;
  if (p.suspiciousEmptyWorkspace) return false;
  if (p.activeRailTab !== 'servers') return false;
  // "Empty onboarding" is only the account-level empty workspace state.
  // A selected server with zero categories/channels should remain in normal server mode
  // so the channel rail can show create affordances.
  if (p.serverCount === 0) return true;
  return false;
}

/** Whether the current server selection is invalid after `serverId` was removed. */
export function shouldRetargetServerAfterServerDeletion(
  deletedServerId: string,
  selectedServerId: string | null,
  remainingServerIds: readonly string[],
): boolean {
  const cur = selectedServerId;
  return (
    cur === deletedServerId ||
    (cur != null && !remainingServerIds.includes(cur))
  );
}

/** Next guild/home server id after the current selection was invalidated. */
export function pickNextServerIdAfterDeletion(
  remainingServerIds: readonly string[],
  pickPreferredGuildServerId: () => string | null,
): string {
  return pickPreferredGuildServerId() ?? remainingServerIds[0] ?? 'echo';
}

/** Initial guild to select when first hydrating the workspace. */
export function pickFirstGuildToBootstrap(
  servers: readonly { id: string }[],
  pickPreferredGuildServerId: () => string | null,
): string | null {
  if (servers.length === 0) return null;
  return pickPreferredGuildServerId() ?? servers[0]!.id;
}
