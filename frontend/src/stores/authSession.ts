import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { AuthUserPublic } from '@/api/authClient';
import type { EchoPlanLimitsPublic } from '@shared/echoPlanLimits';
import {
  AuthApiError,
  authDebugEnabled,
  authFetchMe,
  authLogout,
  authLogoutAllSessions,
  echoAuthDebugLog,
  invalidateAuthFetchMeCache,
} from '@/api/authClient';
import {
  mergeLocalProfileIntoUser,
  overwriteLocalProfileFromAuthUser,
} from '@/utils/localProfilePersistence';
import { clearWorkspaceSessionCache } from '@/utils/workspaceSessionCache';
import { clearEchoWorkspaceCache } from '@/utils/workspacePersistence';
import { markPriorRegistered } from '@/utils/priorRegistration';
import {
  iosAuthStoreSession,
  iosAuthClearSession,
  iosAuthSessionRestored,
  iosAuthSessionRestoreFailed,
  iosAuthMarkVerified,
} from '@/services/auth/iosNativeAuth';
import { clearNativeAuthTokens } from '@/services/auth/nativeAuthToken';
import {
  setSkipAutoGuestAfterLogout,
  clearSkipAutoGuestAfterLogout,
} from '@/utils/autoGuestLogoutSuppress';
import { trackEchoEvent } from '@/utils/analytics';
import { clearEchoCsrfMemoryToken } from '@/utils/echoCsrf';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { invalidateInFlightEchoWorkspaceSocialRefresh } from '@/services/orchestration/workspaceSocialRefreshSeq';

/** Mock / legacy preview only — real mode uses HttpOnly cookies (no tokens in localStorage). */
const ACCESS_KEY = 'echo_auth_access';
const REFRESH_KEY = 'echo_auth_refresh';

/**
 * Persistent identity cache used purely to make cold-start feel instant.
 *
 * The actual session lives in an HttpOnly cookie — this cache is just the *last
 * known user shape* so the app shell can paint on cold start without waiting for
 * `/auth/me`. The store still validates the session in the background; on 401 we
 * clear this cache and the UI reactively transitions to the auth gate.
 *
 * Versioned so we can break the schema cleanly when `AuthUserPublic` grows
 * incompatible fields (e.g. an enum changes meaning).
 */
const USER_CACHE_KEY = 'echo_auth_user_cache_v1';
const USER_CACHE_SCHEMA_VERSION = 1;

type CachedAuthUserEnvelope = {
  v: typeof USER_CACHE_SCHEMA_VERSION;
  /** Server-issued user id at the time of caching — used to detect identity churn. */
  userId: string;
  /** ms epoch — only used for debugging / future TTL policies, not enforced today. */
  cachedAt: number;
  user: AuthUserPublic;
  planLimits: EchoPlanLimitsPublic | null;
};

function persistAuthUserCache(
  user: AuthUserPublic,
  pl: EchoPlanLimitsPublic | null,
): void {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.setItem !== 'function'
  ) {
    return;
  }
  try {
    const envelope: CachedAuthUserEnvelope = {
      v: USER_CACHE_SCHEMA_VERSION,
      userId: user.id,
      cachedAt: Date.now(),
      user,
      planLimits: pl,
    };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(envelope));
  } catch (error) {
    if (authDebugEnabled()) {
      echoAuthDebugLog('persistAuthUserCache: write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function clearAuthUserCache(): void {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.removeItem !== 'function'
  ) {
    return;
  }
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function loadAuthUserCache(): CachedAuthUserEnvelope | null {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.getItem !== 'function'
  ) {
    return null;
  }
  let raw: string | null;
  try {
    raw = localStorage.getItem(USER_CACHE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedAuthUserEnvelope> | null;
    if (
      !parsed ||
      parsed.v !== USER_CACHE_SCHEMA_VERSION ||
      typeof parsed.userId !== 'string' ||
      !parsed.user ||
      typeof parsed.user !== 'object' ||
      typeof (parsed.user as { id?: unknown }).id !== 'string'
    ) {
      clearAuthUserCache();
      return null;
    }
    return parsed as CachedAuthUserEnvelope;
  } catch {
    clearAuthUserCache();
    return null;
  }
}

type ApplyRestoredProfileOptions = {
  allowUnauthenticated?: boolean;
  expectedGeneration?: number;
};

export const useAuthSessionStore = defineStore('authSession', () => {
  /** Non-null in mock preview when using legacy bearer-shaped session. Ignored for real Echo API (cookies). */
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);
  const backendUser = ref<AuthUserPublic | null>(null);
  /** From GET `/auth/me` when Postgres Echo store is available. */
  const planLimits = ref<EchoPlanLimitsPublic | null>(null);
  /** Shown after 401 or failed session restore so the user knows to sign in again. */
  const sessionEndedMessage = ref<string | null>(null);
  /** Short-lived message after email verification redirect (`?emailVerified=1`). */
  const emailVerificationFlash = ref<string | null>(null);

  const isAuthenticated = computed(() => !!backendUser.value);
  /**
   * Increments whenever auth state is replaced/cleared.
   * Async follow-ups must check this token before mutating state.
   */
  const authStateGeneration = ref(0);
  /**
   * True when `backendUser` was populated from the local identity cache and has
   * NOT yet been validated by `/auth/me` this run. Consumers usually do not need
   * to read this — components should just trust `isAuthenticated` and `backendUser`.
   * Exposed for diagnostics and for any place that wants to dim/disable destructive
   * actions until the session is server-confirmed.
   */
  const isSessionUnverified = ref(false);
  /**
   * Desktop WKWebView: timestamp of the last `setSession` (login/register/upgrade).
   * Used to defer 401 teardown while HttpOnly cookies finish applying.
   */
  const sessionMintedAtMs = ref(0);
  const DESKTOP_SESSION_MINT_GRACE_MS = 5000;

  function shouldDefer401Teardown(): boolean {
    if (import.meta.env.VITE_ECHO_DESKTOP !== '1') return false;
    if (!sessionMintedAtMs.value) return false;
    return Date.now() - sessionMintedAtMs.value < DESKTOP_SESSION_MINT_GRACE_MS;
  }

  function clearSessionEndedMessage() {
    sessionEndedMessage.value = null;
  }

  function setEmailVerificationFlash(message: string) {
    emailVerificationFlash.value = message;
  }

  function clearEmailVerificationFlash() {
    emailVerificationFlash.value = null;
  }

  /** Clears client-visible session state; sets a banner message (e.g. expired session). */
  function invalidateSessionForReauth(message: string) {
    echoAuthDebugLog('session cleared — re-authentication required', {
      bannerMessage: message,
      hint: 'Prior [Echo auth] logs in this session usually explain the 401/refresh failure.',
    });
    // Analytics POST requires CSRF; memory token is cleared in `clearLocalTokens`, so track first.
    trackEchoEvent('session_ended', { reason: 'reauth_required' });
    clearLocalTokens();
    sessionEndedMessage.value = message;
  }

  function setSession(payload: {
    user: AuthUserPublic;
    accessToken?: string;
    refreshToken?: string;
    planLimits?: EchoPlanLimitsPublic | null;
  }) {
    clearWorkspaceSessionCache();
    /* New session = new user identity; drop stale social/workspace follow-ups. */
    invalidateInFlightEchoWorkspaceSocialRefresh();
    /* New session = new user identity; force any cached `/auth/me` to refetch. */
    invalidateAuthFetchMeCache();
    authStateGeneration.value += 1;
    const generation = authStateGeneration.value;
    sessionMintedAtMs.value = Date.now();
    sessionEndedMessage.value = null;
    overwriteLocalProfileFromAuthUser(payload.user);
    backendUser.value = mergeLocalProfileIntoUser(
      payload.user,
    ) as AuthUserPublic;
    if ('planLimits' in payload) {
      planLimits.value = payload.planLimits ?? null;
    } else {
      planLimits.value = null;
      void authFetchMe()
        .then((me) => {
          if (generation !== authStateGeneration.value) return;
          if (me.planLimits) planLimits.value = me.planLimits;
          /* Refresh the cold-start cache so the next launch has the right plan. */
          if (backendUser.value) {
            persistAuthUserCache(backendUser.value, planLimits.value);
          }
        })
        .catch((error: unknown) => {
          if (authDebugEnabled()) {
            echoAuthDebugLog('setSession: delayed /auth/me failed', {
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message }
                  : String(error),
            });
          }
        });
    }
    accessToken.value = null;
    refreshToken.value = null;
    if (!payload.user.isGuest) {
      markPriorRegistered();
      clearSkipAutoGuestAfterLogout();
    }
    void iosAuthStoreSession(payload.user);
    /* Identity has just been freshly minted (login / register / OAuth) — write
     * through to the cold-start cache so the *next* launch can paint instantly. */
    if (backendUser.value) {
      persistAuthUserCache(backendUser.value, planLimits.value);
    }
    isSessionUnverified.value = false;
  }

  function clearLocalTokens() {
    authStateGeneration.value += 1;
    invalidateAuthFetchMeCache();
    clearEchoCsrfMemoryToken();
    accessToken.value = null;
    refreshToken.value = null;
    backendUser.value = null;
    planLimits.value = null;
    clearWorkspaceSessionCache();
    clearEchoWorkspaceCache();
    if (
      typeof localStorage !== 'undefined' &&
      typeof localStorage.removeItem === 'function'
    ) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    clearAuthUserCache();
    isSessionUnverified.value = false;
    sessionMintedAtMs.value = 0;
    void iosAuthClearSession();
    void clearNativeAuthTokens();
  }

  /**
   * Cold-start identity hydration. Reads the persistent identity cache and
   * populates `backendUser` synchronously so Vue can mount with a fully
   * rendered app shell on the very first paint. The session is still validated
   * against `/auth/me` immediately after mount; on failure `clearLocalTokens`
   * runs and the UI transitions to the auth gate.
   *
   * Safe to call multiple times — only the first call within a session
   * generation has any effect.
   */
  function hydrateFromStorage() {
    if (backendUser.value) return;
    const cached = loadAuthUserCache();
    if (!cached) return;
    backendUser.value = mergeLocalProfileIntoUser(
      cached.user,
    ) as AuthUserPublic;
    planLimits.value = cached.planLimits;
    isSessionUnverified.value = true;
    if (!cached.user.isGuest) {
      markPriorRegistered();
    }
  }

  function applyRestoredProfile(
    user: AuthUserPublic,
    options: ApplyRestoredProfileOptions = {},
  ): boolean {
    if (
      options.expectedGeneration !== undefined &&
      options.expectedGeneration !== authStateGeneration.value
    ) {
      echoAuthDebugLog('stale auth profile ignored', {
        userId: user.id,
        expectedGeneration: options.expectedGeneration,
        currentGeneration: authStateGeneration.value,
      });
      return false;
    }
    const currentUserId = backendUser.value?.id ?? null;
    if (
      !options.allowUnauthenticated &&
      (!currentUserId || currentUserId !== user.id)
    ) {
      echoAuthDebugLog('auth profile ignored for inactive identity', {
        userId: user.id,
        currentUserId,
      });
      return false;
    }
    overwriteLocalProfileFromAuthUser(user);
    backendUser.value = mergeLocalProfileIntoUser(user) as AuthUserPublic;
    if (!user.isGuest) {
      markPriorRegistered();
    }
    /* Refresh the cold-start cache on every server-confirmed identity update so
     * the next launch paints the most recent username / avatar / plan. */
    if (backendUser.value) {
      persistAuthUserCache(backendUser.value, planLimits.value);
    }
    return true;
  }

  /**
   * Shared in-flight `/auth/me` so concurrent callers (cold start fires both the
   * `main.ts` background validation and `startInitialLoad`) collapse onto a single
   * round-trip instead of racing two. Cleared in `finally` so later restores refetch.
   */
  let restoreSessionInFlight: Promise<AuthUserPublic | null> | null = null;

  function restoreSessionFromApi(): Promise<AuthUserPublic | null> {
    if (restoreSessionInFlight) return restoreSessionInFlight;
    const run = restoreSessionFromApiInner().finally(() => {
      if (restoreSessionInFlight === run) restoreSessionInFlight = null;
    });
    restoreSessionInFlight = run;
    return run;
  }

  async function restoreSessionFromApiInner(): Promise<AuthUserPublic | null> {
    const generation = authStateGeneration.value;
    try {
      const { user, planLimits: pl } = await authFetchMe();
      if (generation !== authStateGeneration.value) {
        echoAuthDebugLog('restoreSessionFromApi: stale /auth/me ignored', {
          userId: user.id,
          expectedGeneration: generation,
          currentGeneration: authStateGeneration.value,
        });
        return null;
      }
      authStateGeneration.value += 1;
      planLimits.value = pl ?? null;
      if (
        !applyRestoredProfile(user, {
          allowUnauthenticated: true,
          expectedGeneration: authStateGeneration.value,
        })
      ) {
        return null;
      }
      isSessionUnverified.value = false;
      void iosAuthSessionRestored();
      void iosAuthMarkVerified();
      return user;
    } catch (e) {
      if (e instanceof AuthApiError) {
        const benignNoSession = e.status === 401 || e.status === 403;
        if (benignNoSession) {
          if (generation !== authStateGeneration.value) {
            echoAuthDebugLog(
              'restoreSessionFromApi: ignored stale /auth/me after auth rotation',
              {
                expectedGeneration: generation,
                currentGeneration: authStateGeneration.value,
              },
            );
            return null;
          }
          clearLocalTokens();
          void iosAuthSessionRestoreFailed();
        }
        if (!benignNoSession) {
          reportPrimaryFlowFailure('restoreSessionFromApi', e, {
            httpStatus: e.status,
            apiCode: e.body.code,
          });
        }
        if (authDebugEnabled()) {
          echoAuthDebugLog('restoreSessionFromApi: /auth/me failed', {
            httpStatus: e.status,
            apiCode: e.body.code,
            apiMessage: e.body.message,
            ...(e.body.detail ? { apiDetail: e.body.detail } : {}),
          });
        }
        return null;
      }
      reportPrimaryFlowFailure('restoreSessionFromApi', e, {
        unexpected: true,
      });
      void iosAuthSessionRestoreFailed();
      if (authDebugEnabled()) {
        echoAuthDebugLog('restoreSessionFromApi: unexpected error', {
          name: e instanceof Error ? e.name : 'unknown',
          message: e instanceof Error ? e.message : String(e),
        });
      }
      return null;
    }
  }

  async function logout() {
    try {
      await authLogout(refreshToken.value);
    } catch {
      /* still clear client state */
    }
    setSkipAutoGuestAfterLogout();
    clearLocalTokens();
    sessionEndedMessage.value = null;
  }

  async function logoutEverywhere() {
    try {
      await authLogoutAllSessions();
    } catch {
      /* still clear client */
    }
    setSkipAutoGuestAfterLogout();
    clearLocalTokens();
    sessionEndedMessage.value = null;
  }

  function patchImageSearchQuota(input: { used: number; limit: number }) {
    const used = Math.max(0, Math.floor(input.used));
    const limit = Math.max(0, Math.floor(input.limit));
    if (!planLimits.value) return;
    planLimits.value = {
      ...planLimits.value,
      imageSearchesPerDay: limit,
      imageSearchesUsedToday: Math.min(used, limit),
    };
  }

  return {
    authStateGeneration,
    accessToken,
    refreshToken,
    backendUser,
    planLimits,
    sessionEndedMessage,
    emailVerificationFlash,
    isAuthenticated,
    isSessionUnverified,
    shouldDefer401Teardown,
    setSession,
    clearLocalTokens,
    clearSessionEndedMessage,
    setEmailVerificationFlash,
    clearEmailVerificationFlash,
    invalidateSessionForReauth,
    hydrateFromStorage,
    restoreSessionFromApi,
    applyRestoredProfile,
    logout,
    logoutEverywhere,
    patchImageSearchQuota,
  };
});
