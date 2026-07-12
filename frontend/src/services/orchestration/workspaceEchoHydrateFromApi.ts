import type { Ref } from 'vue';
import {
  fetchEchoWorkspaceState,
  type EchoDmThreadFromApi,
  type EchoWorkspaceState,
} from '@/api/echoClient';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { RailTab } from '@/features/layout/mainSurface';
import { applyTimeoutUntilFromWorkspaceSnapshot } from '@/features/layout/viewModel/workspaceTimeoutApplyFromSnapshot';
import {
  fetchWorkspaceSocialForHydrate,
  fetchWorkspaceSocialForRefresh,
} from '@/services/orchestration/workspaceSocialHydrate';
import { applyWorkspaceBootstrapServerNav } from '@/services/orchestration/workspaceBootstrapServerNav';
import {
  saveEchoWorkspaceToCache,
  loadEchoWorkspaceFromCache,
} from '@/utils/workspacePersistence';
import { dbgMemberList } from '@/utils/echoMemberListDebug';
import { buildServerMemberNicknameMapFromMembersByServer } from '@/services/domain/workspaceEchoApiSnapshot';
import {
  withTransientFetchRetries,
  isTransientFetchFailure,
} from '@/utils/retryTransientFetch';
import {
  currentEchoWorkspaceSocialRefreshSeq,
  nextEchoWorkspaceSocialRefreshSeq,
} from './workspaceSocialRefreshSeq';

/** Shell nav / debug labels stay aligned with `useEchoWorkspaceLifecycle` callers. */
const SHELL_SOURCE = 'useEchoWorkspaceLifecycle';

export { invalidateInFlightEchoWorkspaceSocialRefresh } from './workspaceSocialRefreshSeq';

export type EchoWorkspaceHydrateResult =
  | { ok: true }
  | { ok: false; error: unknown; userMessage: string };

export type EchoWorkspaceHydrateServerSlice = {
  selectedServerId: string | null;
  setServers: (servers: EchoWorkspaceState['servers']) => void;
  selectServer: (serverId: string | null) => void;
  pickPreferredGuildServerId: () => string | null;
};

export type EchoWorkspaceHydrateParams = {
  token: string;
  userId: string;
  isGuest: boolean;
  workspace: Pick<
    WorkspaceStateApi,
    | 'consumeSkipEchoWorkspaceHydrate'
    | 'users'
    | 'serverMemberNicknames'
    | 'timeoutUntilByServerUser'
    | 'lastTimeoutWorkspaceVersion'
    | 'lastTimeoutServerCount'
    | 'lastTimeoutMemberKeyCount'
    | 'friendIds'
    | 'friendRequestsIncoming'
    | 'friendRequestsOutgoing'
    | 'messageRequests'
    | 'socialGraphStatus'
  >;
  echoSession: {
    applyWorkspaceSnapshot: (
      state: EchoWorkspaceState,
      opts?: { authoritative?: boolean },
    ) => boolean;
    refreshDiscordVoiceMirrorRosters?: (
      token: string,
      serverIds: string[],
    ) => Promise<void>;
  };
  serverStore: EchoWorkspaceHydrateServerSlice;
  activeChannelId: Ref<string>;
  activeRailTab: Ref<RailTab>;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  mergeEchoDmThreadsFromApi?: (threads: EchoDmThreadFromApi[]) => void;
  mergeEchoBlockedFromApi?: (blockedUserIds: string[]) => void;
  echoDmThreadIds?: Ref<Set<string>>;
  dmCallWithUserId?: Ref<string | null>;
  refreshEchoRoleData: () => Promise<void>;
  syncEchoPresenceFromApi?: () => void;
  ensureAuthUserInMockUsers: () => void;
  /**
   * Auth-rotation guard: returns true when the identity this hydrate was started
   * for is no longer current (logout / login / guest upgrade mid-flight). Checked
   * after each await before applying fetched state to stores.
   */
  isStale?: () => boolean;
};

export async function runEchoWorkspaceHydrateFromApi(
  p: EchoWorkspaceHydrateParams,
): Promise<EchoWorkspaceHydrateResult> {
  try {
    p.workspace.socialGraphStatus.value = 'loading';
    const skipWorkspace = p.workspace.consumeSkipEchoWorkspaceHydrate();

    // 1. Initial render from cache for "blazing fast" start
    if (!skipWorkspace) {
      const cached = loadEchoWorkspaceFromCache(p.userId);
      if (cached) {
        p.echoSession.applyWorkspaceSnapshot(cached);
        p.workspace.serverMemberNicknames.value =
          buildServerMemberNicknameMapFromMembersByServer(
            cached.membersByServer,
          );
        p.ensureAuthUserInMockUsers();
      }
    }

    let fetchedWorkspace: EchoWorkspaceState | null = null;
    let workspaceSnapshotApplied = false;
    if (!skipWorkspace) {
      fetchedWorkspace = await withTransientFetchRetries(() =>
        fetchEchoWorkspaceState(p.token, p.userId, {
          onWorkspaceMemberFetchDebug: (payload) =>
            dbgMemberList(
              'fetchEchoWorkspaceState → buildEchoWorkspaceState',
              payload as Record<string, unknown>,
            ),
        }),
      );
      if (p.isStale?.()) {
        dbgMemberList('hydrateEchoFromApi aborted: auth rotated mid-fetch', {
          userId: p.userId,
        });
        return { ok: true };
      }
      const state = fetchedWorkspace;
      const applied = p.echoSession.applyWorkspaceSnapshot(state, {
        authoritative: true,
      });
      workspaceSnapshotApplied = applied;

      dbgMemberList('hydrateEchoFromApi (workspace path)', {
        skipWorkspace: false,
        applyWorkspaceSnapshotReturned: applied,
        backendUserId: p.userId,
        selectedServerId: p.serverStore.selectedServerId,
        serverCount: state.servers.length,
        hasMembersByServerPayload: state.membersByServer != null,
      });

      /** Stale in-flight hydrates must not overwrite the rail or localStorage when version-gated. */
      if (applied) {
        p.workspace.serverMemberNicknames.value =
          buildServerMemberNicknameMapFromMembersByServer(
            state.membersByServer,
          );

        saveEchoWorkspaceToCache(p.userId, state);

        if (
          p.echoSession.refreshDiscordVoiceMirrorRosters &&
          state.servers.length > 0
        ) {
          await p.echoSession.refreshDiscordVoiceMirrorRosters(
            p.token,
            state.servers.map((s) => s.id),
          );
        }
        applyTimeoutUntilFromWorkspaceSnapshot(
          state,
          p.workspace.timeoutUntilByServerUser,
          {
            lastTimeoutWorkspaceVersion:
              p.workspace.lastTimeoutWorkspaceVersion,
            lastTimeoutServerCount: p.workspace.lastTimeoutServerCount,
            lastTimeoutMemberKeyCount: p.workspace.lastTimeoutMemberKeyCount,
          },
        );
        p.ensureAuthUserInMockUsers();
        p.serverStore.setServers(state.servers);
      }
    } else {
      dbgMemberList('hydrateEchoFromApi (workspace path)', {
        skipWorkspace: true,
        note: 'startInitialLoad owns first workspace fetch; this run skips refetch',
        selectedServerId: p.serverStore.selectedServerId,
      });
    }
    const socialSeq = nextEchoWorkspaceSocialRefreshSeq();
    const social = await withTransientFetchRetries(() =>
      fetchWorkspaceSocialForHydrate(p.token, p.isGuest),
    );
    if (p.isStale?.()) {
      dbgMemberList('hydrateEchoFromApi aborted: auth rotated mid-social', {
        userId: p.userId,
      });
      return { ok: true };
    }
    if (socialSeq !== currentEchoWorkspaceSocialRefreshSeq()) {
      if (p.workspace.socialGraphStatus.value === 'loading') {
        p.workspace.socialGraphStatus.value = 'ready';
      }
    } else {
      p.workspace.friendIds.value = social.friendIds;
      p.workspace.friendRequestsIncoming.value = social.friendRequestsIncoming;
      p.workspace.friendRequestsOutgoing.value = social.friendRequestsOutgoing;
      p.workspace.messageRequests.value = social.messageRequests;
      p.workspace.socialGraphStatus.value = 'ready';
      p.mergeEchoDmThreadsFromApi?.(social.dmThreads);
      p.mergeEchoBlockedFromApi?.(social.blockedUserIds);
    }
    if (workspaceSnapshotApplied && fetchedWorkspace?.servers.length) {
      const state = fetchedWorkspace;
      applyWorkspaceBootstrapServerNav({
        servers: state.servers,
        serverStore: p.serverStore,
        activeRailTab: p.activeRailTab,
        activeChannelId: p.activeChannelId,
        categoriesByServer: state.categoriesByServer,
        getFirstTextChannelId: p.getFirstTextChannelId,
        echoDmThreadIds: p.echoDmThreadIds?.value ?? null,
        dmCallWithUserId: p.dmCallWithUserId?.value ?? null,
        logSource: SHELL_SOURCE,
      });
    }
    void p.refreshEchoRoleData();
    p.syncEchoPresenceFromApi?.();
    return { ok: true };
  } catch (e) {
    p.workspace.socialGraphStatus.value = 'error';
    const userMessage =
      e instanceof Error ? e.message : 'Echo workspace unavailable';
    return { ok: false, error: e, userMessage };
  }
}

export type EchoWorkspaceSocialRefreshResult =
  | { ok: true }
  | { ok: false; error: unknown; suppressBanner?: boolean };

export type EchoWorkspaceSocialRefreshParams = {
  token: string;
  isGuest: boolean;
  workspace: Pick<
    WorkspaceStateApi,
    | 'friendIds'
    | 'friendRequestsIncoming'
    | 'friendRequestsOutgoing'
    | 'messageRequests'
    | 'blockedUserIds'
    | 'socialGraphStatus'
  >;
  mergeEchoBlockedFromApi?: (blockedUserIds: string[]) => void;
  syncEchoPresenceFromApi?: () => void;
};

/** Lightweight social graph refresh (friends + requests); used after mutations without full workspace hydrate. */
export async function runEchoWorkspaceSocialRefreshFromApi(
  p: EchoWorkspaceSocialRefreshParams,
): Promise<EchoWorkspaceSocialRefreshResult> {
  const seq = nextEchoWorkspaceSocialRefreshSeq();
  const previousStatus = p.workspace.socialGraphStatus.value;
  const hadReadyGraph = previousStatus === 'ready';
  try {
    if (!hadReadyGraph) {
      p.workspace.socialGraphStatus.value = 'loading';
    }
    const slice = await withTransientFetchRetries(() =>
      fetchWorkspaceSocialForRefresh(p.token, p.isGuest),
    );
    if (seq !== currentEchoWorkspaceSocialRefreshSeq()) {
      return { ok: true };
    }
    p.workspace.friendIds.value = slice.friendIds;
    p.workspace.friendRequestsIncoming.value = slice.friendRequestsIncoming;
    p.workspace.friendRequestsOutgoing.value = slice.friendRequestsOutgoing;
    p.workspace.messageRequests.value = slice.messageRequests;
    p.workspace.blockedUserIds.value = slice.blockedUserIds;
    p.mergeEchoBlockedFromApi?.(slice.blockedUserIds);
    p.workspace.socialGraphStatus.value = 'ready';
    p.syncEchoPresenceFromApi?.();
    return { ok: true };
  } catch (e) {
    const suppressBanner = hadReadyGraph || isTransientFetchFailure(e);
    if (seq !== currentEchoWorkspaceSocialRefreshSeq()) {
      return { ok: false, error: e, suppressBanner: true };
    }
    p.workspace.socialGraphStatus.value = hadReadyGraph ? 'ready' : 'error';
    return { ok: false, error: e, suppressBanner };
  }
}
