import type { ChannelCategory } from '@/composables/useChannels';

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
};

/**
 * Derives whether the shell is in the "empty server onboarding" state.
 */
export function isServerEmptyOnboarding(
  p: WorkspaceShellEmptyOnboardingParams,
): boolean {
  if (p.workspaceReady === false) return false;
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
