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
  setSkipAutoGuestAfterLogout,
  clearSkipAutoGuestAfterLogout,
} from '@/utils/autoGuestLogoutSuppress';
import { trackEchoEvent } from '@/utils/analytics';
import { clearEchoCsrfMemoryToken } from '@/utils/echoCsrf';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

/** Mock / legacy preview only — real mode uses HttpOnly cookies (no tokens in localStorage). */
const ACCESS_KEY = 'echo_auth_access';
const REFRESH_KEY = 'echo_auth_refresh';

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
    /* New session = new user identity; force any cached `/auth/me` to refetch. */
    invalidateAuthFetchMeCache();
    authStateGeneration.value += 1;
    const generation = authStateGeneration.value;
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
  }

  function hydrateFromStorage() {
    /* Cookie-backed session — no legacy bearer hydration. */
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
    return true;
  }

  async function restoreSessionFromApi(): Promise<AuthUserPublic | null> {
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
      return user;
    } catch (e) {
      if (e instanceof AuthApiError) {
        const benignNoSession = e.status === 401 || e.status === 403;
        if (benignNoSession) {
          clearLocalTokens();
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
