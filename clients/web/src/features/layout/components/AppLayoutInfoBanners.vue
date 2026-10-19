<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, inject, unref } from 'vue';
import type { MaybeRef } from 'vue';
import {
  LAYOUT_INFO_BANNERS_KEY,
  type LayoutInfoBannersHostHandlers,
} from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutInfoBannersProps } from '@/features/layout/appLayoutInfoBannersProps';

/** Props optional when `LAYOUT_INFO_BANNERS_KEY` is provided from `AppLayout`. */
const props = defineProps<Partial<AppLayoutInfoBannersProps>>();

const layoutInfo = inject(LAYOUT_INFO_BANNERS_KEY, null);

function pick<K extends keyof AppLayoutInfoBannersProps>(key: K) {
  return computed(() => {
    const inj = layoutInfo;
    if (inj && key in inj && inj[key] !== undefined) {
      return unref(inj[key] as MaybeRef<AppLayoutInfoBannersProps[K]>);
    }
    return props[key];
  });
}

function host(): Partial<LayoutInfoBannersHostHandlers> | null {
  return layoutInfo;
}

const showApiFetchErrorBannerRef = pick('showApiFetchErrorBanner');
const showApiFetchErrorBanner = computed(
  () => !!showApiFetchErrorBannerRef.value,
);
const apiErrorText = pick('apiErrorText');
const sessionEndedMessage = pick('sessionEndedMessage');
const sessionReturningUserHintRef = pick('sessionReturningUserHint');
const sessionReturningUserHint = computed(
  () => !!sessionReturningUserHintRef.value,
);
const isMockDataModeRef = pick('isMockDataMode');
const isMockDataMode = computed(() => !!isMockDataModeRef.value);
const echoWorkspaceError = pick('echoWorkspaceError');
const showWelcomeBackHintRef = pick('showWelcomeBackHint');
const showWelcomeBackHint = computed(() => !!showWelcomeBackHintRef.value);
const welcomeBackHintTextRef = pick('welcomeBackHintText');
const welcomeBackHintText = computed(
  () => welcomeBackHintTextRef.value ?? echoT('b15.banners.welcomeBack'),
);
const emailVerificationFlash = pick('emailVerificationFlash');
const showUnverifiedEmailBannerRef = pick('showUnverifiedEmailBanner');
const showUnverifiedEmailBanner = computed(
  () => !!showUnverifiedEmailBannerRef.value,
);
const emailBannerResendBusyRef = pick('emailBannerResendBusy');
const emailBannerResendBusy = computed(() => !!emailBannerResendBusyRef.value);
const emailBannerResendMessage = pick('emailBannerResendMessage');
const emailBannerResendError = pick('emailBannerResendError');
const discordBotExportReadyGuildName = pick('discordBotExportReadyGuildName');
const primaryFlowFailureBanner = pick('primaryFlowFailureBanner');
const uiErrorMessage = pick('uiErrorMessage');
const uiErrorSeverity = pick('uiErrorSeverity');
const uiErrorShowRetryRef = pick('uiErrorShowRetry');
const uiErrorShowRetry = computed(() => !!uiErrorShowRetryRef.value);
const uiErrorShowCreateAccountRef = pick('uiErrorShowCreateAccount');
const uiErrorShowCreateAccount = computed(
  () => !!uiErrorShowCreateAccountRef.value,
);
const uiErrorRetryBusyRef = pick('uiErrorRetryBusy');
const uiErrorRetryBusy = computed(() => !!uiErrorRetryBusyRef.value);
const showGuestUpgradeBannerRef = pick('showGuestUpgradeBanner');
const showGuestUpgradeBanner = computed(
  () => !!showGuestUpgradeBannerRef.value,
);
const suppressPrimaryFlowFailureBannerRef = pick(
  'suppressPrimaryFlowFailureBanner',
);
const suppressPrimaryFlowFailureBanner = computed(
  () => !!suppressPrimaryFlowFailureBannerRef.value,
);

const emit = defineEmits<{
  'session-sign-in': [];
  'session-dismiss': [];
  'welcome-back-sign-in': [];
  'email-verification-flash-dismiss': [];
  'unverified-email-dismiss': [];
  'unverified-email-resend': [];
  'unverified-email-change-email': [];
  'discord-bot-export-ready-dismiss': [];
  'primary-flow-failure-dismiss': [];
  'ui-error-dismiss': [];
  'ui-error-retry': [];
  'ui-error-create-account': [];
  'guest-upgrade-open-settings': [];
  'guest-upgrade-dismiss': [];
}>();

function fireSessionSignIn() {
  const h = host();
  if (h?.onSessionSignIn) h.onSessionSignIn();
  else emit('session-sign-in');
}
function fireSessionDismiss() {
  const h = host();
  if (h?.onSessionDismiss) h.onSessionDismiss();
  else emit('session-dismiss');
}
function fireWelcomeBackSignIn() {
  const h = host();
  if (h?.onWelcomeBackSignIn) h.onWelcomeBackSignIn();
  else emit('welcome-back-sign-in');
}
function fireEmailVerificationFlashDismiss() {
  const h = host();
  if (h?.onEmailVerificationFlashDismiss) h.onEmailVerificationFlashDismiss();
  else emit('email-verification-flash-dismiss');
}
function fireGuestUpgradeOpenSettings() {
  const h = host();
  if (h?.onGuestUpgradeOpenSettings) h.onGuestUpgradeOpenSettings();
  else emit('guest-upgrade-open-settings');
}
function fireGuestUpgradeDismiss() {
  const h = host();
  if (h?.onGuestUpgradeDismiss) h.onGuestUpgradeDismiss();
  else emit('guest-upgrade-dismiss');
}
function fireUnverifiedEmailDismiss() {
  const h = host();
  if (h?.onUnverifiedEmailDismiss) h.onUnverifiedEmailDismiss();
  else emit('unverified-email-dismiss');
}
function fireUnverifiedEmailResend() {
  const h = host();
  if (h?.onUnverifiedEmailResend) void h.onUnverifiedEmailResend();
  else emit('unverified-email-resend');
}
function fireUnverifiedEmailChangeEmail() {
  const h = host();
  if (h?.onUnverifiedEmailChangeEmail) h.onUnverifiedEmailChangeEmail();
  else emit('unverified-email-change-email');
}
function fireDiscordBotExportReadyDismiss() {
  const h = host();
  if (h?.onDiscordBotExportReadyDismiss) h.onDiscordBotExportReadyDismiss();
  else emit('discord-bot-export-ready-dismiss');
}
function firePrimaryFlowFailureDismiss() {
  const h = host();
  if (h?.onPrimaryFlowFailureDismiss) h.onPrimaryFlowFailureDismiss();
  else emit('primary-flow-failure-dismiss');
}
function fireUiErrorDismiss() {
  const h = host();
  if (h?.onUiErrorDismiss) h.onUiErrorDismiss();
  else emit('ui-error-dismiss');
}
function fireUiErrorRetry() {
  const h = host();
  if (h?.onUiErrorRetry) void h.onUiErrorRetry();
  else emit('ui-error-retry');
}
function fireUiErrorCreateAccount() {
  const h = host();
  if (h?.onUiErrorCreateAccount) h.onUiErrorCreateAccount();
  else emit('ui-error-create-account');
}

/** When any strip is shown, pad below the iOS status bar / notch so copy and actions stay tappable. */
const hasVisibleInfoBanner = computed(() => {
  const mock = isMockDataMode.value;
  if (uiErrorMessage.value && !mock) return true;
  if (discordBotExportReadyGuildName.value && !mock) return true;
  if (showGuestUpgradeBanner.value && !mock) return true;
  if (emailVerificationFlash.value && !mock) return true;
  if (showUnverifiedEmailBanner.value && !mock) return true;
  if (showApiFetchErrorBanner.value && apiErrorText.value) return true;
  if (sessionEndedMessage.value && !mock) return true;
  if (showWelcomeBackHint.value) return true;
  if (echoWorkspaceError.value && !mock) return true;
  if (primaryFlowFailureBanner.value && !mock) return true;
  return false;
});
</script>

<template>
  <!-- Single root: parent `main-content-area` grid uses `auto 1fr` rows; multiple
       roots would each become a grid row and the `1fr` row would land on the wrong
       child, leaving a huge gap above the chat header. -->
  <div
    class="info-banners-stack col-span-full flex min-h-0 w-full min-w-0 flex-col shrink-0"
    :class="
      hasVisibleInfoBanner ? 'pt-[env(safe-area-inset-top,0px)]' : undefined
    "
  >
    <div
      v-if="uiErrorMessage && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-[4.5rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b px-3 py-1.5 text-xs leading-tight shrink-0 sm:justify-between"
      :class="{
        'border-rose-600/25 bg-rose-950/45 text-rose-50/95':
          (uiErrorSeverity ?? 'error') === 'error',
        'border-amber-500/20 bg-amber-500/12 text-amber-50/95':
          uiErrorSeverity === 'warning',
        'border-sky-500/20 bg-sky-950/40 text-sky-50/95':
          uiErrorSeverity === 'info',
      }"
      role="alert"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-3 sm:text-left"
        :title="uiErrorMessage ?? undefined"
      >
        {{ uiErrorMessage }}
      </span>
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
        <button
          v-if="uiErrorShowCreateAccount"
          type="button"
          class="rounded-md bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-400"
          @click="fireUiErrorCreateAccount"
        >
          {{ echoT('b15.banners.createAccount') }}
        </button>
        <button
          v-if="uiErrorShowRetry"
          type="button"
          class="rounded-md bg-glass-3 px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-glass-active disabled:opacity-50"
          :disabled="uiErrorRetryBusy"
          @click="fireUiErrorRetry"
        >
          {{
            uiErrorRetryBusy
              ? echoT('b15.banners.retrying')
              : echoT('b15.banners.retry')
          }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-glass-hover"
          :class="{
            'text-rose-100/80 hover:text-rose-50':
              (uiErrorSeverity ?? 'error') === 'error',
            'text-amber-100/70 hover:text-amber-50':
              uiErrorSeverity === 'warning',
            'text-sky-100/90 hover:text-sky-50': uiErrorSeverity === 'info',
          }"
          @click="fireUiErrorDismiss"
        >
          {{ echoT('b15.banners.dismiss') }}
        </button>
      </div>
    </div>
    <div
      v-if="discordBotExportReadyGuildName && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-[4.5rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-[var(--accent)]/25 bg-[var(--chat-accent-muted)] px-3 py-1.5 text-xs leading-tight text-[var(--text)] shrink-0 sm:justify-between"
      role="status"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-3 sm:text-left"
      >
        <i18n-t keypath="b15.banners.discordReady" scope="global">
          <template #guild
            ><strong class="font-semibold">{{
              discordBotExportReadyGuildName
            }}</strong></template
          >
          <template #add
            ><strong class="font-semibold">{{
              echoT('b15.banners.addServer')
            }}</strong></template
          >
          <template #create
            ><strong class="font-semibold">{{
              echoT('b15.banners.createMyOwn')
            }}</strong></template
          >
          <template #import
            ><strong class="font-semibold">{{
              echoT('b15.banners.importDiscord')
            }}</strong></template
          >
        </i18n-t>
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text)]/70 transition-colors hover:bg-glass-hover hover:text-[var(--text)]"
        @click="fireDiscordBotExportReadyDismiss"
      >
        {{ echoT('b15.banners.dismiss') }}
      </button>
    </div>
    <div
      v-if="showGuestUpgradeBanner && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-[4.5rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-indigo-500/25 bg-indigo-950/50 px-3 py-1.5 text-xs leading-tight text-indigo-50/95 shrink-0 sm:justify-between"
      role="status"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-3 sm:text-left"
      >
        <i18n-t keypath="b15.banners.guestIntro" scope="global">
          <template #guest
            ><strong class="font-semibold text-indigo-100/95">{{
              echoT('b15.banners.guestAccount')
            }}</strong></template
          >
        </i18n-t>
        <button
          type="button"
          class="ml-0.5 inline font-semibold text-indigo-200 underline decoration-indigo-400/80 underline-offset-2 transition-colors hover:text-white hover:decoration-white/90"
          @click="fireGuestUpgradeOpenSettings"
        >
          {{ echoT('b15.banners.upgradeAccount') }}
        </button>
      </span>
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          class="rounded-md bg-glass-3 px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-glass-active"
          @click="fireGuestUpgradeOpenSettings"
        >
          {{ echoT('b15.banners.openAccountSettings') }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium text-indigo-100/75 transition-colors hover:bg-glass-hover hover:text-indigo-50"
          @click="fireGuestUpgradeDismiss"
        >
          {{ echoT('b15.banners.dismiss') }}
        </button>
      </div>
    </div>
    <div
      v-if="emailVerificationFlash && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-14 flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-emerald-500/20 bg-emerald-950/35 px-3 py-1.5 text-xs leading-tight text-emerald-50/95 shrink-0 sm:justify-between"
      role="status"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-2 sm:text-left"
      >
        {{ emailVerificationFlash }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-100/70 transition-colors hover:bg-glass-hover hover:text-emerald-50"
        @click="fireEmailVerificationFlashDismiss"
      >
        {{ echoT('b15.banners.dismiss') }}
      </button>
    </div>
    <div
      v-if="showUnverifiedEmailBanner && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-[4.5rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-sky-500/25 bg-sky-950/45 px-3 py-1.5 text-xs leading-tight text-sky-50/95 shadow-none ring-0 shrink-0 sm:justify-between"
      role="status"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-3 sm:text-left"
      >
        {{ echoT('b15.banners.verifyEmail') }}
        <span
          v-if="emailBannerResendMessage"
          class="mt-0.5 block font-medium text-sky-100/95"
          >{{ emailBannerResendMessage }}</span
        >
        <span
          v-if="emailBannerResendError"
          class="mt-0.5 block text-rose-100"
          >{{ emailBannerResendError }}</span
        >
      </span>
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          class="rounded-md bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-none ring-0 transition-colors hover:bg-sky-400 disabled:opacity-50"
          :disabled="emailBannerResendBusy"
          @click="fireUnverifiedEmailResend"
        >
          {{
            emailBannerResendBusy
              ? echoT('b15.banners.sending')
              : echoT('b15.banners.resendEmail')
          }}
        </button>
        <button
          type="button"
          class="rounded-md bg-glass-2 px-2.5 py-1 text-[11px] font-semibold text-sky-50 transition-colors hover:bg-glass-active"
          @click="fireUnverifiedEmailChangeEmail"
        >
          {{ echoT('b15.banners.changeEmail') }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium text-sky-100/80 transition-colors hover:bg-glass-hover hover:text-sky-50"
          @click="fireUnverifiedEmailDismiss"
        >
          {{ echoT('b15.banners.dismiss') }}
        </button>
      </div>
    </div>
    <div
      v-if="showApiFetchErrorBanner && apiErrorText"
      class="app-info-banner col-span-full max-h-11 shrink-0 overflow-hidden border-b border-amber-500/15 bg-amber-500/20 px-3 py-1.5"
    >
      <p
        class="text-center text-[11px] leading-snug text-amber-100/95 line-clamp-2 break-words"
        :title="echoT('b15.banners.savedCopy', { error: apiErrorText })"
      >
        {{ echoT('b15.banners.savedCopy', { error: apiErrorText }) }}
      </p>
    </div>
    <div
      v-if="sessionEndedMessage && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-11 flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-amber-400/20 bg-amber-500/12 px-3 py-1 text-xs leading-tight text-amber-50/95 shrink-0 sm:justify-between"
      role="alert"
    >
      <span
        class="min-h-0 min-w-0 flex-1 overflow-hidden text-center sm:text-left"
      >
        <span
          class="block text-[11px] leading-snug break-words line-clamp-2"
          :title="sessionEndedMessage ?? undefined"
        >
          {{ sessionEndedMessage }}
        </span>
        <span
          v-if="sessionReturningUserHint"
          class="mt-0.5 block text-[10px] leading-snug text-amber-100/65"
        >
          {{ echoT('b15.banners.restoreWorkspace') }}
        </span>
      </span>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="rounded-md bg-glass-2 px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-glass-active"
          @click="fireSessionSignIn"
        >
          {{ echoT('b15.banners.signIn') }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium text-amber-100/70 transition-colors hover:bg-glass-hover hover:text-amber-50"
          @click="fireSessionDismiss"
        >
          {{ echoT('b15.banners.dismiss') }}
        </button>
      </div>
    </div>
    <div
      v-if="showWelcomeBackHint"
      class="app-info-banner col-span-full flex min-h-0 max-h-[3.25rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-sky-500/20 bg-sky-950/40 px-3 py-1 text-xs leading-tight text-sky-50/95 shrink-0 sm:justify-between"
      role="status"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] leading-snug break-words line-clamp-3 sm:text-left"
      >
        {{ echoT('b15.banners.welcomeBack') }}
      </span>
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          class="rounded-md bg-glass-3 px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-glass-active"
          @click="fireWelcomeBackSignIn"
        >
          {{ echoT('b15.banners.logIn') }}
        </button>
      </div>
    </div>
    <div
      v-if="echoWorkspaceError && !isMockDataMode"
      class="app-info-banner col-span-full flex min-h-0 max-h-11 items-center gap-2 overflow-hidden border-b border-rose-500/15 bg-rose-500/12 px-3 py-1 text-xs leading-tight text-rose-100/90 shrink-0"
      role="status"
    >
      <span class="shrink-0 font-semibold tracking-tight text-rose-200/95"
        >Echo</span
      >
      <span
        class="min-h-0 min-w-0 flex-1 line-clamp-2 break-words text-[11px] leading-snug"
        :title="echoWorkspaceError ?? undefined"
      >
        {{ echoWorkspaceError }}
      </span>
    </div>
    <div
      v-if="
        primaryFlowFailureBanner &&
        !isMockDataMode &&
        !suppressPrimaryFlowFailureBanner
      "
      class="app-info-banner col-span-full flex min-h-0 max-h-[4.5rem] flex-wrap items-center justify-center gap-2 overflow-hidden border-b border-rose-600/25 bg-rose-950/45 px-3 py-1.5 text-xs leading-tight text-rose-50/95 shrink-0 sm:justify-between"
      role="alert"
    >
      <span
        class="min-h-0 min-w-0 flex-1 text-center text-[11px] font-medium leading-snug break-words line-clamp-3 sm:text-left"
        :title="primaryFlowFailureBanner ?? undefined"
      >
        {{ primaryFlowFailureBanner }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-rose-100/80 transition-colors hover:bg-glass-hover hover:text-rose-50"
        @click="firePrimaryFlowFailureDismiss"
      >
        {{ echoT('b15.banners.dismiss') }}
      </button>
    </div>
  </div>
</template>
