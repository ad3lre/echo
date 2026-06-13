import { ref, computed, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { RailTab } from '@/features/layout/mainSurface';
import { AuthApiError, authContinueAsGuest } from '@/api/authClient';
import { ECHO_GUEST_ACCOUNTS_ENABLED } from '@/config/echoGuestAccountsEnabled';
import { primeCookieSessionAfterMint } from '@/services/auth/desktopSessionPrime';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function useAppLayoutGuestSession(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeRailTab: Ref<RailTab>;
  isAuthModalOpen: Ref<boolean>;
  hydrateEchoFromApi: () => Promise<void>;
}) {
  const {
    serverStore,
    workspace,
    authSession,
    activeRailTab,
    isAuthModalOpen,
    hydrateEchoFromApi,
  } = deps;

  const isGuestDisplayNameModalOpen = ref(false);
  const isGuestWelcomePrefsModalOpen = ref(false);
  const isGuestUpgradeModalOpen = ref(false);
  const isGuestCaptchaModalOpen = ref(false);
  const guestCaptchaSiteKey = ref('');

  const guestFriendsLocked = computed(
    () => authSession.backendUser?.isGuest === true,
  );

  /** Welcome prefs modal is opt-in via settings — do not auto-open on guest mint. */
  function scheduleGuestWelcomePrefsModal() {
    /* no-op */
  }

  async function continueAsGuest(captchaToken?: string) {
    if (!ECHO_GUEST_ACCOUNTS_ENABLED) {
      dispatchAppToast(
        'Guest accounts are not available. Create an account or sign in.',
        'warning',
      );
      return;
    }
    try {
      isAuthModalOpen.value = false;
      const session = await authContinueAsGuest(
        captchaToken ? { captchaToken } : undefined,
      );
      authSession.setSession(session);
      isGuestCaptchaModalOpen.value = false;
      guestCaptchaSiteKey.value = '';
      const primed = await primeCookieSessionAfterMint();
      if (primed) {
        authSession.applyRestoredProfile(primed, {
          allowUnauthenticated: true,
        });
      }
      await workspace.startInitialLoad();
      await hydrateEchoFromApi();
      /** Guests start “serverless”: no guild selected; first screen is public Explore. */
      serverStore.selectServer(null);
      activeRailTab.value = 'explore';
      scheduleGuestWelcomePrefsModal();
    } catch (e) {
      if (
        e instanceof AuthApiError &&
        e.body.code === 'CAPTCHA_REQUIRED' &&
        e.body.detail
      ) {
        try {
          const j = JSON.parse(e.body.detail) as { siteKey?: string };
          if (j.siteKey) {
            guestCaptchaSiteKey.value = j.siteKey;
            isGuestCaptchaModalOpen.value = true;
            return;
          }
        } catch {
          /* no widget */
        }
        dispatchAppToast(
          'Verification required but captcha could not load. Try again or reload.',
          'warning',
        );
        return;
      }
      const msg =
        e instanceof AuthApiError
          ? e.body.message || e.body.code || 'Could not continue as guest.'
          : e instanceof Error && e.message
            ? e.message
            : 'Could not continue as guest.';
      dispatchAppToast(msg, 'warning');
    }
  }

  function onGuestCaptchaVerified(token: string) {
    void continueAsGuest(token);
  }

  function openGuestUpgradeModal() {
    isGuestUpgradeModalOpen.value = true;
  }

  async function onGuestAccountUpgraded() {
    await workspace.startInitialLoad();
    await hydrateEchoFromApi();
  }

  function onEchoMessageFailedGuest(ev: Event) {
    if (authSession.backendUser?.isGuest !== true) return;
    const d = (ev as CustomEvent<{ code?: string; detail?: string }>).detail;
    if (!d) return;
    if (d.detail === 'DISPLAY_NAME_REQUIRED') {
      isGuestDisplayNameModalOpen.value = true;
    }
    if (d.code === 'GUEST_LIMIT' || d.code === 'GUEST_ABUSE_COOLDOWN') {
      isGuestUpgradeModalOpen.value = true;
    }
  }

  return {
    isGuestDisplayNameModalOpen,
    isGuestWelcomePrefsModalOpen,
    isGuestUpgradeModalOpen,
    isGuestCaptchaModalOpen,
    guestCaptchaSiteKey,
    guestFriendsLocked,
    continueAsGuest,
    onGuestCaptchaVerified,
    openGuestUpgradeModal,
    onGuestAccountUpgraded,
    onEchoMessageFailedGuest,
  };
}
