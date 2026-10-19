<script setup lang="ts">
import { computed, ref, watch, toRef, nextTick, onUnmounted } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { icons } from '@/assets/icons';
import { usePlatform } from '@/platform/usePlatform';
import {
  AuthApiError,
  authDiscordLoginStart,
  authGoogleLoginStart,
  authForgotPassword,
  authLogin,
  authLoginEmailIpCode,
  authLoginEmailIpResend,
  authLoginMfa,
  authLoginResendVerification,
  authPasskeyLoginVerify,
  authRegister,
  authUpgradeGuest,
  isAuthLoginEmailIpChallenge,
  isAuthLoginEmailVerificationChallenge,
  isAuthLoginMfaChallenge,
  type AuthLoginResult,
} from '@/api/authClient';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import { messageForDiscordOAuthError } from '@/features/discord/integrationCopy';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { GOOGLE_SSO_SIGNIN_UI_ENABLED } from '@/features/google/googleSsoUiEnabled';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  MIN_REGISTER_PASSWORD_STRENGTH_PCT,
  normalizeEmail,
} from '@/features/auth/accountValidation';
import { sessionUserDisplayName } from '@/features/member-profile/memberProfiles';
import { withBasePath } from '@/features/layout/urlNavigation';
import { startOAuthFlow } from '@/platform/desktopBridge';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import {
  getPasskeyWebCeremonyBlockReason,
  mapPasskeyCeremonyError,
} from '@/features/auth/passkeyClientSupport';
import {
  passkeyLoginIdentFromRaw,
  prefetchPasskeyLoginOptions,
  runPasskeyAuthenticationCeremony,
} from '@/features/auth/passkeyWebCeremony';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import {
  ECHO_PUBLIC_SUPPORT_EMAIL,
  echoPublicSupportMailtoHref,
} from '@/config/echoPublicSupportContact';
import { useCompactShell } from '@/features/layout/useCompactShell';
import AuthAlertModal from '@/features/auth/components/AuthAlertModal.vue';
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** First screen when opening log in (OAuth hub vs Echo password). */
    initialLoginEntry?: 'social' | 'echo';
    /** Run WebAuthn passkey flow once after open (welcome shortcut). */
    passkeyOnOpen?: boolean;
    /** Open on register tab (e.g. welcome create shortcut). */
    initialTab?: 'login' | 'register';
    /** Start on forgot-password sub-view (e.g. after deep link). */
    initialAuthSubView?: null | 'forgot';
  }>(),
  {
    initialLoginEntry: 'social',
    passkeyOnOpen: false,
    initialTab: 'login',
    initialAuthSubView: null,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const DISCORD_OAUTH_ERR_KEY = 'echo_discord_oauth_error';
const GOOGLE_OAUTH_ERR_KEY = 'echo_google_oauth_error';

const authSession = useAuthSessionStore();
const { isMockDataMode } = usePlatform();
const { isCompactShell } = useCompactShell();

const tab = ref<'login' | 'register'>('login');
const username = ref('');
const email = ref('');
const password = ref('');
const displayName = ref('');
const submitting = ref(false);
const errorMessage = ref('');

/** Second step after password when server returns mfaRequired. */
const mfaToken = ref<string | null>(null);
const mfaFactor = ref<'totp' | 'recovery'>('totp');
const mfaTotpCode = ref('');
const mfaRecoveryCode = ref('');
const emailGateToken = ref<string | null>(null);
const emailGateMasked = ref('');
const emailIpCode = ref('');
const emailVerifyNotice = ref('');
/** After password: email verify lock, new-IP OTP, or null. */
const emailGateKind = ref<null | 'verify' | 'ip'>(null);

/** Sub-view on login/register (e.g. forgot password). */
const authSubView = ref<null | 'forgot'>(null);

/** Login: OAuth/passkey first; Echo username/password behind “Echo account”. */
const loginEntryView = ref<'social' | 'echo'>('social');
const forgotEmail = ref('');
const forgotMessage = ref('');
const dismissMockWarningModal = ref(false);
const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const passwordStrength = computed(() =>
  computePasswordStrength(password.value),
);

const strengthBarClass = computed(() => {
  const p = passwordStrength.value.fillPct;
  if (p >= 82) return 'auth-strength__fill--strong';
  if (p >= 58) return 'auth-strength__fill--good';
  if (p >= 36) return 'auth-strength__fill--fair';
  return 'auth-strength__fill--weak';
});

const registerPasswordOk = computed(
  () =>
    password.value.length >= MIN_ACCOUNT_PASSWORD_LENGTH &&
    passwordStrength.value.fillPct >= MIN_REGISTER_PASSWORD_STRENGTH_PCT,
);

/** Guests are "authenticated" but should still use login/register to attach a full account. */
const showAuthForms = computed(
  () =>
    !authSession.isAuthenticated || authSession.backendUser?.isGuest === true,
);

const signedInFullAccount = computed(
  () =>
    authSession.isAuthenticated && authSession.backendUser?.isGuest !== true,
);

/** “Signed in as …” — same rule as shell roster (`displayName` else `username`). */
const signedInAccountLabel = computed(() => {
  const u = authSession.backendUser;
  if (!u) return '';
  return sessionUserDisplayName(u.displayName, u.username);
});

const showMfaStep = computed(() => Boolean(mfaToken.value));
const showEmailVerifyStep = computed(
  () => emailGateKind.value === 'verify' && !mfaToken.value,
);
const showEmailIpStep = computed(
  () => emailGateKind.value === 'ip' && !mfaToken.value,
);

const showAuthErrorModal = computed(
  () => isCompactShell.value && props.modelValue && !!errorMessage.value.trim(),
);

const showMockWarningModal = computed(
  () =>
    isCompactShell.value &&
    props.modelValue &&
    isMockDataMode &&
    showAuthForms.value &&
    !dismissMockWarningModal.value,
);

function onAuthErrorModalUpdate(open: boolean) {
  if (!open) errorMessage.value = '';
}

function onMockWarningModalUpdate(open: boolean) {
  if (!open) dismissMockWarningModal.value = true;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    dismissMockWarningModal.value = false;
    errorMessage.value = '';
    submitting.value = false;
    mfaToken.value = null;
    mfaTotpCode.value = '';
    mfaRecoveryCode.value = '';
    mfaFactor.value = 'totp';
    emailGateToken.value = null;
    emailGateMasked.value = '';
    emailIpCode.value = '';
    emailVerifyNotice.value = '';
    emailGateKind.value = null;
    authSubView.value = props.initialAuthSubView ?? null;
    forgotEmail.value = '';
    forgotMessage.value = '';
    loginEntryView.value = props.initialLoginEntry;
    tab.value = props.initialTab;
    // Full members use "Signed in as …" — keep them on login. Guests may open register to upgrade.
    if (signedInFullAccount.value) {
      tab.value = 'login';
    }
    try {
      const oauthErr = sessionStorage.getItem(DISCORD_OAUTH_ERR_KEY)?.trim();
      if (oauthErr) {
        sessionStorage.removeItem(DISCORD_OAUTH_ERR_KEY);
        errorMessage.value = messageForDiscordOAuthError(oauthErr);
      }
      const googleErr = sessionStorage.getItem(GOOGLE_OAUTH_ERR_KEY)?.trim();
      if (googleErr) {
        sessionStorage.removeItem(GOOGLE_OAUTH_ERR_KEY);
        errorMessage.value = messageForGoogleOAuthError(googleErr);
      }
    } catch {
      /* ignore */
    }
    if (props.passkeyOnOpen && ECHO_PASSKEYS_ENABLED && !isMockDataMode) {
      const blocked = getPasskeyWebCeremonyBlockReason('login');
      if (blocked) {
        errorMessage.value = blocked;
      } else {
        void prefetchPasskeyLoginOptions(
          passkeyLoginIdentFromRaw(username.value),
        );
        if (!isSafariLikeBrowser()) {
          nextTick(() => void submitPasskeyLogin());
        } else {
          errorMessage.value = echoT('auth.errors.safariPasskeyTap');
        }
      }
    }
  },
  { immediate: true },
);

watch(tab, (t, prev) => {
  errorMessage.value = '';
  if (t === 'login' && prev === 'register') {
    loginEntryView.value = 'social';
  }
});

function onDocumentEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !props.modelValue) return;
  // Safari (and other browsers) use Escape to dismiss password manager / autofill / strong-password
  // UI. This listener is registered in capture phase, so without this guard we would run first,
  // call preventDefault, and close the whole dialog while the user is still composing the form.
  const root = modalRef.value;
  const ae = document.activeElement;
  if (
    root &&
    ae instanceof HTMLElement &&
    root.contains(ae) &&
    (ae instanceof HTMLInputElement ||
      ae instanceof HTMLTextAreaElement ||
      ae instanceof HTMLSelectElement)
  ) {
    return;
  }
  e.preventDefault();
  close();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onDocumentEscape, true);
    } else {
      document.removeEventListener('keydown', onDocumentEscape, true);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentEscape, true);
});

function close() {
  emit('update:modelValue', false);
}

function mapError(err: unknown): string {
  if (err instanceof Error && err.message === 'ACCOUNTS_DISABLED_PREVIEW') {
    return echoT('auth.errors.previewMode');
  }
  if (err instanceof AuthApiError) {
    if (err.body.code === 'INVALID_MFA_CODE')
      return echoT('auth.errors.codeMismatch');
    if (err.body.code === 'INVALID_MFA_TOKEN')
      return echoT('auth.errors.stepExpiredPassword');
    if (err.body.code === 'MFA_NOT_REQUIRED')
      return echoT('auth.errors.mfaNotRequired');
    if (err.body.code === 'INVALID_CREDENTIALS')
      return echoT('auth.errors.invalidCredentials');
    if (err.body.code === 'USERNAME_TAKEN')
      return echoT('auth.errors.usernameTaken');
    if (err.body.code === 'INVALID_USERNAME')
      return echoT('auth.errors.invalidUsername');
    if (err.body.code === 'INVALID_EMAIL')
      return echoT('auth.errors.invalidEmail');
    if (err.body.code === 'INVALID_EMAIL_PROVIDER')
      return err.body.message || echoT('auth.errors.invalidEmailProvider');
    if (err.body.code === 'EMAIL_IN_USE')
      return echoT('auth.guestOnboarding.errors.emailInUse');
    if (err.body.code === 'INVALID_DISPLAY_NAME')
      return echoT('auth.errors.invalidDisplayName');
    if (err.body.code === 'HWID_REQUIRED')
      return err.body.message || echoT('auth.errors.hwidRequired');
    if (err.body.code === 'ACCOUNT_LIMIT_HWID_IP')
      return err.body.message || echoT('auth.errors.accountLimit');
    if (err.body.code === 'NOT_AVAILABLE')
      return err.body.message || echoT('b12.login.notAvailable');
    if (err.body.code === 'NOT_CONFIGURED')
      return err.body.message || echoT('auth.errors.notConfigured');
    if (err.body.code === 'CHALLENGE_EXPIRED')
      return echoT('auth.errors.stepExpiredPasskey');
    if (err.body.code === 'VERIFICATION_FAILED')
      return echoT('auth.passkeyErrors.verificationFailed');
    return translateApiErrorBody(err.body);
  }
  if (err instanceof Error) return err.message;
  return echoT('common.somethingWentWrong');
}

async function handleLoginResult(result: AuthLoginResult): Promise<boolean> {
  if (isAuthLoginEmailVerificationChallenge(result)) {
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
    emailVerifyNotice.value = '';
    emailGateKind.value = 'verify';
    mfaToken.value = null;
    return false;
  }
  if (isAuthLoginEmailIpChallenge(result)) {
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
    emailIpCode.value = '';
    emailGateKind.value = 'ip';
    mfaToken.value = null;
    return false;
  }
  if (isAuthLoginMfaChallenge(result)) {
    mfaToken.value = result.mfaToken;
    mfaFactor.value = 'totp';
    mfaTotpCode.value = '';
    mfaRecoveryCode.value = '';
    emailGateKind.value = null;
    return false;
  }
  authSession.setSession(result);
  close();
  return true;
}

async function submitLogin() {
  if (isMockDataMode) {
    errorMessage.value = mapError(new Error('ACCOUNTS_DISABLED_PREVIEW'));
    return;
  }
  const u = username.value.trim();
  const p = password.value;
  if (!u || !p) {
    errorMessage.value = echoT('auth.errors.enterCredentials');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLogin({ username: u, password: p });
    await handleLoginResult(result);
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function submitMfa() {
  if (isMockDataMode) return;
  const token = mfaToken.value?.trim() ?? '';
  if (!token) {
    errorMessage.value = echoT('auth.errors.sessionExpired');
    return;
  }
  const useTotp = mfaFactor.value === 'totp';
  const code = mfaTotpCode.value.trim();
  const recoveryCode = mfaRecoveryCode.value.trim();
  if (useTotp && !/^\d{6}$/.test(code)) {
    errorMessage.value = echoT('auth.errors.enterMfaCode');
    return;
  }
  if (!useTotp && !recoveryCode) {
    errorMessage.value = echoT('auth.errors.enterRecoveryCode');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const session = await authLoginMfa(
      useTotp ? { mfaToken: token, code } : { mfaToken: token, recoveryCode },
    );
    authSession.setSession(session);
    mfaToken.value = null;
    close();
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

function cancelMfa() {
  mfaToken.value = null;
  mfaTotpCode.value = '';
  mfaRecoveryCode.value = '';
  emailGateToken.value = null;
  emailGateMasked.value = '';
  emailIpCode.value = '';
  emailVerifyNotice.value = '';
  emailGateKind.value = null;
  errorMessage.value = '';
}

async function resendEmailVerification() {
  const token = emailGateToken.value?.trim() ?? '';
  if (!token) {
    errorMessage.value = echoT('auth.errors.sessionExpired');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    await authLoginResendVerification({ loginToken: token });
    emailVerifyNotice.value = echoT('auth.emailVerify.sent');
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function submitEmailIpCode() {
  const token = emailGateToken.value?.trim() ?? '';
  const code = emailIpCode.value.trim();
  if (!token) {
    errorMessage.value = echoT('auth.errors.sessionExpired');
    return;
  }
  if (!/^\d{4,8}$/.test(code)) {
    errorMessage.value = echoT('auth.errors.enterEmailCode');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLoginEmailIpCode({ loginToken: token, code });
    await handleLoginResult(result);
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function resendEmailIpCode() {
  const token = emailGateToken.value?.trim() ?? '';
  if (!token) {
    errorMessage.value = echoT('auth.errors.sessionExpired');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLoginEmailIpResend({ loginToken: token });
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function submitRegister() {
  if (isMockDataMode) {
    errorMessage.value = mapError(new Error('ACCOUNTS_DISABLED_PREVIEW'));
    return;
  }
  const u = username.value.trim();
  const p = password.value;
  const em = normalizeEmail(email.value);
  const d = displayName.value.trim();
  if (!u || !p) {
    errorMessage.value = echoT('auth.errors.chooseUsernamePassword');
    return;
  }
  if (!em || !isValidEmailFormat(email.value)) {
    errorMessage.value = echoT('auth.guestOnboarding.errors.validEmail');
    return;
  }
  if (p.length < 8) {
    errorMessage.value = echoT('b12.login.passwordMin8');
    return;
  }
  if (!registerPasswordOk.value) {
    errorMessage.value = echoT('auth.errors.passwordTooWeak');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = authSession.backendUser?.isGuest
      ? await authUpgradeGuest({
          username: u,
          password: p,
          email: em,
          ...(d ? { displayName: d } : {}),
        })
      : await authRegister({
          username: u,
          password: p,
          email: em,
          ...(d ? { displayName: d } : {}),
        });
    await handleLoginResult(result);
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function onSubmit() {
  if (tab.value === 'login') await submitLogin();
  else await submitRegister();
}

async function submitForgot() {
  if (isMockDataMode) return;
  const em = normalizeEmail(forgotEmail.value);
  if (!em || !isValidEmailFormat(forgotEmail.value)) {
    errorMessage.value = echoT('auth.guestOnboarding.errors.validEmail');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  forgotMessage.value = '';
  try {
    const out = await authForgotPassword({ email: em });
    forgotMessage.value = out.message || echoT('auth.forgot.success');
  } catch (e) {
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

function openForgotPasswordPage() {
  const href = withBasePath(
    '/forgot-password',
    import.meta.env.BASE_URL || '/',
  );
  window.location.assign(href);
}

async function startOauthRedirect(
  provider: 'discord' | 'google',
  start: () => Promise<{ authorizeUrl: string }>,
) {
  if (isMockDataMode) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const { authorizeUrl } = await start();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    console.error(`[echo][${provider}][login-modal] start failed`, {
      error:
        e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

function startDiscordLogin() {
  return startOauthRedirect('discord', authDiscordLoginStart);
}

function startGoogleLogin() {
  return startOauthRedirect('google', authGoogleLoginStart);
}

function prefetchPasskeyLoginFromForm() {
  if (!ECHO_PASSKEYS_ENABLED || isMockDataMode) return;
  if (getPasskeyWebCeremonyBlockReason('login')) return;
  void prefetchPasskeyLoginOptions(passkeyLoginIdentFromRaw(username.value));
}

async function submitPasskeyLogin() {
  const blocked = getPasskeyWebCeremonyBlockReason('login');
  if (blocked) {
    errorMessage.value = blocked;
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const ident = passkeyLoginIdentFromRaw(username.value);
    const { credential, challengeId } =
      await runPasskeyAuthenticationCeremony(ident);
    const result = await authPasskeyLoginVerify({
      challengeId,
      credential: credential as unknown as Record<string, unknown>,
    });
    await handleLoginResult(result);
  } catch (e) {
    errorMessage.value = mapPasskeyCeremonyError(e, 'login');
    void prefetchPasskeyLoginOptions(passkeyLoginIdentFromRaw(username.value));
  } finally {
    submitting.value = false;
  }
}

const appBase = import.meta.env.BASE_URL || '/';
const legalTermsHref = withBasePath('/legal/terms', appBase);
const legalPrivacyHref = withBasePath('/legal/privacy', appBase);
</script>

<template>
  <!-- No backdrop click-to-close: avoids losing the form when users dismiss browser UI (e.g. Chrome password save) or miss-click outside the card. Close: X button or Escape (see onDocumentEscape). -->
  <div
    v-if="modelValue"
    class="auth-modal-overlay fixed inset-0 z-[150] overflow-x-hidden overflow-y-auto px-4 py-6 sm:py-10"
  >
    <div
      class="flex min-h-[100dvh] w-full items-center justify-center py-2 sm:py-4"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        class="auth-modal-panel relative my-auto w-full max-w-[460px] rounded-2xl px-7 py-8 text-foreground outline-none sm:px-9 sm:py-9"
      >
        <div class="auth-modal-accent" aria-hidden="true" />

        <div class="flex items-start justify-between gap-5">
          <div class="min-w-0">
            <h2
              id="auth-modal-title"
              class="text-[1.5rem] font-bold leading-snug tracking-tight text-foreground"
            >
              <template v-if="signedInFullAccount">{{
                echoT('b12.title.account')
              }}</template>
              <template v-else-if="showEmailVerifyStep">{{
                echoT('b12.title.verifyEmail')
              }}</template>
              <template v-else-if="showEmailIpStep">{{
                echoT('b12.title.confirmSignIn')
              }}</template>
              <template v-else-if="showMfaStep">{{
                echoT('b12.title.mfa')
              }}</template>
              <template v-else-if="authSubView === 'forgot'">{{
                echoT('b12.title.forgot')
              }}</template>
              <template v-else-if="tab === 'login'">{{
                echoT('b12.title.login')
              }}</template>
              <template v-else>{{ echoT('b12.title.register') }}</template>
            </h2>
            <p
              v-if="
                showAuthForms &&
                authSession.backendUser?.isGuest &&
                isMockDataMode &&
                tab === 'login'
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{ echoT('b12.lead.preview') }}
            </p>
            <p
              v-else-if="
                showAuthForms && showEmailVerifyStep && !isMockDataMode
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{
                echoT('b12.lead.locked', {
                  email: emailGateMasked || echoT('b12.login.yourEmail'),
                })
              }}
            </p>
            <p
              v-else-if="showAuthForms && showEmailIpStep && !isMockDataMode"
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{
                echoT('b12.lead.ipCode', {
                  email: emailGateMasked || echoT('b12.login.yourEmail'),
                })
              }}
            </p>
            <p
              v-else-if="showAuthForms && showMfaStep && !isMockDataMode"
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{ echoT('b12.lead.mfa') }}
            </p>
            <p
              v-else-if="
                showAuthForms && authSubView === 'forgot' && !isMockDataMode
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{ echoT('b12.lead.forgot') }}
            </p>
            <p
              v-else-if="
                showAuthForms &&
                !authSession.isAuthenticated &&
                !isMockDataMode &&
                tab === 'login' &&
                loginEntryView === 'social'
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              <template v-if="ECHO_PASSKEYS_ENABLED">
                {{ echoT('b12.lead.socialPasskey') }}
              </template>
              <template v-else>
                {{ echoT('b12.lead.social') }}
              </template>
            </p>
            <p
              v-else-if="
                showAuthForms &&
                !authSession.isAuthenticated &&
                !isMockDataMode &&
                tab === 'login' &&
                loginEntryView === 'echo'
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{ echoT('auth.modal.echoLead') }}
            </p>
            <p
              v-else-if="
                showAuthForms &&
                !authSession.isAuthenticated &&
                !isMockDataMode &&
                tab === 'register'
              "
              class="mt-2 text-[0.8125rem] leading-snug text-fg-subtle"
            >
              {{ echoT('auth.modal.registerLead') }}
            </p>
            <p
              v-else-if="
                showAuthForms && !authSession.isAuthenticated && isMockDataMode
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              {{ echoT('b12.lead.previewViewing') }}
            </p>
            <p
              v-else-if="signedInFullAccount"
              class="auth-signed-in-hint mt-3 text-sm"
            >
              {{ echoT('b12.lead.signedInAs') }}
              <span class="font-semibold text-foreground">{{
                signedInAccountLabel
              }}</span>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-xl p-2 text-fg-subtle transition hover:bg-glass-hover hover:text-foreground"
            :aria-label="echoT('b12.common.close')"
            @click="close"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <template v-if="showAuthForms">
          <div
            v-if="isMockDataMode && !isCompactShell"
            class="auth-alert-warning mt-8 rounded-xl px-5 py-3.5 text-sm leading-relaxed"
          >
            {{ echoT('b12.lead.actionsOff') }}
          </div>

          <div v-if="showEmailVerifyStep" class="mt-8 space-y-5">
            <p
              v-if="emailVerifyNotice"
              class="rounded-xl bg-glass-2 px-4 py-3 text-sm leading-snug text-fg-soft"
              role="status"
            >
              {{ emailVerifyNotice }}
            </p>
            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>
            <button
              type="button"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
              @click="resendEmailVerification"
            >
              {{ echoT('auth.actions.resendVerificationEmail') }}
            </button>
            <button
              type="button"
              class="w-full text-center text-sm text-fg-subtle hover:text-fg-soft"
              @click="cancelMfa"
            >
              {{ echoT('auth.actions.backToSignIn') }}
            </button>
          </div>

          <form
            v-else-if="showEmailIpStep"
            class="mt-8 space-y-5"
            @submit.prevent="submitEmailIpCode"
          >
            <div>
              <label class="auth-label" for="auth-email-ip-code">{{
                echoT('auth.fields.emailCode')
              }}</label>
              <input
                id="auth-email-ip-code"
                v-model="emailIpCode"
                inputmode="numeric"
                type="text"
                autocomplete="one-time-code"
                maxlength="8"
                class="auth-input mt-2.5"
                placeholder="000000"
                autofocus
              />
            </div>
            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>
            <button
              type="submit"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
            >
              {{ echoT('auth.actions.continue') }}
            </button>
            <button
              type="button"
              class="w-full text-center text-sm text-fg-subtle hover:text-fg-soft"
              :disabled="submitting"
              @click="resendEmailIpCode"
            >
              {{ echoT('auth.actions.resendCode') }}
            </button>
            <button
              type="button"
              class="w-full text-center text-sm text-fg-subtle hover:text-fg-soft"
              @click="cancelMfa"
            >
              {{ echoT('auth.actions.backToSignIn') }}
            </button>
          </form>

          <form
            v-else-if="showMfaStep"
            class="mt-8 space-y-5"
            @submit.prevent="submitMfa"
          >
            <div class="flex gap-2 rounded-xl bg-glass-2 p-1">
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-xs font-semibold transition"
                :class="
                  mfaFactor === 'totp'
                    ? 'bg-glass-3 text-foreground'
                    : 'text-fg-subtle hover:text-fg-soft'
                "
                @click="mfaFactor = 'totp'"
              >
                {{ echoT('auth.fields.authenticator') }}
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-xs font-semibold transition"
                :class="
                  mfaFactor === 'recovery'
                    ? 'bg-glass-3 text-foreground'
                    : 'text-fg-subtle hover:text-fg-soft'
                "
                @click="mfaFactor = 'recovery'"
              >
                {{ echoT('auth.fields.recoveryCode') }}
              </button>
            </div>
            <div v-if="mfaFactor === 'totp'">
              <label class="auth-label" for="auth-mfa-totp">{{
                echoT('auth.fields.sixDigitCode')
              }}</label>
              <input
                id="auth-mfa-totp"
                v-model="mfaTotpCode"
                inputmode="numeric"
                type="text"
                autocomplete="one-time-code"
                maxlength="8"
                class="auth-input mt-2.5"
                placeholder="000000"
                autofocus
              />
            </div>
            <div v-else>
              <label class="auth-label" for="auth-mfa-recovery">{{
                echoT('auth.fields.recoveryCode')
              }}</label>
              <input
                id="auth-mfa-recovery"
                v-model="mfaRecoveryCode"
                type="text"
                autocomplete="off"
                class="auth-input mt-2.5"
                placeholder="XXXX-XXXX-XXXX"
              />
            </div>
            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>
            <button
              type="submit"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
            >
              <img
                :src="icons.logIn"
                alt=""
                class="h-4 w-4 filter invert opacity-90"
              />
              {{ echoT('auth.actions.continue') }}
            </button>
            <p
              class="text-center text-[0.875rem] leading-relaxed text-fg-subtle"
            >
              <button type="button" class="auth-link-btn" @click="cancelMfa">
                {{ echoT('auth.actions.backToPassword') }}
              </button>
            </p>
          </form>

          <form
            v-else-if="authSubView === 'forgot'"
            class="mt-8 space-y-5"
            @submit.prevent="submitForgot"
          >
            <div>
              <label class="auth-label" for="auth-forgot-email">{{
                echoT('auth.email')
              }}</label>
              <input
                id="auth-forgot-email"
                v-model="forgotEmail"
                type="email"
                inputmode="email"
                autocomplete="email"
                :disabled="isMockDataMode"
                class="auth-input mt-2.5"
                placeholder="you@example.com"
              />
            </div>
            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>
            <div
              v-if="forgotMessage"
              class="auth-alert-success rounded-xl px-4 py-3 text-sm leading-snug"
              role="status"
            >
              {{ forgotMessage }}
            </div>
            <button
              type="submit"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
            >
              {{ echoT('auth.actions.sendResetLink') }}
            </button>
            <p
              class="text-center text-[0.875rem] leading-relaxed text-fg-subtle"
            >
              <button
                type="button"
                class="auth-link-btn"
                @click="authSubView = null"
              >
                {{ echoT('auth.actions.backToLogIn') }}
              </button>
            </p>
          </form>

          <form
            v-else-if="tab === 'register'"
            class="mt-6 space-y-4 sm:mt-8 sm:space-y-5"
            @submit.prevent="onSubmit"
          >
            <div class="space-y-4 sm:space-y-5">
              <div>
                <label class="auth-label" for="auth-email">{{
                  echoT('auth.email')
                }}</label>
                <input
                  id="auth-email"
                  v-model="email"
                  type="email"
                  inputmode="email"
                  autocomplete="email"
                  :disabled="isMockDataMode"
                  class="auth-input mt-2.5"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label class="auth-label" for="auth-display"
                  >{{ echoT('auth.displayName') }}
                  <span class="font-normal text-fg-subtle">{{
                    echoT('auth.fields.optional')
                  }}</span></label
                >
                <input
                  id="auth-display"
                  v-model="displayName"
                  type="text"
                  autocomplete="nickname"
                  :disabled="isMockDataMode"
                  class="auth-input mt-2.5"
                  :placeholder="echoT('auth.placeholders.displayNameHint')"
                />
              </div>
            </div>
            <div>
              <label class="auth-label" for="auth-username">{{
                echoT('auth.username')
              }}</label>
              <input
                id="auth-username"
                v-model="username"
                type="text"
                name="username"
                autocomplete="username"
                :disabled="isMockDataMode"
                class="auth-input mt-2.5"
                placeholder="your_name"
              />
            </div>
            <div>
              <label class="auth-label" for="auth-password">{{
                echoT('auth.password')
              }}</label>
              <input
                id="auth-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                :disabled="isMockDataMode"
                class="auth-input mt-2"
                placeholder="••••••••"
              />
              <div v-if="password.length > 0" class="mt-3 space-y-1.5">
                <div class="auth-strength__track">
                  <div
                    class="auth-strength__fill h-full rounded-full transition-all duration-300 ease-out"
                    :class="strengthBarClass"
                    :style="{ width: `${passwordStrength.fillPct}%` }"
                  />
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-fg-subtle">{{
                    echoT('auth.passwordStrength.title')
                  }}</span>
                  <span
                    class="font-medium"
                    :class="{
                      'auth-strength-weak': passwordStrength.fillPct < 36,
                      'auth-strength-fair':
                        passwordStrength.fillPct >= 36 &&
                        passwordStrength.fillPct < 58,
                      'auth-strength-good':
                        passwordStrength.fillPct >= 58 &&
                        passwordStrength.fillPct < 82,
                      'auth-strength-strong': passwordStrength.fillPct >= 82,
                    }"
                  >
                    {{ passwordStrength.label }}
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
            >
              <img
                :src="icons.plus"
                alt=""
                class="h-4 w-4 filter invert opacity-90"
              />
              {{ echoT('auth.createAccount') }}
            </button>

            <div class="auth-mode-switch">
              <p class="text-center text-[0.9375rem] leading-relaxed">
                <span class="text-fg-subtle">{{
                  echoT('auth.login.alreadyHaveAccount')
                }}</span>
                <button
                  type="button"
                  class="auth-link-btn"
                  @click="tab = 'login'"
                >
                  {{ echoT('auth.titles.logIn') }}
                </button>
              </p>
              <p
                class="mt-3 text-center text-[0.8125rem] leading-snug text-fg-subtle"
              >
                {{ echoT('auth.legal.signingUpComma') }}
                <a class="auth-link-btn" :href="legalTermsHref">{{
                  echoT('auth.legal.terms')
                }}</a>
                and
                <a class="auth-link-btn" :href="legalPrivacyHref">{{
                  echoT('auth.legal.privacy')
                }}</a>
                .
              </p>
            </div>
          </form>

          <div
            v-else-if="
              tab === 'login' && !isMockDataMode && loginEntryView === 'social'
            "
            class="auth-social-stack mt-8 space-y-4"
          >
            <div
              class="auth-sso-segmented w-full"
              role="group"
              :aria-label="echoT('auth.sso.signInOptions')"
            >
              <button
                type="button"
                class="auth-sso-segmented__btn auth-sso-segmented__btn--discord"
                :disabled="submitting"
                :aria-label="echoT('auth.sso.continueWithDiscord')"
                @click="startDiscordLogin"
              >
                <svg
                  class="auth-sso-discord h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                  />
                </svg>
              </button>
              <button
                v-if="GOOGLE_SSO_SIGNIN_UI_ENABLED"
                type="button"
                class="auth-sso-segmented__btn auth-sso-segmented__btn--google"
                :disabled="submitting"
                :aria-label="echoT('auth.sso.continueWithGoogle')"
                @click="startGoogleLogin"
              >
                <svg
                  class="auth-sso-google-mark h-5 w-5 shrink-0"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.21 37.01 46.98 31.49 46.98 24.55z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </button>
              <button
                v-if="ECHO_PASSKEYS_ENABLED"
                type="button"
                class="auth-sso-segmented__btn auth-sso-segmented__btn--passkey"
                :disabled="submitting"
                :aria-label="echoT('auth.passkey.helpTitle')"
                @pointerdown="prefetchPasskeyLoginFromForm"
                @click="submitPasskeyLogin()"
              >
                <svg
                  class="auth-sso-passkey h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </button>
            </div>

            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>

            <button
              type="button"
              class="auth-submit w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting"
              @click="loginEntryView = 'echo'"
            >
              {{ echoT('auth.sso.continueWithEcho') }}
            </button>

            <button
              type="button"
              class="auth-create-account-btn w-full rounded-xl py-3 text-sm font-semibold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting"
              @click="tab = 'register'"
            >
              {{ echoT('auth.titles.createAnAccount') }}
            </button>

            <p
              class="text-center text-[0.875rem] leading-relaxed text-fg-subtle"
            >
              <button
                type="button"
                class="auth-link-btn"
                :disabled="submitting"
                @click="openForgotPasswordPage"
              >
                {{ echoT('auth.login.forgotYourPassword') }}
              </button>
            </p>
          </div>

          <form v-else class="mt-8 space-y-5" @submit.prevent="onSubmit">
            <div>
              <label class="auth-label" for="auth-username">{{
                echoT('auth.fields.usernameOrEmail')
              }}</label>
              <input
                id="auth-username"
                v-model="username"
                type="text"
                name="username"
                autocomplete="username"
                :disabled="isMockDataMode"
                class="auth-input mt-2.5"
                :placeholder="echoT('b12.login.userOrEmailPh')"
              />
            </div>
            <div>
              <label class="auth-label" for="auth-password">{{
                echoT('auth.password')
              }}</label>
              <input
                id="auth-password"
                v-model="password"
                type="password"
                name="password"
                autocomplete="current-password"
                :disabled="isMockDataMode"
                class="auth-input mt-2"
                placeholder="••••••••"
              />
            </div>

            <div
              v-if="errorMessage && !isCompactShell"
              class="auth-alert-error rounded-xl px-4 py-3 text-sm leading-snug"
              role="alert"
            >
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              class="auth-submit mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting || isMockDataMode"
            >
              <img
                :src="icons.logIn"
                alt=""
                class="h-4 w-4 filter invert opacity-90"
              />
              {{ echoT('auth.titles.logIn') }}
            </button>

            <button
              v-if="tab === 'login' && !isMockDataMode && ECHO_PASSKEYS_ENABLED"
              type="button"
              class="auth-submit-secondary mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting"
              @pointerdown="prefetchPasskeyLoginFromForm"
              @click="submitPasskeyLogin()"
            >
              {{ echoT('auth.login.signInWithPasskey') }}
            </button>

            <div
              v-if="tab === 'login' && !isMockDataMode"
              class="auth-login-secondary mt-1 flex flex-col gap-4"
            >
              <div
                class="auth-login-links-row flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[0.875rem] leading-relaxed"
              >
                <button
                  type="button"
                  class="auth-create-account-text"
                  :disabled="submitting"
                  @click="tab = 'register'"
                >
                  {{ echoT('auth.titles.createAnAccount') }}
                </button>
                <span class="auth-login-links-sep" aria-hidden="true">/</span>
                <button
                  type="button"
                  class="auth-link-btn auth-link-btn--solo"
                  @click="authSubView = 'forgot'"
                >
                  {{ echoT('auth.forgotPassword') }}
                </button>
              </div>
              <div
                v-if="loginEntryView === 'echo'"
                class="auth-login-secondary__footer flex justify-start"
              >
                <button
                  type="button"
                  class="add-server-back-btn text-sm font-semibold"
                  :aria-label="echoT('auth.login.backToDiscord')"
                  @click="loginEntryView = 'social'"
                >
                  {{ echoT('auth.actions.back') }}
                </button>
              </div>
            </div>
          </form>

          <p
            v-if="!isMockDataMode && !authSession.isAuthenticated"
            class="auth-support-contact mt-6 text-center text-[0.8125rem] leading-snug text-fg-subtle"
          >
            {{ echoT('auth.modal.supportContact') }}
            <a class="auth-link-btn" :href="echoPublicSupportMailtoHref">{{
              ECHO_PUBLIC_SUPPORT_EMAIL
            }}</a>
          </p>
        </template>

        <div
          v-else
          class="mt-8 rounded-xl bg-glass-2 px-5 py-4 text-sm leading-relaxed text-fg-soft"
        >
          <i18n-t keypath="b12.login.signOutHelp" scope="global">
            <template #settings>
              <span class="font-semibold text-fg">{{
                echoT('auth.modal.settings')
              }}</span>
            </template>
            <template #logOut>
              <span class="font-semibold text-fg">{{
                echoT('auth.modal.logOut')
              }}</span>
            </template>
          </i18n-t>
        </div>
      </div>
    </div>
  </div>

  <AuthAlertModal
    :model-value="showAuthErrorModal"
    :message="errorMessage"
    :title="echoT('auth.titles.signInIssue')"
    variant="error"
    @update:model-value="onAuthErrorModalUpdate"
  />
  <AuthAlertModal
    :model-value="showMockWarningModal"
    :title="echoT('auth.titles.previewMode')"
    :message="echoT('auth.modal.previewActionsOff')"
    variant="warning"
    @update:model-value="onMockWarningModalUpdate"
  />
</template>

<style scoped lang="scss" src="./styles/LoginRegisterModal.scss"></style>
