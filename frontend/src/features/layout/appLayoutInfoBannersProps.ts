import type { UIErrorSeverity } from '@/utils/uiErrorBus';

/** Props for `AppLayoutInfoBanners` — optional when `LAYOUT_INFO_BANNERS_KEY` is provided. */
export type AppLayoutInfoBannersProps = {
  showApiFetchErrorBanner: boolean;
  apiErrorText: string | null | undefined;
  sessionEndedMessage: string | null | undefined;
  /** When session ended and user likely had a full account before — extra copy only. */
  sessionReturningUserHint?: boolean;
  isMockDataMode: boolean;
  echoWorkspaceError: string | null | undefined;
  showWelcomeBackHint?: boolean;
  emailVerificationFlash?: string | null;
  showUnverifiedEmailBanner?: boolean;
  emailBannerResendBusy?: boolean;
  emailBannerResendMessage?: string | null;
  emailBannerResendError?: string | null;
  /** Discord export bot finished while user was away from the add-server flow. */
  discordBotExportReadyGuildName?: string | null;
  /** Primary flow failure (never silent): stable flow id + message, dismissible. */
  primaryFlowFailureBanner?: string | null;
  /** User-impacting errors from `UIErrorBus` (reactions, polls, navigation, socket). */
  uiErrorMessage?: string | null;
  uiErrorSeverity?: UIErrorSeverity;
  uiErrorShowRetry?: boolean;
  uiErrorRetryBusy?: boolean;
  /** Guest-only API denial — show CTA to open registration (see `onUiErrorCreateAccount`). */
  uiErrorShowCreateAccount?: boolean;
  /** Guest sessions: prompt to upgrade to a full account (link opens Settings → Account). */
  showGuestUpgradeBanner?: boolean;
  /** Hide primary flow error banner when the server down gate is already showing the error. */
  suppressPrimaryFlowFailureBanner?: boolean;
};
