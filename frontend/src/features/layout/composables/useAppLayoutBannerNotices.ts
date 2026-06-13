import { computed, ref, watch, type Ref } from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { SettingsSection } from '@/features/settings/types';
import { AuthApiError, authResendVerification } from '@/api/authClient';
import {
  EMAIL_VERIFICATION_DOWNTIME,
  EMAIL_VERIFICATION_DOWNTIME_TOAST,
} from '@/config/emailVerificationDowntime';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

/**
 * Info-banner notices for the app shell: unverified-email banner/modal + resend,
 * the email-verification-downtime toast, the guest-upgrade banner, and the Discord
 * bot-export-ready banner name. Tracks per-session dismissal and resets it when the
 * signed-in user / guest / verification state changes.
 *
 * The returned names match what AppLayout previously provided to
 * LAYOUT_INFO_BANNERS_KEY (plus the compact unverified-email modal), so injection
 * and template contracts are unchanged. (The unrelated UI-error banner action and
 * the Discord profile-import prompt stay in AppLayout.)
 */
export function useAppLayoutBannerNotices(deps: {
  authSession: Pick<
    ReturnType<typeof useAuthSessionStore>,
    'backendUser' | 'isAuthenticated' | 'clearEmailVerificationFlash'
  >;
  isAuthenticated: Readonly<Ref<boolean>>;
  isCompactShell: Readonly<Ref<boolean>>;
  isGuestUpgradeModalOpen: Ref<boolean>;
  isAuthModalOpen: Ref<boolean>;
  discordBotExportReadyBanner: Readonly<Ref<{ guildName: string } | null>>;
  openAuthModal: (opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    forgot?: boolean;
  }) => void;
  openUserSettingsModal: (section?: SettingsSection) => void;
  onUserSettingsModalUpdate: (next: boolean) => void;
}) {
  const {
    authSession,
    isAuthenticated,
    isCompactShell,
    isGuestUpgradeModalOpen,
    isAuthModalOpen,
    discordBotExportReadyBanner,
    openAuthModal,
    openUserSettingsModal,
    onUserSettingsModalUpdate,
  } = deps;

  const dismissUnverifiedEmailBanner = ref(false);
  const dismissGuestUpgradeBanner = ref(false);
  const emailBannerResendBusy = ref(false);
  const emailBannerResendMessage = ref<string | null>(null);
  const emailBannerResendError = ref<string | null>(null);
  const emailVerificationDowntimeNotified = ref(false);

  watch(
    () => authSession.backendUser?.id,
    () => {
      dismissUnverifiedEmailBanner.value = false;
      dismissGuestUpgradeBanner.value = false;
      emailBannerResendMessage.value = null;
      emailBannerResendError.value = null;
      emailVerificationDowntimeNotified.value = false;
    },
  );

  watch(
    () => authSession.backendUser?.isGuest,
    (v) => {
      if (v !== true) dismissGuestUpgradeBanner.value = false;
    },
  );

  watch(
    () => authSession.backendUser?.emailVerified,
    (v) => {
      if (v) dismissUnverifiedEmailBanner.value = false;
      if (v) emailVerificationDowntimeNotified.value = false;
    },
  );

  const showUnverifiedEmailPrompt = computed(() => {
    if (EMAIL_VERIFICATION_DOWNTIME) return false;
    if (!isAuthenticated.value || dismissUnverifiedEmailBanner.value)
      return false;
    const u = authSession.backendUser;
    if (!u || u.isGuest) return false;
    const em = u.email?.trim();
    if (!em) return false;
    return u.emailVerified === false;
  });

  const showUnverifiedEmailBanner = computed(
    () => showUnverifiedEmailPrompt.value && !isCompactShell.value,
  );

  const showUnverifiedEmailModal = computed(
    () => showUnverifiedEmailPrompt.value && isCompactShell.value,
  );

  const shouldShowEmailVerificationDowntimeToast = computed(() => {
    if (!EMAIL_VERIFICATION_DOWNTIME) return false;
    if (!isAuthenticated.value) return false;
    if (echoSyncCapabilities.isMockDataMode) return false;
    const u = authSession.backendUser;
    if (!u || u.isGuest) return false;
    const em = u.email?.trim();
    if (!em) return false;
    return u.emailVerified === false;
  });

  watch(
    () => shouldShowEmailVerificationDowntimeToast.value,
    (show) => {
      if (!show || emailVerificationDowntimeNotified.value) return;
      emailVerificationDowntimeNotified.value = true;
      dispatchAppToastDetail(EMAIL_VERIFICATION_DOWNTIME_TOAST);
    },
    { immediate: true },
  );

  const showGuestUpgradeBanner = computed(() => {
    if (!isAuthenticated.value || dismissGuestUpgradeBanner.value) return false;
    return authSession.backendUser?.isGuest === true;
  });

  /** Guest onboarding sits above the auth modal; hide it while signing in so login is usable. */
  const guestOnboardingHiddenForSignIn = ref(false);

  watch(
    () => authSession.backendUser?.isGuest === true,
    (isGuest) => {
      if (!isGuest) guestOnboardingHiddenForSignIn.value = false;
    },
  );

  watch(isAuthModalOpen, (open) => {
    if (
      !open &&
      authSession.isAuthenticated &&
      authSession.backendUser?.isGuest === true
    ) {
      guestOnboardingHiddenForSignIn.value = false;
    }
  });

  /** Guest onboarding upgrade modal — disabled; guests interact immediately. */
  const showGuestOnboardingModal = computed(() => false);

  const discordBotExportReadyGuildNameForBanner = computed(() => {
    const n = discordBotExportReadyBanner.value?.guildName?.trim();
    return n ? n : null;
  });

  function dismissEmailVerificationFlash() {
    authSession.clearEmailVerificationFlash();
  }

  function dismissUnverifiedEmailBannerClick() {
    dismissUnverifiedEmailBanner.value = true;
    emailBannerResendMessage.value = null;
    emailBannerResendError.value = null;
  }

  function onUnverifiedEmailModalUpdate(open: boolean) {
    if (!open) dismissUnverifiedEmailBannerClick();
  }

  function onGuestUpgradeBannerOpenSettings() {
    openUserSettingsModal('Account');
  }

  function dismissGuestUpgradeBannerClick() {
    dismissGuestUpgradeBanner.value = true;
  }

  function onUnverifiedEmailChangeEmail() {
    try {
      sessionStorage.setItem('echo_settings_change_email', '1');
    } catch {
      /* ignore */
    }
    openUserSettingsModal('Account');
  }

  async function onUnverifiedEmailResend() {
    if (EMAIL_VERIFICATION_DOWNTIME) {
      dispatchAppToastDetail(EMAIL_VERIFICATION_DOWNTIME_TOAST);
      return;
    }
    emailBannerResendMessage.value = null;
    emailBannerResendError.value = null;
    if (!authSession.isAuthenticated) return;
    emailBannerResendBusy.value = true;
    try {
      await authResendVerification();
      emailBannerResendMessage.value =
        'Check your inbox for a new verification link.';
    } catch (e) {
      if (
        e instanceof AuthApiError &&
        e.body.code === 'VERIFICATION_EMAIL_COOLDOWN'
      ) {
        emailBannerResendError.value =
          'Please wait before requesting another email.';
      } else if (e instanceof AuthApiError) {
        emailBannerResendError.value = e.message;
      } else {
        emailBannerResendError.value = 'Could not send email. Try again later.';
      }
    } finally {
      emailBannerResendBusy.value = false;
    }
  }

  function onGuestUpgradeSignInExisting() {
    isGuestUpgradeModalOpen.value = false;
    openAuthModal();
  }

  function onGuestOnboardingSignInExisting() {
    guestOnboardingHiddenForSignIn.value = true;
    openAuthModal({ entry: 'echo', tab: 'login' });
  }

  function onGuestUpgradeSignInFromSettings() {
    onUserSettingsModalUpdate(false);
    onGuestUpgradeSignInExisting();
  }

  return {
    emailBannerResendBusy,
    emailBannerResendMessage,
    emailBannerResendError,
    showUnverifiedEmailBanner,
    showUnverifiedEmailModal,
    showGuestUpgradeBanner,
    showGuestOnboardingModal,
    discordBotExportReadyGuildNameForBanner,
    dismissEmailVerificationFlash,
    dismissUnverifiedEmailBannerClick,
    onUnverifiedEmailModalUpdate,
    onGuestUpgradeBannerOpenSettings,
    dismissGuestUpgradeBannerClick,
    onUnverifiedEmailChangeEmail,
    onUnverifiedEmailResend,
    onGuestUpgradeSignInFromSettings,
    onGuestOnboardingSignInExisting,
  };
}
