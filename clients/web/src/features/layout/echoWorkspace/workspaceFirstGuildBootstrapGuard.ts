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
  isDmThreadId: (channelId: string) => boolean;
};

export type WorkspaceFirstGuildBootstrapGuardResult = {
  skipFirstGuildBootstrap: boolean;
  inDmRail: boolean;
  legacyDmShell: boolean;
  inEchoDmSet: boolean;
  inDmCall: boolean;
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
  const skipFirstGuildBootstrap =
    inDmRail || legacyDmShell || inEchoDmSet || inDmCall;
  return {
    skipFirstGuildBootstrap,
    inDmRail,
    legacyDmShell,
    inEchoDmSet,
    inDmCall,
    cid: cid || null,
  };
}
