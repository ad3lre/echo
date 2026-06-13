import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';

const h = vi.hoisted(() => {
  class AuthApiError extends Error {
    body: { code?: string };
    constructor(message: string, body: { code?: string } = {}) {
      super(message);
      this.body = body;
    }
  }
  return {
    AuthApiError,
    authResendVerification: vi.fn(),
    dispatchAppToastDetail: vi.fn(),
  };
});

vi.mock('@/api/authClient', () => ({
  AuthApiError: h.AuthApiError,
  authResendVerification: h.authResendVerification,
}));
vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToastDetail: h.dispatchAppToastDetail,
}));
vi.mock('@/config/emailVerificationDowntime', () => ({
  EMAIL_VERIFICATION_DOWNTIME: false,
  EMAIL_VERIFICATION_DOWNTIME_TOAST: { message: 'downtime' },
}));
vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));
vi.mock('@/config/echoGuestAccountsEnabled', () => ({
  ECHO_GUEST_ACCOUNTS_ENABLED: true,
}));

import { useAppLayoutBannerNotices } from './useAppLayoutBannerNotices';

type Deps = Parameters<typeof useAppLayoutBannerNotices>[0];

describe('useAppLayoutBannerNotices', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    h.authResendVerification.mockReset();
    h.dispatchAppToastDetail.mockReset();
  });
  afterEach(() => scope?.stop());

  function mount(over: Partial<Record<string, unknown>> = {}) {
    const authSession = reactive({
      backendUser: {
        id: 'u1',
        isGuest: false,
        emailVerified: false,
        email: 'a@b.com',
      } as Record<string, unknown> | null,
      isAuthenticated: true,
      clearEmailVerificationFlash: vi.fn(),
    });
    const ctx = {
      authSession,
      isAuthenticated: ref(true),
      isCompactShell: ref(false),
      isGuestUpgradeModalOpen: ref(false),
      isAuthModalOpen: ref(false),
      discordBotExportReadyBanner: ref<{ guildName: string } | null>(null),
      openAuthModal: vi.fn(),
      openUserSettingsModal: vi.fn(),
      onUserSettingsModalUpdate: vi.fn(),
      ...over,
    };
    scope = effectScope(true);
    const api = scope.run(() =>
      useAppLayoutBannerNotices(ctx as unknown as Deps),
    )!;
    return { api, ctx };
  }

  it('shows the unverified-email banner on wide layouts and the modal on compact', () => {
    const wide = mount();
    expect(wide.api.showUnverifiedEmailBanner.value).toBe(true);
    expect(wide.api.showUnverifiedEmailModal.value).toBe(false);
    scope.stop();

    const compact = mount({ isCompactShell: ref(true) });
    expect(compact.api.showUnverifiedEmailBanner.value).toBe(false);
    expect(compact.api.showUnverifiedEmailModal.value).toBe(true);
  });

  it('hides the unverified-email prompt for verified / guest / no-email users', () => {
    expect(
      mount({
        authSession: reactive({
          backendUser: {
            id: 'u',
            isGuest: false,
            emailVerified: true,
            email: 'a@b.com',
          },
          isAuthenticated: true,
          clearEmailVerificationFlash: vi.fn(),
        }),
      }).api.showUnverifiedEmailBanner.value,
    ).toBe(false);
  });

  it('dismissing the unverified-email banner hides it and clears resend text', () => {
    const { api } = mount();
    api.dismissUnverifiedEmailBannerClick();
    expect(api.showUnverifiedEmailBanner.value).toBe(false);
    expect(api.emailBannerResendMessage.value).toBe(null);
    expect(api.emailBannerResendError.value).toBe(null);
  });

  it('shows + dismisses the guest-upgrade banner', () => {
    const { api } = mount({
      authSession: reactive({
        backendUser: {
          id: 'g',
          isGuest: true,
          emailVerified: false,
          email: '',
        },
        isAuthenticated: true,
        clearEmailVerificationFlash: vi.fn(),
      }),
    });
    expect(api.showGuestUpgradeBanner.value).toBe(true);
    api.dismissGuestUpgradeBannerClick();
    expect(api.showGuestUpgradeBanner.value).toBe(false);
  });

  it('shows guest onboarding modal for authenticated guests', () => {
    const { api } = mount({
      authSession: reactive({
        backendUser: {
          id: 'g',
          isGuest: true,
          emailVerified: false,
          email: '',
        },
        isAuthenticated: true,
        clearEmailVerificationFlash: vi.fn(),
      }),
    });
    expect(api.showGuestOnboardingModal.value).toBe(true);
  });

  it('resend success sets the confirmation message', async () => {
    h.authResendVerification.mockResolvedValue(undefined);
    const { api } = mount();
    await api.onUnverifiedEmailResend();
    expect(h.authResendVerification).toHaveBeenCalledTimes(1);
    expect(api.emailBannerResendMessage.value).toContain('verification link');
    expect(api.emailBannerResendBusy.value).toBe(false);
  });

  it('resend cooldown maps to a friendly error', async () => {
    h.authResendVerification.mockRejectedValue(
      new h.AuthApiError('nope', { code: 'VERIFICATION_EMAIL_COOLDOWN' }),
    );
    const { api } = mount();
    await api.onUnverifiedEmailResend();
    expect(api.emailBannerResendError.value).toContain('Please wait');
  });

  it('resend with a generic AuthApiError surfaces its message', async () => {
    h.authResendVerification.mockRejectedValue(new h.AuthApiError('boom'));
    const { api } = mount();
    await api.onUnverifiedEmailResend();
    expect(api.emailBannerResendError.value).toBe('boom');
  });

  it('opens settings for guest-upgrade and change-email', () => {
    const { api, ctx } = mount();
    api.onGuestUpgradeBannerOpenSettings();
    api.onUnverifiedEmailChangeEmail();
    expect(ctx.openUserSettingsModal).toHaveBeenNthCalledWith(1, 'Account');
    expect(ctx.openUserSettingsModal).toHaveBeenNthCalledWith(2, 'Account');
  });

  it('guest sign-in from settings closes settings, the modal, and opens auth', () => {
    const { api, ctx } = mount();
    api.onGuestUpgradeSignInFromSettings();
    expect(ctx.onUserSettingsModalUpdate).toHaveBeenCalledWith(false);
    expect(ctx.isGuestUpgradeModalOpen.value).toBe(false);
    expect(ctx.openAuthModal).toHaveBeenCalledTimes(1);
  });

  it('exposes the trimmed Discord bot-export guild name', () => {
    const { api, ctx } = mount();
    expect(api.discordBotExportReadyGuildNameForBanner.value).toBe(null);
    ctx.discordBotExportReadyBanner.value = { guildName: '  My Guild  ' };
    expect(api.discordBotExportReadyGuildNameForBanner.value).toBe('My Guild');
  });

  it('resets dismissal state when the signed-in user changes', async () => {
    const { api, ctx } = mount();
    api.dismissUnverifiedEmailBannerClick();
    expect(api.showUnverifiedEmailBanner.value).toBe(false);
    ctx.authSession.backendUser = {
      id: 'u2',
      isGuest: false,
      emailVerified: false,
      email: 'c@d.com',
    };
    await nextTick();
    expect(api.showUnverifiedEmailBanner.value).toBe(true);
  });
});
