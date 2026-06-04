import type { Ref } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { isDmThreadId, type RailTab } from '@/features/layout/mainSurface';
import { logShellNav } from '@/features/layout/shellNavDebugLog';
import { pickFirstGuildToBootstrap } from '@/services/domain/workspaceShellSelection';
import { workspaceFirstGuildBootstrapGuard } from '@/services/orchestration/workspaceFirstGuildBootstrapGuard';
import type { EchoWorkspaceHydrateServerSlice } from '@/services/orchestration/workspaceEchoHydrateFromApi';
import { channelExistsInRawCategories } from '@/features/layout/composables/guildShellSettling';
import { readLastVisitedServerChannelMap } from '@/utils/lastVisitedNavigationPersistence';

export type ApplyWorkspaceBootstrapServerNavParams = {
  servers: readonly { id: string }[];
  serverStore: EchoWorkspaceHydrateServerSlice;
  activeRailTab: Ref<RailTab>;
  activeChannelId: Ref<string>;
  categoriesByServer: EchoWorkspaceState['categoriesByServer'];
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  /** Active Echo DM channel ids — used to avoid stealing focus from an open DM. */
  echoDmThreadIds?: ReadonlySet<string> | null;
  /** Peer id of an in-progress DM call, if any. */
  dmCallWithUserId?: string | null;
  /** Debug label so the caller's shell-nav traces stay distinguishable. */
  logSource?: string;
};

/**
 * Select the preferred guild + first text channel and switch to the servers rail
 * after workspace data arrives — but only when no real guild is selected yet and
 * the shell is not parked on a DM / active call. Shared by the reconnect hydrate
 * path ({@link runEchoWorkspaceHydrateFromApi}) and the boot path
 * (`useAppLayoutBootstrap`) so both behave identically.
 */
export function applyWorkspaceBootstrapServerNav(
  p: ApplyWorkspaceBootstrapServerNavParams,
): void {
  if (!p.servers.length) return;

  const hadNoServer =
    !p.serverStore.selectedServerId ||
    p.serverStore.selectedServerId === 'echo';
  if (!hadNoServer) return;

  const source = p.logSource ?? 'workspaceBootstrapServerNav';
  const guard = workspaceFirstGuildBootstrapGuard({
    activeRailTab: p.activeRailTab.value,
    activeChannelId: p.activeChannelId.value ?? '',
    echoDmThreadIds: p.echoDmThreadIds ?? null,
    dmCallWithUserId: p.dmCallWithUserId ?? null,
    isDmThreadId,
  });

  if (guard.skipFirstGuildBootstrap) {
    logShellNav(source, 'skip_hydrate_first_server_first_channel', {
      inDmRail: guard.inDmRail,
      legacyDmShell: guard.legacyDmShell,
      inEchoDmSet: guard.inEchoDmSet,
      inDmCall: guard.inDmCall,
      cid: guard.cid,
    });
    return;
  }

  const preferredId = pickFirstGuildToBootstrap(p.servers, () =>
    p.serverStore.pickPreferredGuildServerId(),
  );
  if (preferredId) {
    p.serverStore.selectServer(preferredId);
    const cats = p.categoriesByServer[preferredId] ?? [];
    const remembered =
      readLastVisitedServerChannelMap()[preferredId]?.trim() ?? '';
    const nextChannel = channelExistsInRawCategories(cats, remembered)
      ? remembered
      : p.getFirstTextChannelId(cats);
    if (nextChannel) {
      logShellNav(source, 'hydrate_first_server_first_channel', {
        first: nextChannel,
        serverId: preferredId,
        fromLastVisited: nextChannel === remembered,
      });
      p.activeChannelId.value = nextChannel;
    }
  }
  p.activeRailTab.value = 'servers';
}
