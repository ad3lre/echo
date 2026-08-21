/**
 * LAYOUT_INFO_BANNERS_KEY mapping. Must run after useAppLayoutPlatformLifecycle
 * (needs ui-error / primary-flow banner sources).
 */

import { computed, provide, type ComputedRef, type Ref } from 'vue';
import { hasPriorRegistration } from '@/features/layout/priorRegistration';
import {
  LAYOUT_INFO_BANNERS_KEY,
  type LayoutInfoBannersContext,
} from '@/features/layout/layoutInjectionKeys';
import { uiErrorBannerShowsCreateAccount } from '@/features/layout/composables/controller/appLayoutProvidePredicates';

type RV<T> = Ref<T> | ComputedRef<T>;

export type AppLayoutInfoBannersProvideDeps = {
  showApiFetchErrorBanner: LayoutInfoBannersContext['showApiFetchErrorBanner'];
  apiErrorText: RV<string | null | undefined>;
  sessionEndedMessage: RV<string | null | undefined>;
  echoWorkspaceError: LayoutInfoBannersContext['echoWorkspaceError'];
  showWelcomeBackSlimBanner: LayoutInfoBannersContext['showWelcomeBackHint'];
  emailVerificationFlash: LayoutInfoBannersContext['emailVerificationFlash'];
  showUnverifiedEmailBanner: LayoutInfoBannersContext['showUnverifiedEmailBanner'];
  showGuestUpgradeBanner: LayoutInfoBannersContext['showGuestUpgradeBanner'];
  emailBannerResendBusy: LayoutInfoBannersContext['emailBannerResendBusy'];
  emailBannerResendMessage: LayoutInfoBannersContext['emailBannerResendMessage'];
  emailBannerResendError: LayoutInfoBannersContext['emailBannerResendError'];
  discordBotExportReadyGuildName: LayoutInfoBannersContext['discordBotExportReadyGuildName'];
  primaryFlowFailureBanner: LayoutInfoBannersContext['primaryFlowFailureBanner'];
  showServerDownGate: RV<boolean>;
  uiErrorBanner: RV<{
    message?: string;
    severity?: string;
    retryAction?: () => void;
    code?: string;
  } | null>;
  uiErrorRetryBusy: LayoutInfoBannersContext['uiErrorRetryBusy'];
  openAuthModal: (opts?: { tab?: 'login' | 'register' }) => void;
  clearSessionEndedMessage: () => void;
  dismissEmailVerificationFlash: LayoutInfoBannersContext['onEmailVerificationFlashDismiss'];
  onGuestUpgradeOpenSettings: LayoutInfoBannersContext['onGuestUpgradeOpenSettings'];
  onGuestUpgradeDismiss: LayoutInfoBannersContext['onGuestUpgradeDismiss'];
  onUnverifiedEmailDismiss: LayoutInfoBannersContext['onUnverifiedEmailDismiss'];
  onUnverifiedEmailResend: LayoutInfoBannersContext['onUnverifiedEmailResend'];
  onUnverifiedEmailChangeEmail: LayoutInfoBannersContext['onUnverifiedEmailChangeEmail'];
  onDiscordBotExportReadyDismiss: LayoutInfoBannersContext['onDiscordBotExportReadyDismiss'];
  onPrimaryFlowFailureDismiss: LayoutInfoBannersContext['onPrimaryFlowFailureDismiss'];
  onUiErrorDismiss: LayoutInfoBannersContext['onUiErrorDismiss'];
  onUiErrorRetry: LayoutInfoBannersContext['onUiErrorRetry'];
};

function assembleInfoBannerValues(deps: AppLayoutInfoBannersProvideDeps) {
  return {
    showApiFetchErrorBanner: deps.showApiFetchErrorBanner,
    apiErrorText: computed(() => deps.apiErrorText.value ?? null),
    sessionEndedMessage: deps.sessionEndedMessage,
    sessionReturningUserHint: computed(
      () => !!deps.sessionEndedMessage.value && hasPriorRegistration(),
    ),
    isMockDataMode: false,
    echoWorkspaceError: deps.echoWorkspaceError,
    showWelcomeBackHint: deps.showWelcomeBackSlimBanner,
    emailVerificationFlash: deps.emailVerificationFlash,
    showUnverifiedEmailBanner: deps.showUnverifiedEmailBanner,
    showGuestUpgradeBanner: deps.showGuestUpgradeBanner,
    emailBannerResendBusy: deps.emailBannerResendBusy,
    emailBannerResendMessage: deps.emailBannerResendMessage,
    emailBannerResendError: deps.emailBannerResendError,
    discordBotExportReadyGuildName: deps.discordBotExportReadyGuildName,
    primaryFlowFailureBanner: deps.primaryFlowFailureBanner,
    suppressPrimaryFlowFailureBanner: deps.showServerDownGate,
    uiErrorMessage: computed(() => deps.uiErrorBanner.value?.message ?? null),
    uiErrorSeverity: computed(
      () => deps.uiErrorBanner.value?.severity ?? 'error',
    ),
    uiErrorShowRetry: computed(() => !!deps.uiErrorBanner.value?.retryAction),
    uiErrorShowCreateAccount: computed(() =>
      uiErrorBannerShowsCreateAccount(deps.uiErrorBanner.value),
    ),
    uiErrorRetryBusy: deps.uiErrorRetryBusy,
  };
}

function assembleInfoBannerHandlers(deps: AppLayoutInfoBannersProvideDeps) {
  return {
    onSessionSignIn: () => deps.openAuthModal(),
    onSessionDismiss: () => deps.clearSessionEndedMessage(),
    onWelcomeBackSignIn: () => deps.openAuthModal(),
    onWelcomeBackContinueGuest: () => {},
    onEmailVerificationFlashDismiss: deps.dismissEmailVerificationFlash,
    onGuestUpgradeOpenSettings: deps.onGuestUpgradeOpenSettings,
    onGuestUpgradeDismiss: deps.onGuestUpgradeDismiss,
    onUnverifiedEmailDismiss: deps.onUnverifiedEmailDismiss,
    onUnverifiedEmailResend: deps.onUnverifiedEmailResend,
    onUnverifiedEmailChangeEmail: deps.onUnverifiedEmailChangeEmail,
    onDiscordBotExportReadyDismiss: deps.onDiscordBotExportReadyDismiss,
    onPrimaryFlowFailureDismiss: deps.onPrimaryFlowFailureDismiss,
    onUiErrorDismiss: deps.onUiErrorDismiss,
    onUiErrorRetry: deps.onUiErrorRetry,
    onUiErrorCreateAccount: () => {
      deps.openAuthModal({ tab: 'register' });
      deps.onUiErrorDismiss();
    },
  };
}

export function useAppLayoutInfoBannersProvide(
  deps: AppLayoutInfoBannersProvideDeps,
) {
  provide(LAYOUT_INFO_BANNERS_KEY, {
    ...assembleInfoBannerValues(deps),
    ...assembleInfoBannerHandlers(deps),
  } as LayoutInfoBannersContext);
}
