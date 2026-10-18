/**
 * After workspace hydrate, when the user has no guild selected we normally
 * select a preferred server + first text channel. Skip that when the shell is
 * clearly in a DM context so we do not steal focus from DMs / active calls.
 */
export type WorkspaceFirstGuildBootstrapGuardInput = {
  activeRailTab: string;
  activeChannelId: string;
  echoDmThreadIds?: ReadonlySet<string> | null;
  dmCallWithUserId?: string | null;
  /**
   * Peer selected for a 1:1 DM (including while `/dm/open` is in flight). Bootstrap
   * must not yank back to a guild while this is set — `selectServer('echo')` alone
   * is what makes hydrate eligible to steal.
   */
  selectedDMUserId?: string | null;
  /** True while `/dm/open` is resolving (optimistic shell / empty-state race). */
  isOpeningDmThread?: boolean;
  isDmThreadId: (channelId: string) => boolean;
};

export type WorkspaceFirstGuildBootstrapGuardResult = {
  skipFirstGuildBootstrap: boolean;
  inDmRail: boolean;
  legacyDmShell: boolean;
  inEchoDmSet: boolean;
  inDmCall: boolean;
  hasSelectedDmUser: boolean;
  openingDmThread: boolean;
  cid: string | null;
};

export function workspaceFirstGuildBootstrapGuard(
  input: WorkspaceFirstGuildBootstrapGuardInput,
): WorkspaceFirstGuildBootstrapGuardResult {
  const cid = input.activeChannelId.trim();
  const inDmRail = input.activeRailTab === 'dm';
  const legacyDmShell = cid ? input.isDmThreadId(cid) : false;
  const inEchoDmSet = input.echoDmThreadIds?.has(cid) ?? false;
  const inDmCall = Boolean(input.dmCallWithUserId?.trim());
  const hasSelectedDmUser = Boolean(input.selectedDMUserId?.trim());
  const openingDmThread = input.isOpeningDmThread === true;
  const skipFirstGuildBootstrap =
    inDmRail ||
    legacyDmShell ||
    inEchoDmSet ||
    inDmCall ||
    hasSelectedDmUser ||
    openingDmThread;
  return {
    skipFirstGuildBootstrap,
    inDmRail,
    legacyDmShell,
    inEchoDmSet,
    inDmCall,
    hasSelectedDmUser,
    openingDmThread,
    cid: cid || null,
  };
}
