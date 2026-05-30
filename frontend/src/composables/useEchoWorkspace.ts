import { inject, ref, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { PLATFORM_KEY, type EchoPlatform } from '@/platform/keys';
import { fetchEchoWorkspaceState } from '@/api/echoClient';
import { createWorkspaceHydrateSkipLatch } from '@/services/domain/workspaceHydrateSkipLatch';
import type { AuthUserPublic } from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoSessionStore } from '@/stores/echoSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { applyWorkspaceRosterUsersPipeline } from '@/services/domain/workspaceRoster';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { authContinueAsGuest } from '@/api/authClient';
import {
  clearWorkspaceSessionCache,
  readJwtSub,
  readWorkspaceSessionCache,
  writeWorkspaceSessionCache,
} from '@/utils/workspaceSessionCache';
import { clearEchoWorkspaceCache } from '@/utils/workspacePersistence';
import { dbgMemberList } from '@/utils/echoMemberListDebug';
import type { MemberRole } from '@/utils/memberProfiles';
import { hasPriorRegistration } from '@/utils/priorRegistration';
import { ECHO_GUEST_ACCOUNTS_ENABLED } from '@/config/echoGuestAccountsEnabled';
import { shouldSkipAutoGuestAfterLogout } from '@/utils/autoGuestLogoutSuppress';
import { consumeSkipAutoGuestOnce } from '@/utils/autoGuestOAuthReturn';
import { withTransientFetchRetries } from '@/utils/retryTransientFetch';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { applyTimeoutUntilFromWorkspaceSnapshot } from '@/features/layout/viewModel/workspaceTimeoutApplyFromSnapshot';
import { buildServerMemberNicknameMapFromMembersByServer } from '@/services/domain/workspaceEchoApiSnapshot';
import { prefetchWorkspaceBootstrapTextChannelsNonBlocking } from '@/services/orchestration/echoWorkspaceChannelPrefetch';

import type {
  MockData,
  WorkspaceStateRefs,
  WorkspaceStateApi,
} from './workspace/types';
import {
  echoUserRowFromAuthUser,
  loadEchoExploreDirectoryRows,
} from './workspace/utils';
import { useWorkspaceServerActions } from './workspace/workspaceServerActions';
import { useWorkspaceModerationActions } from './workspace/workspaceModerationActions';
import { useWorkspaceUserActions } from './workspace/workspaceUserActions';

export type {
  MessageRequestEntry,
  FriendRequestIncomingEntry,
  FriendRequestOutgoingEntry,
  MockData,
  WorkspaceStateApi,
} from './workspace/types';

const emptyFallbackDisplay: Pick<
  MockData,
  | 'users'
  | 'servers'
  | 'categoriesByServer'
  | 'discoverableServers'
  | 'messages'
> = {
  users: [],
  servers: [],
  categoriesByServer: {},
  discoverableServers: [],
  messages: {},
};

export function createWorkspaceState(): WorkspaceStateApi {
  const echoSession = useEchoSessionStore();
  const echoAttention = useEchoAttentionStore();
  const { serverNotificationLevelByServerId } = storeToRefs(echoAttention);
  const sessionRefs = storeToRefs(echoSession);

  const users = sessionRefs.users as unknown as Ref<MockData['users']>;
  const servers = sessionRefs.servers as unknown as Ref<MockData['servers']>;
  const categoriesByServer = sessionRefs.categoriesByServer as unknown as Ref<
    MockData['categoriesByServer']
  >;
  const discoverableServers = sessionRefs.discoverableServers as unknown as Ref<
    MockData['discoverableServers']
  >;
  const messages = sessionRefs.messages as unknown as Ref<MockData['messages']>;
  bindChannelMessageBuckets(messages);
  const friendIds = ref<MockData['friendIds']>([]);
  const messageRequests = ref<MockData['messageRequests']>([]);
  const friendRequestsIncoming = ref<MockData['friendRequestsIncoming']>([]);
  const friendRequestsOutgoing = ref<MockData['friendRequestsOutgoing']>([]);
  const socialGraphStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const serverMemberIds = sessionRefs.serverMemberIds as unknown as Ref<
    MockData['serverMemberIds']
  >;
  const friendIdsByUserId = ref<MockData['friendIdsByUserId']>({});
  const blockedUserIds = ref<MockData['blockedUserIds']>([]);

  const bannedUserIdsByServer = ref<Record<string, string[]>>({});
  const banMetaByServer = ref<
    Record<string, Record<string, { reason: string; expiresAt: number | null }>>
  >({});
  const timeoutUntilByServerUser = ref<Record<string, Record<string, number>>>(
    {},
  );
  const lastTimeoutWorkspaceVersion = ref('0');
  const lastTimeoutServerCount = ref(0);
  const lastTimeoutMemberKeyCount = ref(0);
  const vcServerMuteByChannel = ref<Record<string, Record<string, boolean>>>(
    {},
  );
  const vcServerDeafenByChannel = ref<Record<string, Record<string, boolean>>>(
    {},
  );
  const serverNotificationOverrides = serverNotificationLevelByServerId as Ref<
    Record<string, ServerNotificationLevel>
  >;
  const memberRoleOverrides = ref<Record<string, Record<string, MemberRole[]>>>(
    {},
  );
  const serverMemberNicknames = ref<Record<string, Record<string, string>>>({});
  const loading = ref(false);
  const fromApi = ref(false);
  const apiError = ref<string | null>(null);

  const refs: WorkspaceStateRefs = {
    users,
    servers,
    categoriesByServer,
    discoverableServers,
    messages,
    friendIds,
    messageRequests,
    friendRequestsIncoming,
    friendRequestsOutgoing,
    serverMemberIds,
    friendIdsByUserId,
    blockedUserIds,
    bannedUserIdsByServer,
    banMetaByServer,
    timeoutUntilByServerUser,
    vcServerMuteByChannel,
    vcServerDeafenByChannel,
    serverNotificationOverrides,
    memberRoleOverrides,
    serverMemberNicknames,
    socialGraphStatus,
    loading,
    fromApi,
    apiError,
  };

  const serverActions = useWorkspaceServerActions(refs);
  const moderationActions = useWorkspaceModerationActions(refs);
  const userActions = useWorkspaceUserActions(refs);

  const workspaceHydrateSkipLatch = createWorkspaceHydrateSkipLatch();
  let startInitialLoadSeq = 0;

  function consumeSkipEchoWorkspaceHydrate(): boolean {
    return workspaceHydrateSkipLatch.consume();
  }

  async function seedPublicExploreDirectory(): Promise<void> {
    try {
      discoverableServers.value = await loadEchoExploreDirectoryRows();
    } catch (e) {
      reportPrimaryFlowFailure('seedPublicExploreDirectory', e, undefined, {
        showBanner: false,
      });
      dispatchAppToast(
        'Could not load the public server list. Check your connection and try again.',
        'warning',
      );
    }
  }

  async function refreshExploreDirectory(): Promise<void> {
    await seedPublicExploreDirectory();
  }

  function applyWorkspaceStateToRefs(
    state: EchoWorkspaceState,
    opts?: { authoritative?: boolean },
  ) {
    echoSession.applyWorkspaceSnapshot(state, opts);
    serverMemberNicknames.value =
      buildServerMemberNicknameMapFromMembersByServer(state.membersByServer);
    applyTimeoutUntilFromWorkspaceSnapshot(state, timeoutUntilByServerUser, {
      lastTimeoutWorkspaceVersion,
      lastTimeoutServerCount,
      lastTimeoutMemberKeyCount,
    });
  }

  async function startInitialLoad() {
    loading.value = true;
    const auth = useAuthSessionStore();
    const seq = ++startInitialLoadSeq;
    try {
      workspaceHydrateSkipLatch.armSkipNext();

      /**
       * Warm paint: if we already hold a session token from local storage
       * (returning user), apply the cached workspace snapshot *before* the
       * `/auth/me` + workspace round-trips so the shell renders servers /
       * channels / members instantly instead of holding a spinner on the
       * network. `loading` is cleared so dependent UI shows content; the fetch
       * below still reconciles authoritatively, and an expired session
       * self-corrects via the unauthenticated fallback / reactive auth gate.
       */
      const preRestoreToken = auth.accessToken?.trim() || '';
      const warmCacheSub = preRestoreToken ? readJwtSub(preRestoreToken) : null;
      let warmCacheApplied = false;
      if (preRestoreToken) {
        const warmCache = readWorkspaceSessionCache(warmCacheSub);
        if (warmCache) {
          dbgMemberList('startInitialLoad warm cache paint (pre-/auth/me)', {
            cacheKeySub: warmCacheSub,
          });
          applyWorkspaceStateToRefs(warmCache as EchoWorkspaceState);
          fromApi.value = true;
          apiError.value = null;
          warmCacheApplied = true;
          loading.value = false;
        }
      }

      const restoredUser = await auth.restoreSessionFromApi();
      let sessionUser: AuthUserPublic | null = restoredUser;
      if (!sessionUser || !auth.isAuthenticated) {
        const skipAutoGuest =
          !ECHO_GUEST_ACCOUNTS_ENABLED ||
          shouldSkipAutoGuestAfterLogout() ||
          consumeSkipAutoGuestOnce();
        if (!skipAutoGuest) {
          try {
            const guestSession = await authContinueAsGuest();
            auth.setSession(guestSession);
            sessionUser = guestSession.user;
          } catch (error) {
            reportPrimaryFlowFailure(
              'startInitialLoad.autoGuest',
              error,
              undefined,
              { showBanner: false },
            );
          }
        }
      }

      const token = auth.accessToken?.trim() || '';

      if (!sessionUser || !auth.isAuthenticated) {
        workspaceHydrateSkipLatch.cancelSkip();
        echoSession.resetSessionState();
        users.value = applyWorkspaceRosterUsersPipeline(
          emptyFallbackDisplay.users,
          {},
        );
        servers.value = emptyFallbackDisplay.servers;
        categoriesByServer.value = emptyFallbackDisplay.categoriesByServer;
        timeoutUntilByServerUser.value = {};
        fromApi.value = false;
        apiError.value = null;
        if (!hasPriorRegistration()) {
          await seedPublicExploreDirectory();
        }
        return;
      }
      if (seq !== startInitialLoadSeq) return;

      const subGuess: string | null = token
        ? readJwtSub(token)
        : (sessionUser.id ?? null);
      const alreadyWarmApplied = warmCacheApplied && warmCacheSub === subGuess;
      const cachedRaw = alreadyWarmApplied
        ? null
        : readWorkspaceSessionCache(subGuess);
      if (cachedRaw) {
        dbgMemberList('startInitialLoad sessionStorage cache hit', {
          cacheKeySub: subGuess,
          cacheServerCount: Array.isArray(cachedRaw.servers)
            ? cachedRaw.servers.length
            : -1,
          cacheMemberIdKeys: Object.keys(cachedRaw.serverMemberIds ?? {}),
        });
        applyWorkspaceStateToRefs(cachedRaw as EchoWorkspaceState);
        fromApi.value = true;
        apiError.value = null;
      }

      const wsOut = await withTransientFetchRetries(() =>
        fetchEchoWorkspaceState(token || '__session__', sessionUser.id, {
          onWorkspaceMemberFetchDebug: (payload) =>
            dbgMemberList(
              'fetchEchoWorkspaceState → buildEchoWorkspaceState',
              payload as Record<string, unknown>,
            ),
        }),
      ).then(
        (s) => ({ ok: true as const, state: s }),
        (e) => ({ ok: false as const, error: e }),
      );
      if (seq !== startInitialLoadSeq) return;

      const user = sessionUser;
      if (subGuess && user.id !== subGuess) {
        clearWorkspaceSessionCache();
      }

      if (!wsOut.ok) {
        dbgMemberList('startInitialLoad workspace fetch FAILED', {
          error:
            wsOut.error instanceof Error
              ? wsOut.error.message
              : String(wsOut.error),
        });
        workspaceHydrateSkipLatch.cancelSkip();
        auth.applyRestoredProfile(user);
        echoSession.resetSessionState();
        servers.value = emptyFallbackDisplay.servers;
        categoriesByServer.value = emptyFallbackDisplay.categoriesByServer;
        serverMemberIds.value = {};
        timeoutUntilByServerUser.value = {};
        users.value = applyWorkspaceRosterUsersPipeline(
          [echoUserRowFromAuthUser(user)],
          {},
        );
        fromApi.value = false;
        apiError.value =
          wsOut.error instanceof Error
            ? wsOut.error.message
            : 'Echo workspace unavailable';
        await seedPublicExploreDirectory();
        return;
      }

      const state = wsOut.state;
      dbgMemberList(
        'startInitialLoad workspace fetch OK (before merge users)',
        {
          serverCount: state.servers.length,
          restoredUserId: user.id,
        },
      );
      applyWorkspaceStateToRefs(state, { authoritative: true });
      users.value = applyWorkspaceRosterUsersPipeline([], {
        membersByServer: state.membersByServer ?? {},
        authUser: user,
      });
      fromApi.value = true;
      apiError.value = null;
      auth.applyRestoredProfile(user);
      writeWorkspaceSessionCache(user.id, state);
      prefetchWorkspaceBootstrapTextChannelsNonBlocking(token, state);
      void seedPublicExploreDirectory();
    } catch (e) {
      apiError.value = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      if (seq === startInitialLoadSeq) loading.value = false;
    }
  }

  return {
    users,
    servers,
    categoriesByServer,
    discoverableServers,
    messages,
    friendIds,
    messageRequests,
    friendRequestsIncoming,
    friendRequestsOutgoing,
    serverMemberIds,
    friendIdsByUserId,
    blockedUserIds,
    bannedUserIdsByServer,
    timeoutUntilByServerUser,
    lastTimeoutWorkspaceVersion,
    lastTimeoutServerCount,
    lastTimeoutMemberKeyCount,
    vcServerMuteByChannel,
    vcServerDeafenByChannel,
    serverNotificationOverrides,
    memberRoleOverrides,
    serverMemberNicknames,
    socialGraphStatus,
    ...moderationActions,
    ...userActions,
    ...serverActions,
    loading,
    fromApi,
    apiError,
    refreshExploreDirectory,
    startInitialLoad,
    consumeSkipEchoWorkspaceHydrate,
  };
}

export function useEchoWorkspace(): WorkspaceStateApi {
  const p = inject(PLATFORM_KEY, null) as EchoPlatform | null;
  if (!p?.workspace) {
    if (import.meta.env.DEV) {
      throw new Error(
        'useEchoWorkspace() requires provide(PLATFORM_KEY) from App.vue (getEchoPlatform).',
      );
    }
    throw new Error('Echo platform required');
  }
  return p.workspace;
}
