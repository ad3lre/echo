import { inject, ref, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { PLATFORM_KEY, type EchoPlatform } from '@/platform/keys';
import { fetchEchoWorkspaceState } from '@/api/echoClient';
import { createWorkspaceHydrateSkipLatch } from '@/features/layout/echoWorkspace/workspaceHydrateSkipLatch';
import type { AuthUserPublic } from '@/api/authClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useEchoSessionStore } from '@/features/layout/echoSession';
import { useEchoAttentionStore } from '@/features/layout/echoAttention';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { applyWorkspaceRosterUsersPipeline } from '@/features/layout/echoWorkspace/workspaceRoster';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { authContinueAsGuest } from '@/api/authClient';
import {
  clearWorkspaceSessionCache,
  readJwtSub,
  readWorkspaceSessionCache,
  writeWorkspaceSessionCache,
  type CachedEchoWorkspaceState,
} from '@/features/layout/echoWorkspace/workspaceSessionCache';
import { clearEchoWorkspaceCache } from '@/features/layout/echoWorkspace/workspacePersistence';
import { dbgMemberList } from '@/features/layout/composables/members/echoMemberListDebug';
import type { MemberRole } from '@/features/member-profile/memberProfiles';
import { hasPriorRegistration } from '@/features/layout/priorRegistration';
import { isGuestAccountsEnabled } from '@/config/echoGuestAccountsRuntime';
import { shouldSkipAutoGuestAfterLogout } from '@/features/layout/boot/autoGuestLogoutSuppress';
import { consumeSkipAutoGuestOnce } from '@/features/layout/boot/autoGuestOAuthReturn';
import { withTransientFetchRetries } from '@/features/layout/echoWorkspace/retryTransientFetch';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { applyTimeoutUntilFromWorkspaceSnapshot } from '@/features/layout/workspaceTimeoutApplyFromSnapshot';
import { buildServerMemberNicknameMapFromMembersByServer } from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';
import { prefetchWorkspaceBootstrapTextChannelsNonBlocking } from '@/features/layout/echoWorkspace/echoWorkspaceChannelPrefetch';

import type { MockData, WorkspaceStateRefs, WorkspaceStateApi } from './types';
import { echoUserRowFromAuthUser, loadEchoExploreDirectoryRows } from './utils';
import { useWorkspaceServerActions } from './workspaceServerActions';
import { useWorkspaceModerationActions } from './workspaceModerationActions';
import { useWorkspaceUserActions } from './workspaceUserActions';

export type {
  MessageRequestEntry,
  FriendRequestIncomingEntry,
  FriendRequestOutgoingEntry,
  MockData,
  WorkspaceStateApi,
} from './types';

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
  const initialLoadInFlight = ref(false);
  /**
   * One-way latch: flips true the first time {@link startInitialLoad} settles (on any
   * terminal path — success, unauthenticated, or error) and never resets. The boot
   * gate in `App.vue` watches this to reveal the shell for no-session cold starts.
   */
  const initialLoadSettled = ref(false);
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
    initialLoadInFlight,
    apiError,
  };

  const serverActions = useWorkspaceServerActions(refs);
  const moderationActions = useWorkspaceModerationActions(refs);
  const userActions = useWorkspaceUserActions(refs);

  const workspaceHydrateSkipLatch = createWorkspaceHydrateSkipLatch();
  let startInitialLoadSeq = 0;
  /**
   * Set when {@link preHydrateFromSessionCache} painted the workspace from the
   * sessionStorage cache before Vue mounted. `startInitialLoad` reads this to keep
   * the warm paint (no `loading` flip → no spinner) and avoid re-applying the same
   * user's cache a second time.
   */
  let wasPreHydrated = false;

  function consumeSkipEchoWorkspaceHydrate(): boolean {
    /* Only dedupe against the in-flight boot load. Post-login / post-register hydrates
     * must always fetch workspace — otherwise a skip latched at cold start can leave the
     * shell authenticated but empty when login races `startInitialLoad`. */
    if (!initialLoadInFlight.value) return false;
    return workspaceHydrateSkipLatch.consume();
  }

  function preHydrateFromSessionCache(cache: CachedEchoWorkspaceState): void {
    applyWorkspaceStateToRefs(cache as unknown as EchoWorkspaceState);
    fromApi.value = true;
    apiError.value = null;
    wasPreHydrated = true;
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
    // One-shot: consume the pre-hydration flag so a later re-login goes through the
    // normal spinner path instead of silently reusing the previous warm paint.
    const preHydrated = wasPreHydrated;
    wasPreHydrated = false;
    // When `preHydrateFromSessionCache` already painted the shell before mount,
    // keep `loading` false so dependent UI stays on the warm content instead of
    // flipping back to a spinner while we reconcile with the network below.
    if (!preHydrated) loading.value = true;
    const auth = useAuthSessionStore();
    const seq = ++startInitialLoadSeq;
    initialLoadInFlight.value = true;
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
      // `preHydrateFromSessionCache` (called from main.ts before mount) already
      // painted the same cache for this token, so treat the warm paint as done and
      // skip the redundant read + apply here.
      let warmCacheApplied = preHydrated;
      if (preRestoreToken && !preHydrated) {
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
      /**
       * `restoreSessionFromApi()` returns null not only for "no session" (benign
       * 401, which clears `backendUser`) but also for transient network errors
       * and for stale responses superseded by a concurrent `setSession`. In
       * those cases the store still holds an authenticated identity — keep it
       * instead of minting a guest over a registered user or wiping the
       * workspace. A truly dead session self-corrects via the workspace fetch's
       * 401 path.
       */
      if (!sessionUser && auth.isAuthenticated && auth.backendUser) {
        dbgMemberList(
          'startInitialLoad restore returned null but store is authenticated — keeping identity',
          { userId: auth.backendUser.id },
        );
        sessionUser = auth.backendUser as AuthUserPublic;
      }
      if (!sessionUser || !auth.isAuthenticated) {
        const skipAutoGuest =
          !isGuestAccountsEnabled() ||
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
      /**
       * Captured after restore/auto-guest settled: any later rotation (login,
       * upgrade, logout) invalidates this load's fetched state, which would
       * otherwise be applied over the new session's workspace below.
       */
      const authGenForLoad = auth.authStateGeneration;

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
      if (auth.authStateGeneration !== authGenForLoad) {
        dbgMemberList(
          'startInitialLoad aborted apply: auth rotated during workspace fetch',
          { authGenForLoad, authGenNow: auth.authStateGeneration },
        );
        return;
      }

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
      if (seq === startInitialLoadSeq) {
        loading.value = false;
        initialLoadInFlight.value = false;
      }
      // One-way: the first settled load reveals the boot gate, even for a stale/superseded
      // sequence (a newer load is already in flight, so the shell is safe to show).
      initialLoadSettled.value = true;
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
    initialLoadInFlight,
    initialLoadSettled,
    apiError,
    refreshExploreDirectory,
    startInitialLoad,
    preHydrateFromSessionCache,
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
