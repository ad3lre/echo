<script setup lang="ts">
import { computed, ref, watch, toRef, nextTick, onUnmounted } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { icons } from '@/assets/icons';
import { usePlatform } from '@/platform/usePlatform';
import {
  AuthApiError,
  authDiscordDesktopHandoffStartUrl,
  authDiscordLoginStart,
  authGoogleDesktopHandoffStartUrl,
  authGoogleLoginStart,
  authForgotPassword,
  authLogin,
  authLoginMfa,
  authPasskeyLoginVerify,
  authRegister,
  authUpgradeGuest,
  isAuthLoginMfaChallenge,
} from '@/api/authClient';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import { messageForDiscordOAuthError } from '@/features/discord/discordIntegrationCopy';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { GOOGLE_SSO_SIGNIN_UI_ENABLED } from '@/features/google/googleSsoUiEnabled';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  clearPendingDesktopOAuthHandoffNonce,
  createPendingDesktopOAuthHandoffNonce,
  setPendingDesktopOAuthReturnPath,
} from '@/platform/desktopOAuthHandoff';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  MIN_REGISTER_PASSWORD_STRENGTH_PCT,
  normalizeEmail,
} from '@/utils/accountValidation';
import { sessionUserDisplayName } from '@/utils/memberProfiles';
import { withBasePath } from '@/features/layout/urlNavigation';
import {
  isDesktop,
  openExternal,
  startOAuthFlow,
} from '@/platform/desktopBridge';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import {
  getPasskeyWebCeremonyBlockReason,
  mapPasskeyCeremonyError,
} from '@/utils/passkeyClientSupport';
import {
  passkeyLoginIdentFromRaw,
  prefetchPasskeyLoginOptions,
  runPasskeyAuthenticationCeremony,
} from '@/utils/passkeyWebCeremony';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import {
  ECHO_PUBLIC_SUPPORT_EMAIL,
  echoPublicSupportMailtoHref,
} from '@/config/echoPublicSupportContact';
import { useCompactShell } from '@/composables/useCompactShell';
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
          errorMessage.value =
            'Tap Sign in with passkey below to continue with Face ID or Touch ID.';
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
    return 'Sign-in isn’t available while Echo is in preview mode.';
  }
  if (err instanceof AuthApiError) {
    if (err.body.code === 'INVALID_MFA_CODE')
      return 'That code doesn’t match. Try again.';
    if (err.body.code === 'INVALID_MFA_TOKEN')
      return 'The sign-in step expired. Close this and log in again with your password.';
    if (err.body.code === 'MFA_NOT_REQUIRED')
      return 'Two-factor sign-in isn’t needed for this account.';
    if (err.body.code === 'INVALID_CREDENTIALS')
      return 'That username or password doesn’t match our records.';
    if (err.body.code === 'USERNAME_TAKEN')
      return 'That username is already taken. Try another.';
    if (err.body.code === 'INVALID_USERNAME')
      return 'That username isn’t valid. Try a different one.';
    if (err.body.code === 'INVALID_EMAIL')
      return 'Please enter a valid email address.';
    if (err.body.code === 'INVALID_EMAIL_PROVIDER')
      return (
        err.body.message ||
        'That email provider cannot be used. Try a normal inbox you keep long term.'
      );
    if (err.body.code === 'EMAIL_IN_USE')
      return 'That email is already registered. Try logging in instead.';
    if (err.body.code === 'INVALID_DISPLAY_NAME')
      return 'That display name is not valid. Try a different one.';
    if (err.body.code === 'HWID_REQUIRED')
      return (
        err.body.message ||
        'This server needs a device identifier to create an account. Update the app or try another browser.'
      );
    if (err.body.code === 'ACCOUNT_LIMIT_HWID_IP')
      return (
        err.body.message ||
        'Too many accounts from this device on this network. Use an existing account or try again later.'
      );
    if (err.body.code === 'NOT_AVAILABLE')
      return (
        err.body.message || 'That isn’t available right now. Try again later.'
      );
    if (err.body.code === 'NOT_CONFIGURED')
      return (
        err.body.message ||
        'This sign-in method isn’t available on this server.'
      );
    if (err.body.code === 'CHALLENGE_EXPIRED')
      return 'That sign-in step expired. Try passkey again.';
    if (err.body.code === 'VERIFICATION_FAILED')
      return 'Passkey verification failed. Try again.';
    return translateApiErrorBody(err.body);
  }
  if (err instanceof Error) return err.message;
  return echoT('common.somethingWentWrong');
}

async function submitLogin() {
  if (isMockDataMode) {
    errorMessage.value = mapError(new Error('ACCOUNTS_DISABLED_PREVIEW'));
    return;
  }
  const u = username.value.trim();
  const p = password.value;
  if (!u || !p) {
    errorMessage.value = 'Enter your username or email and password.';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLogin({ username: u, password: p });
    if (isAuthLoginMfaChallenge(result)) {
      mfaToken.value = result.mfaToken;
      mfaFactor.value = 'totp';
      mfaTotpCode.value = '';
      mfaRecoveryCode.value = '';
      return;
    }
    authSession.setSession(result);
    close();
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
    errorMessage.value = 'Sign-in expired. Try logging in again.';
    return;
  }
  const useTotp = mfaFactor.value === 'totp';
  const code = mfaTotpCode.value.trim();
  const recoveryCode = mfaRecoveryCode.value.trim();
  if (useTotp && !/^\d{6}$/.test(code)) {
    errorMessage.value = 'Enter the 6-digit code from your authenticator app.';
    return;
  }
  if (!useTotp && !recoveryCode) {
    errorMessage.value = 'Enter a recovery code.';
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
  errorMessage.value = '';
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
    errorMessage.value = 'Choose a username and password.';
    return;
  }
  if (!em || !isValidEmailFormat(email.value)) {
    errorMessage.value = 'Enter a valid email address.';
    return;
  }
  if (p.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters.';
    return;
  }
  if (!registerPasswordOk.value) {
    errorMessage.value =
      'Pick a stronger password — use at least 8 characters and mix letters, numbers, or symbols.';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const session = authSession.backendUser?.isGuest
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
    authSession.setSession(session);
    close();
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
    errorMessage.value = 'Enter a valid email address.';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  forgotMessage.value = '';
  try {
    const out = await authForgotPassword({ email: em });
    forgotMessage.value =
      out.message ||
      'If an account exists for that email, you will receive reset instructions.';
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

async function startDiscordLogin() {
  if (isMockDataMode) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (isDesktop()) {
      // Store SPA route so the deep-link return doesn't keep us on oauth-desktop-bridge.html.
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPendingDesktopOAuthReturnPath(returnPath);
      const desktopHandoffNonce = createPendingDesktopOAuthHandoffNonce();
      const startUrl = authDiscordDesktopHandoffStartUrl(desktopHandoffNonce);
      await openExternal(startUrl, { skipSafetyPrompt: true });
      return;
    }
    const { authorizeUrl } = await authDiscordLoginStart();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    if (isDesktop()) clearPendingDesktopOAuthHandoffNonce();
    console.error('[echo][discord][login-modal] start failed', {
      isDesktop: isDesktop(),
      error:
        e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
}

async function startGoogleLogin() {
  if (isMockDataMode) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (isDesktop()) {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPendingDesktopOAuthReturnPath(returnPath);
      const desktopHandoffNonce = createPendingDesktopOAuthHandoffNonce();
      const startUrl = authGoogleDesktopHandoffStartUrl(desktopHandoffNonce);
      await openExternal(startUrl, { skipSafetyPrompt: true });
      return;
    }
    const { authorizeUrl } = await authGoogleLoginStart();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    if (isDesktop()) clearPendingDesktopOAuthHandoffNonce();
    console.error('[echo][google][login-modal] start failed', {
      isDesktop: isDesktop(),
      error:
        e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    errorMessage.value = mapError(e);
  } finally {
    submitting.value = false;
  }
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
    if (isAuthLoginMfaChallenge(result)) {
      mfaToken.value = result.mfaToken;
      mfaFactor.value = 'totp';
      mfaTotpCode.value = '';
      mfaRecoveryCode.value = '';
      return;
    }
    authSession.setSession(result);
    close();
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
              <template v-if="signedInFullAccount">Account</template>
              <template v-else-if="showMfaStep"
                >Two-factor authentication</template
              >
              <template v-else-if="authSubView === 'forgot'"
                >Forgot password</template
              >
              <template v-else-if="tab === 'login'">Log in</template>
              <template v-else>Create an account</template>
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
              Preview mode: connect the full app to sign in with a saved
              account.
            </p>
            <p
              v-else-if="showAuthForms && showMfaStep && !isMockDataMode"
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              Enter the code from your authenticator app, or use a one-time
              recovery code.
            </p>
            <p
              v-else-if="
                showAuthForms && authSubView === 'forgot' && !isMockDataMode
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              Enter the email on your account. We will send a reset link if we
              find a match.
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
                Sign in with Discord, a passkey, or your Echo username and
                password.
              </template>
              <template v-else>
                Sign in with Discord or your Echo username and password.
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
              Welcome back — sign in with your Echo username or email.
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
              We’ll email you a link to verify your account.
            </p>
            <p
              v-else-if="
                showAuthForms && !authSession.isAuthenticated && isMockDataMode
              "
              class="mt-3 text-[0.9375rem] leading-relaxed text-fg-subtle"
            >
              You’re viewing Echo in preview mode. Connect the full app to
              create an account or sign in.
            </p>
            <p
              v-else-if="signedInFullAccount"
              class="auth-signed-in-hint mt-3 text-sm"
            >
              Signed in as
              <span class="font-semibold text-foreground">{{
                signedInAccountLabel
              }}</span>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-xl p-2 text-fg-subtle transition hover:bg-glass-hover hover:text-foreground"
            aria-label="Close"
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
            Account actions are turned off in preview mode so sample data stays
            local.
          </div>

          <form
            v-if="showMfaStep"
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
                Authenticator
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
                Recovery code
              </button>
            </div>
            <div v-if="mfaFactor === 'totp'">
              <label class="auth-label" for="auth-mfa-totp">6-digit code</label>
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
              <label class="auth-label" for="auth-mfa-recovery"
                >Recovery code</label
              >
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
              Continue
            </button>
            <p
              class="text-center text-[0.875rem] leading-relaxed text-fg-subtle"
            >
              <button type="button" class="auth-link-btn" @click="cancelMfa">
                Back to password
              </button>
            </p>
          </form>

          <form
            v-else-if="authSubView === 'forgot'"
            class="mt-8 space-y-5"
            @submit.prevent="submitForgot"
          >
            <div>
              <label class="auth-label" for="auth-forgot-email">Email</label>
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
              Send reset link
            </button>
            <p
              class="text-center text-[0.875rem] leading-relaxed text-fg-subtle"
            >
              <button
                type="button"
                class="auth-link-btn"
                @click="authSubView = null"
              >
                Back to log in
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
                <label class="auth-label" for="auth-email">Email</label>
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
                  >Display name
                  <span class="font-normal text-fg-subtle"
                    >(optional)</span
                  ></label
                >
                <input
                  id="auth-display"
                  v-model="displayName"
                  type="text"
                  autocomplete="nickname"
                  :disabled="isMockDataMode"
                  class="auth-input mt-2.5"
                  placeholder="How others see you"
                />
              </div>
            </div>
            <div>
              <label class="auth-label" for="auth-username">Username</label>
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
              <label class="auth-label" for="auth-password">Password</label>
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
                  <span class="text-fg-subtle">Password strength</span>
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
              Create account
            </button>

            <div class="auth-mode-switch">
              <p class="text-center text-[0.9375rem] leading-relaxed">
                <span class="text-fg-subtle">Already have an account?</span>
                <button
                  type="button"
                  class="auth-link-btn"
                  @click="tab = 'login'"
                >
                  Log in
                </button>
              </p>
              <p
                class="mt-3 text-center text-[0.8125rem] leading-snug text-fg-subtle"
              >
                By signing up, you agree to our
                <a class="auth-link-btn" :href="legalTermsHref">T.O.S</a>
                and
                <a class="auth-link-btn" :href="legalPrivacyHref"
                  >Privacy policy</a
                >
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
              aria-label="Sign-in options"
            >
              <button
                type="button"
                class="auth-sso-segmented__btn auth-sso-segmented__btn--discord"
                :disabled="submitting"
                aria-label="Continue with Discord"
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
                aria-label="Continue with Google"
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
                aria-label="Sign in with a passkey"
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
              Continue with Echo account
            </button>

            <button
              type="button"
              class="auth-create-account-btn w-full rounded-xl py-3 text-sm font-semibold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting"
              @click="tab = 'register'"
            >
              Create an account
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
                Forgot your Echo password?
              </button>
            </p>
          </div>

          <form v-else class="mt-8 space-y-5" @submit.prevent="onSubmit">
            <div>
              <label class="auth-label" for="auth-username"
                >Username or email</label
              >
              <input
                id="auth-username"
                v-model="username"
                type="text"
                name="username"
                autocomplete="username"
                :disabled="isMockDataMode"
                class="auth-input mt-2.5"
                placeholder="your_name or you@example.com"
              />
            </div>
            <div>
              <label class="auth-label" for="auth-password">Password</label>
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
              Log in
            </button>

            <button
              v-if="tab === 'login' && !isMockDataMode && ECHO_PASSKEYS_ENABLED"
              type="button"
              class="auth-submit-secondary mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="submitting"
              @pointerdown="prefetchPasskeyLoginFromForm"
              @click="submitPasskeyLogin()"
            >
              Sign in with passkey
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
                  Create an account
                </button>
                <span class="auth-login-links-sep" aria-hidden="true">/</span>
                <button
                  type="button"
                  class="auth-link-btn auth-link-btn--solo"
                  @click="authSubView = 'forgot'"
                >
                  Forgot password?
                </button>
              </div>
              <div
                v-if="loginEntryView === 'echo'"
                class="auth-login-secondary__footer flex justify-start"
              >
                <button
                  type="button"
                  class="add-server-back-btn text-sm font-semibold"
                  aria-label="Back to Discord sign-in"
                  @click="loginEntryView = 'social'"
                >
                  Back
                </button>
              </div>
            </div>
          </form>

          <p
            v-if="!isMockDataMode && !authSession.isAuthenticated"
            class="auth-support-contact mt-6 text-center text-[0.8125rem] leading-snug text-fg-subtle"
          >
            Support, legal, or other concerns:
            <a class="auth-link-btn" :href="echoPublicSupportMailtoHref">{{
              ECHO_PUBLIC_SUPPORT_EMAIL
            }}</a>
          </p>
        </template>

        <div
          v-else
          class="mt-8 rounded-xl bg-glass-2 px-5 py-4 text-sm leading-relaxed text-fg-soft"
        >
          To sign out, open
          <span class="font-semibold text-fg">Settings</span>
          from the Echo menu, then choose
          <span class="font-semibold text-fg">Log out</span>.
        </div>
      </div>
    </div>
  </div>

  <AuthAlertModal
    :model-value="showAuthErrorModal"
    :message="errorMessage"
    title="Sign-in issue"
    variant="error"
    @update:model-value="onAuthErrorModalUpdate"
  />
  <AuthAlertModal
    :model-value="showMockWarningModal"
    title="Preview mode"
    message="Account actions are turned off in preview mode so sample data stays local."
    variant="warning"
    @update:model-value="onMockWarningModalUpdate"
  />
</template>

<style scoped lang="scss">
.auth-modal-overlay {
  background: var(--vue-auto-165);
  backdrop-filter: blur(12px);
}

.auth-modal-panel {
  position: relative;
  box-sizing: border-box;
  max-height: min(720px, calc(100dvh - 2rem));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(
    165deg,
    var(--vue-auto-166) 0%,
    var(--vue-auto-167) 55%,
    var(--vue-auto-168) 100%
  );
  border: none;
  box-shadow: none;
}

.auth-modal-accent {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--vue-auto-081),
    var(--vue-auto-169),
    var(--vue-auto-170)
  );
  opacity: 0.95;
}

.auth-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vue-auto-049);
  letter-spacing: 0.01em;
}

.auth-mode-switch {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
}

/* Three separate OAuth tiles — same total width as Echo CTA (flex + gap). */
.auth-sso-segmented {
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  gap: 0.5rem;
  border: none;
  background: transparent;
}

.auth-sso-segmented__btn {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--vue-auto-001);
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.auth-sso-segmented__btn--discord {
  background-color: var(--auth-sso-discord-cell-bg);

  &:hover:not(:disabled) {
    background-color: var(--auth-sso-discord-cell-bg-hover);
  }
}

.auth-sso-segmented__btn--google {
  background-color: var(--auth-sso-google-cell-bg);

  &:hover:not(:disabled) {
    background-color: var(--auth-sso-google-cell-bg-hover);
  }
}

.auth-sso-segmented__btn--passkey {
  background-color: var(--auth-sso-passkey-cell-bg);

  &:hover:not(:disabled) {
    background-color: var(--auth-sso-passkey-cell-bg-hover);
  }
}

.auth-sso-discord {
  color: var(--oauth-discord-mark);
}

.auth-sso-segmented__btn--discord .auth-sso-discord {
  color: var(--auth-sso-discord-on-cell-fg);
}

.auth-sso-google-mark {
  display: block;
}

.auth-sso-passkey {
  color: var(--oauth-passkey-mark);
}

.auth-create-account-btn {
  color: var(--accent-contrast-fg);
  background: var(--set-success-grad);
  box-shadow: 0 2px 12px var(--vue-auto-181);

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
}

.auth-continue-guest-btn {
  border: 1px solid var(--vue-auto-001);
  background: var(--vue-auto-048);
  color: var(--vue-auto-049);

  &:hover:not(:disabled) {
    background: var(--vue-auto-045);
    color: var(--vue-auto-044);
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

.auth-login-links-sep {
  font-weight: 500;
  color: var(--vue-auto-073);
  user-select: none;
}

.auth-create-account-text {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: inherit;
  font-weight: 600;
  color: var(--vue-auto-178);
  cursor: pointer;
  text-decoration: none;
  border-radius: 4px;
  transition:
    color 0.15s ease,
    filter 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--vue-auto-084);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

/* Match AddServerModal create/join footer Back control */
.add-server-back-btn {
  color: var(--vue-auto-028);
  background: none;
  border: none;
  padding: 0.25rem 0;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--text);
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.auth-signed-in-hint {
  color: rgba(167, 243, 208, 0.9);
}

.auth-alert-error {
  background: rgba(244, 63, 94, 0.14);
  color: rgba(255, 228, 230, 0.95);
}

.auth-alert-success {
  background: rgba(16, 185, 129, 0.14);
  color: rgba(209, 250, 229, 0.95);
}

.auth-alert-warning {
  background: rgba(245, 158, 11, 0.1);
  color: rgba(255, 251, 235, 0.9);
}

.auth-strength-weak {
  color: rgba(254, 205, 211, 0.9);
}

.auth-strength-fair {
  color: rgba(253, 230, 138, 0.9);
}

.auth-strength-good {
  color: rgba(167, 243, 208, 0.9);
}

.auth-strength-strong {
  color: rgba(209, 250, 229, 1);
}

.auth-submit-secondary {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
}

:global([data-theme='light']) {
  .auth-signed-in-hint {
    color: rgb(22, 101, 52);
  }

  .auth-alert-error {
    background: rgba(220, 38, 38, 0.1);
    color: rgb(153, 27, 27);
  }

  .auth-alert-success {
    background: rgba(22, 163, 74, 0.1);
    color: rgb(22, 101, 52);
  }

  .auth-alert-warning {
    background: rgba(217, 119, 6, 0.08);
    color: rgb(146, 64, 14);
  }

  .auth-strength-weak {
    color: rgb(190, 18, 60);
  }

  .auth-strength-fair {
    color: rgb(180, 83, 9);
  }

  .auth-strength-good {
    color: rgb(21, 128, 61);
  }

  .auth-strength-strong {
    color: rgb(22, 101, 52);
  }

  .auth-submit-secondary {
    border-color: var(--border);
    background: rgba(0, 0, 0, 0.04);
    color: var(--text);

    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.08);
    }
  }
}

.auth-link-btn--solo {
  margin-left: 0;
}

.auth-link-btn {
  margin-left: 0.35rem;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: inherit;
  font-weight: 600;
  color: var(--vue-auto-171);
  cursor: pointer;
  text-decoration: none;
  border-radius: 4px;
  transition: color 0.15s ease;

  &:hover {
    color: var(--vue-auto-172);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

.auth-input {
  display: block;
  width: 100%;
  border-radius: 12px;
  border: none;
  background: var(--vue-auto-046);
  padding: 0.8rem 1.05rem;
  font-size: 0.9375rem;
  color: var(--vue-auto-006);
  outline: none;
  transition: box-shadow 0.18s ease;

  &::placeholder {
    color: var(--vue-auto-073);
  }

  &:focus {
    box-shadow: 0 0 0 2px var(--vue-auto-174);
  }
}

.auth-strength__track {
  height: 6px;
  border-radius: 999px;
  background: var(--vue-auto-001);
  overflow: hidden;
}

.auth-strength__fill--weak {
  background: linear-gradient(90deg, var(--vue-auto-055), var(--vue-auto-082));
}
.auth-strength__fill--fair {
  background: linear-gradient(90deg, var(--vue-auto-083), var(--vue-auto-175));
}
.auth-strength__fill--good {
  background: linear-gradient(90deg, var(--vue-auto-176), var(--vue-auto-177));
}
.auth-strength__fill--strong {
  background: linear-gradient(90deg, var(--vue-auto-178), var(--vue-auto-084));
}

.auth-submit {
  background: linear-gradient(
    180deg,
    var(--vue-auto-179) 0%,
    var(--vue-auto-180) 100%
  );
  box-shadow: 0 4px 16px var(--vue-auto-181);

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:active:not(:disabled) {
    transform: translateY(0.5px);
  }
}

@keyframes auth-social-rise-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes auth-sso-ambient-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 0 transparent);
  }

  50% {
    filter: drop-shadow(
      0 0 26px color-mix(in srgb, var(--accent) 16%, transparent)
    );
  }
}

.auth-social-stack > .auth-sso-segmented {
  animation:
    auth-social-rise-in 0.52s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both,
    auth-sso-ambient-glow 9s ease-in-out 0.58s infinite;
}

.auth-social-stack > div[role='alert'] {
  animation: auth-social-rise-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
}

.auth-social-stack > button.auth-submit,
.auth-social-stack > button.auth-create-account-btn,
.auth-social-stack > button.auth-continue-guest-btn {
  animation: auth-social-rise-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.22s ease,
    background-color 0.2s ease,
    box-shadow 0.22s ease,
    border-color 0.2s ease,
    color 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

.auth-social-stack > button.auth-submit {
  animation-delay: 0.14s;
}

.auth-social-stack > button.auth-create-account-btn {
  animation-delay: 0.2s;
}

.auth-social-stack > button.auth-continue-guest-btn {
  animation-delay: 0.26s;
}

.auth-social-stack .auth-sso-segmented__btn {
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-social-stack > .auth-sso-segmented {
    animation: none;
    filter: none;
  }

  .auth-social-stack > div[role='alert'],
  .auth-social-stack > button.auth-submit,
  .auth-social-stack > button.auth-create-account-btn,
  .auth-social-stack > button.auth-continue-guest-btn {
    animation: none;
  }

  .auth-social-stack > button.auth-submit,
  .auth-social-stack > button.auth-create-account-btn,
  .auth-social-stack > button.auth-continue-guest-btn,
  .auth-social-stack .auth-sso-segmented__btn {
    transition-duration: 0.05s;

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      transform: none;
    }
  }
}
</style>
