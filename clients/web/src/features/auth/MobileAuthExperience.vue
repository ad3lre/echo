<script setup lang="ts">
/**
 * Mobile-native, page-based auth experience.
 *
 * Replaces the desktop modal+welcome-gate pattern on narrow viewports / iOS:
 * welcome → login → register → forgot are sub-views with slide transitions
 * rather than a stack of modals. The "platform passkey" CTA is labelled
 * Face ID / Touch ID / Passkey depending on what the device exposes via
 * WebAuthn `isUserVerifyingPlatformAuthenticatorAvailable` plus a
 * conservative iOS device-shape heuristic.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import {
  AuthApiError,
  authDiscordLoginStart,
  authForgotPassword,
  authGoogleLoginStart,
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
import {
  ECHO_PUBLIC_SUPPORT_EMAIL,
  echoPublicSupportMailtoHref,
} from '@/config/echoPublicSupportContact';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  normalizeEmail,
} from '@/features/auth/accountValidation';
import LegalDocsModal from '@/components/LegalDocsModal.vue';
import AuthAlertModal from '@/features/auth/components/AuthAlertModal.vue';
import PasskeyHelpModal from '@/features/auth/PasskeyHelpModal.vue';

const props = withDefaults(
  defineProps<{
    /** Disable forms (preview mode). */
    isMockDataMode?: boolean;
  }>(),
  { isMockDataMode: false },
);

const emit = defineEmits<{ authenticated: [] }>();

const authSession = useAuthSessionStore();

type View =
  | 'welcome'
  | 'login'
  | 'register'
  | 'forgot'
  | 'mfa'
  | 'email-verify'
  | 'email-ip';
const view = ref<View>('welcome');
const direction = ref<'forward' | 'back'>('forward');

function push(target: Exclude<View, 'welcome'>) {
  direction.value = 'forward';
  errorMessage.value = '';
  view.value = target;
}

function pop(target: View = 'welcome') {
  direction.value = 'back';
  errorMessage.value = '';
  view.value = target;
}

// ── Passwordless (passkey) availability ─────────────────────────────────────

// In the Tauri iOS app the WKWebView origin (tauri://localhost) does not match
// the WebAuthn RP ID (chat-echo.com), so startAuthentication always fails. The
// native Swift overlay (EchoNativeAuthBridge) handles passkeys directly via
// ASAuthorizationController — so the web passkey flow only applies off-Tauri.
const passkeyAvailable = computed(
  () =>
    ECHO_PASSKEYS_ENABLED &&
    !props.isMockDataMode &&
    getPasskeyWebCeremonyBlockReason('login') === null,
);

// Passwordless is surfaced as an auto-popup modal rather than an inline button:
// when a passkey is usable we pop the modal on load (and warm the discoverable-
// credential options so the ceremony stays inside the user activation).
const passkeyModalOpen = ref(false);

function openPasskeyModal(): void {
  if (!passkeyAvailable.value) return;
  passkeyModalOpen.value = true;
  void prefetchPasskeyLoginOptions(passkeyLoginIdentFromRaw(''));
}

onMounted(() => {
  // Surface any OAuth error left by a system-browser handoff round-trip so the
  // user sees it on first paint, not after they re-try silently.
  let hadOauthError = false;
  try {
    const g = sessionStorage.getItem('echo_google_oauth_error')?.trim();
    if (g) {
      sessionStorage.removeItem('echo_google_oauth_error');
      errorMessage.value = messageForGoogleOAuthError(g);
      hadOauthError = true;
    } else {
      const d = sessionStorage.getItem('echo_discord_oauth_error')?.trim();
      if (d) {
        sessionStorage.removeItem('echo_discord_oauth_error');
        errorMessage.value = messageForDiscordOAuthError(d);
        hadOauthError = true;
      }
    }
  } catch {
    /* ignore */
  }
  // Auto-open the passkey modal on every load, unless an OAuth error needs the
  // screen first (don't stack two modals).
  if (!hadOauthError) openPasskeyModal();
});

// ── Form state ──────────────────────────────────────────────────────────────

const submitting = ref(false);
const errorMessage = ref('');
const username = ref('');
const password = ref('');
const email = ref('');
const displayName = ref('');
const forgotEmail = ref('');
const forgotMessage = ref('');

const mfaToken = ref<string | null>(null);
const mfaFactor = ref<'totp' | 'recovery'>('totp');
const mfaTotpCode = ref('');
const mfaRecoveryCode = ref('');
const emailGateToken = ref<string | null>(null);
const emailGateMasked = ref('');
const emailIpCode = ref('');

const legalModalOpen = ref(false);
const legalModalTab = ref<'terms' | 'privacy'>('terms');

const passwordStrength = computed(() =>
  computePasswordStrength(password.value),
);
const strengthBarClass = computed(() => {
  const p = passwordStrength.value.fillPct;
  if (p >= 82) return 'strength-fill--strong';
  if (p >= 58) return 'strength-fill--good';
  if (p >= 36) return 'strength-fill--fair';
  return 'strength-fill--weak';
});

watch(view, () => {
  errorMessage.value = '';
});

const showAuthErrorModal = computed(() => {
  const msg = errorMessage.value.trim();
  if (!msg) return false;
  if (view.value === 'welcome' && submitting.value) return false;
  return true;
});

function onAuthErrorModalUpdate(open: boolean) {
  if (!open) errorMessage.value = '';
}

// ── Error mapping ───────────────────────────────────────────────────────────

function mapError(err: unknown): string {
  if (err instanceof Error && err.message === 'ACCOUNTS_DISABLED_PREVIEW') {
    return 'Sign-in isn’t available while Echo is in preview mode.';
  }
  if (err instanceof AuthApiError) {
    const c = err.body.code;
    if (c === 'INVALID_MFA_CODE' || c === 'INVALID_EMAIL_IP_CODE')
      return 'That code doesn’t match. Try again.';
    if (c === 'INVALID_MFA_TOKEN' || c === 'INVALID_LOGIN_TOKEN')
      return 'The sign-in step expired. Try logging in again.';
    if (c === 'EMAIL_VERIFICATION_REQUIRED')
      return 'Verify your email to unlock this account. Check your inbox for a link.';
    if (c === 'VERIFICATION_EMAIL_COOLDOWN' || c === 'LOGIN_EMAIL_OTP_COOLDOWN')
      return 'Please wait a moment before requesting another email.';
    if (c === 'INVALID_CREDENTIALS')
      return 'That username or password doesn’t match our records.';
    if (c === 'USERNAME_TAKEN')
      return 'That username is already taken. Try another.';
    if (c === 'EMAIL_IN_USE')
      return 'That email is already registered. Try logging in instead.';
    if (c === 'INVALID_EMAIL') return 'Please enter a valid email address.';
    if (c === 'CHALLENGE_EXPIRED')
      return 'That sign-in step expired. Try again.';
    if (c === 'VERIFICATION_FAILED') return 'Verification failed. Try again.';
    return translateApiErrorBody(err.body);
  }
  if (err instanceof Error) return err.message;
  return echoT('common.somethingWentWrong');
}

function setAuthError(message: string): void {
  errorMessage.value = message;
}

// ── Auth flows ──────────────────────────────────────────────────────────────

/**
 * Runs the passkey sign-in ceremony for the auto-popup modal. Returns null on
 * success (PasskeyHelpModal then closes itself), or an error string the modal
 * shows inline. MFA challenges advance to the in-page MFA view and close it.
 */
async function passkeyModalSignIn(raw: string): Promise<string | null> {
  const blocked = getPasskeyWebCeremonyBlockReason('login');
  if (blocked) return blocked;
  try {
    const ident = passkeyLoginIdentFromRaw(raw);
    const { credential, challengeId } =
      await runPasskeyAuthenticationCeremony(ident);
    const result = await authPasskeyLoginVerify({
      challengeId,
      credential: credential as unknown as Record<string, unknown>,
    });
    await handleLoginResult(result);
    return null;
  } catch (e) {
    void prefetchPasskeyLoginOptions(passkeyLoginIdentFromRaw(raw));
    return mapPasskeyCeremonyError(e, 'login');
  }
}

async function handleLoginResult(result: AuthLoginResult): Promise<void> {
  if (isAuthLoginEmailVerificationChallenge(result)) {
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
    forgotMessage.value = '';
    push('email-verify');
    return;
  }
  if (isAuthLoginEmailIpChallenge(result)) {
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
    emailIpCode.value = '';
    push('email-ip');
    return;
  }
  if (isAuthLoginMfaChallenge(result)) {
    mfaToken.value = result.mfaToken;
    mfaFactor.value = 'totp';
    mfaTotpCode.value = '';
    mfaRecoveryCode.value = '';
    push('mfa');
    return;
  }
  authSession.setSession(result);
  emit('authenticated');
}

async function startOauthRedirect(
  start: () => Promise<{ authorizeUrl: string }>,
): Promise<void> {
  if (props.isMockDataMode) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const { authorizeUrl } = await start();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

function startDiscord(): Promise<void> {
  return startOauthRedirect(authDiscordLoginStart);
}

function startGoogle(): Promise<void> {
  return startOauthRedirect(authGoogleLoginStart);
}

async function submitLogin(): Promise<void> {
  if (props.isMockDataMode) {
    setAuthError(mapError(new Error('ACCOUNTS_DISABLED_PREVIEW')));
    return;
  }
  const u = username.value.trim();
  const p = password.value;
  if (!u || !p) {
    setAuthError('Enter your username or email and password.');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLogin({ username: u, password: p });
    await handleLoginResult(result);
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function submitMfa(): Promise<void> {
  const token = mfaToken.value?.trim() ?? '';
  if (!token) {
    setAuthError('Sign-in expired. Try logging in again.');
    return;
  }
  const useTotp = mfaFactor.value === 'totp';
  const code = mfaTotpCode.value.trim();
  const recoveryCode = mfaRecoveryCode.value.trim();
  if (useTotp && !/^\d{6}$/.test(code)) {
    setAuthError('Enter the 6-digit code from your authenticator app.');
    return;
  }
  if (!useTotp && !recoveryCode) {
    setAuthError('Enter a recovery code.');
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
    emit('authenticated');
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function submitRegister(): Promise<void> {
  if (props.isMockDataMode) {
    setAuthError(mapError(new Error('ACCOUNTS_DISABLED_PREVIEW')));
    return;
  }
  const u = username.value.trim();
  const p = password.value;
  const em = normalizeEmail(email.value);
  const d = displayName.value.trim();
  if (!u || !p) {
    setAuthError('Choose a username and password.');
    return;
  }
  if (!em || !isValidEmailFormat(email.value)) {
    setAuthError('Enter a valid email address.');
    return;
  }
  if (p.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    setAuthError(
      `Password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`,
    );
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
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function resendEmailVerification(): Promise<void> {
  const token = emailGateToken.value?.trim() ?? '';
  if (!token) {
    setAuthError('Sign-in expired. Try logging in again.');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    await authLoginResendVerification({ loginToken: token });
    forgotMessage.value = 'Verification email sent. Check your inbox.';
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function submitEmailIpCode(): Promise<void> {
  const token = emailGateToken.value?.trim() ?? '';
  const code = emailIpCode.value.trim();
  if (!token) {
    setAuthError('Sign-in expired. Try logging in again.');
    return;
  }
  if (!/^\d{4,8}$/.test(code)) {
    setAuthError('Enter the code from your email.');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLoginEmailIpCode({ loginToken: token, code });
    await handleLoginResult(result);
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function resendEmailIpCode(): Promise<void> {
  const token = emailGateToken.value?.trim() ?? '';
  if (!token) {
    setAuthError('Sign-in expired. Try logging in again.');
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    const result = await authLoginEmailIpResend({ loginToken: token });
    emailGateToken.value = result.loginToken;
    emailGateMasked.value = result.maskedEmail;
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function submitForgot(): Promise<void> {
  const em = normalizeEmail(forgotEmail.value);
  if (!em || !isValidEmailFormat(forgotEmail.value)) {
    setAuthError('Enter a valid email address.');
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
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

function openLegalModal(tabId: 'terms' | 'privacy') {
  legalModalTab.value = tabId;
  legalModalOpen.value = true;
}
</script>

<template>
  <div class="mobile-auth" role="main" aria-label="Sign in to Echo">
    <!-- Soft branded background: blurred Echo glyph + radial gradient stack -->
    <div class="mobile-auth__bg" aria-hidden="true">
      <img
        :src="icons.echoRounded"
        alt=""
        class="mobile-auth__bg-logo"
        loading="lazy"
        decoding="async"
      />
      <div class="mobile-auth__bg-tint" />
      <div class="mobile-auth__bg-shadow" />
    </div>

    <transition :name="`mauth-${direction}`" mode="out-in">
      <!-- ── WELCOME ───────────────────────────────────────────────────── -->
      <section
        v-if="view === 'welcome'"
        key="welcome"
        class="mobile-auth__page mobile-auth__page--welcome"
      >
        <div class="mobile-auth__hero">
          <h1 class="mobile-auth__title">Welcome back</h1>
          <p class="mobile-auth__subtitle">
            <span>to</span>
            <img
              :src="icons.echoRounded"
              alt=""
              class="mobile-auth__subtitle-logo"
              loading="lazy"
              decoding="async"
            />
            <span>Echo</span>
          </p>
        </div>

        <div class="mobile-auth__center">
          <!-- Passwordless sign-in is offered through an auto-popup modal
               (PasskeyHelpModal) rather than an inline button — see onMounted. -->

          <!-- Smaller-but-special OAuth chips, stacked vertically -->
          <div
            class="mobile-auth__chips"
            role="group"
            aria-label="Other sign-in options"
          >
            <button
              v-if="GOOGLE_SSO_SIGNIN_UI_ENABLED"
              type="button"
              class="mobile-auth__chip mobile-auth__chip--google"
              :disabled="submitting"
              aria-label="Continue with Google"
              @click="startGoogle"
            >
              <svg
                class="mobile-auth__chip-icon"
                viewBox="0 0 48 48"
                aria-hidden="true"
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
              </svg>
              <span class="mobile-auth__chip-text">Continue with Google</span>
            </button>
            <button
              type="button"
              class="mobile-auth__chip mobile-auth__chip--discord"
              :disabled="submitting"
              aria-label="Continue with Discord"
              @click="startDiscord"
            >
              <svg
                class="mobile-auth__chip-icon mobile-auth__chip-icon--discord"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                />
              </svg>
              <span class="mobile-auth__chip-text">Continue with Discord</span>
            </button>
          </div>

          <button
            type="button"
            class="mobile-auth__primary mobile-auth__primary--echo"
            :disabled="submitting"
            @click="push('login')"
          >
            <img
              :src="icons.echoRounded"
              alt=""
              class="mobile-auth__primary-logo"
              loading="lazy"
              decoding="async"
            />
            <span>Sign in with Echo</span>
          </button>

          <button
            type="button"
            class="mobile-auth__ghost"
            :disabled="submitting"
            @click="push('register')"
          >
            Create an account
          </button>
        </div>

        <footer class="mobile-auth__footer">
          <p class="mobile-auth__legal">
            Continuing means you accept our
            <button
              type="button"
              class="mobile-auth__legal-link"
              @click="openLegalModal('terms')"
            >
              T.O.S
            </button>
            and
            <button
              type="button"
              class="mobile-auth__legal-link"
              @click="openLegalModal('privacy')"
            >
              Privacy policy
            </button>
            .
          </p>
          <p class="mobile-auth__support">
            Support
            <a
              class="mobile-auth__support-link"
              :href="echoPublicSupportMailtoHref"
              >{{ ECHO_PUBLIC_SUPPORT_EMAIL }}</a
            >
          </p>
        </footer>
      </section>

      <!-- ── LOGIN ─────────────────────────────────────────────────────── -->
      <section
        v-else-if="view === 'login'"
        key="login"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="pop()"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Log in</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>

        <form class="mobile-auth__form" @submit.prevent="submitLogin">
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Username or email</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="mobile-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="mobile-auth__input"
              placeholder="••••••••"
              :disabled="isMockDataMode"
            />
          </label>
          <div class="mobile-auth__row-end">
            <button
              type="button"
              class="mobile-auth__inline-link"
              @click="
                forgotEmail = email || username;
                push('forgot');
              "
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting || isMockDataMode"
          >
            {{ submitting ? 'Signing in…' : 'Log in' }}
          </button>

          <p class="mobile-auth__center-text">
            <span class="mobile-auth__muted">New to Echo?</span>
            <button
              type="button"
              class="mobile-auth__inline-link"
              @click="push('register')"
            >
              Create an account
            </button>
          </p>
        </form>
      </section>

      <!-- ── REGISTER ──────────────────────────────────────────────────── -->
      <section
        v-else-if="view === 'register'"
        key="register"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="pop()"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Create account</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>

        <form class="mobile-auth__form" @submit.prevent="submitRegister">
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Email</span>
            <input
              v-model="email"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="mobile-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Username</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="mobile-auth__input"
              placeholder="your_handle"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">
              Display name
              <span class="mobile-auth__muted">(optional)</span>
            </span>
            <input
              v-model="displayName"
              type="text"
              autocomplete="nickname"
              class="mobile-auth__input"
              placeholder="How others see you"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="mobile-auth__input"
              placeholder="At least 8 characters"
              :disabled="isMockDataMode"
            />
            <div v-if="password.length > 0" class="mobile-auth__strength">
              <div class="mobile-auth__strength-track">
                <div
                  class="mobile-auth__strength-fill"
                  :class="strengthBarClass"
                  :style="{ width: `${passwordStrength.fillPct}%` }"
                />
              </div>
              <div class="mobile-auth__strength-row">
                <span class="mobile-auth__muted">Password strength</span>
                <span>{{ passwordStrength.label }}</span>
              </div>
            </div>
          </label>

          <button
            type="submit"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting || isMockDataMode"
          >
            {{ submitting ? 'Creating account…' : 'Create account' }}
          </button>

          <p class="mobile-auth__center-text">
            <span class="mobile-auth__muted">Already have one?</span>
            <button
              type="button"
              class="mobile-auth__inline-link"
              @click="pop('welcome')"
            >
              Sign in
            </button>
          </p>
          <p class="mobile-auth__legal">
            By signing up you agree to our
            <button
              type="button"
              class="mobile-auth__legal-link"
              @click="openLegalModal('terms')"
            >
              T.O.S
            </button>
            and
            <button
              type="button"
              class="mobile-auth__legal-link"
              @click="openLegalModal('privacy')"
            >
              Privacy policy
            </button>
            .
          </p>
        </form>
      </section>

      <!-- ── FORGOT PASSWORD ───────────────────────────────────────────── -->
      <section
        v-else-if="view === 'forgot'"
        key="forgot"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="pop('login')"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Forgot password</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>
        <form class="mobile-auth__form" @submit.prevent="submitForgot">
          <p class="mobile-auth__forgot-blurb">
            Enter the email on your account. We will send a reset link if we
            find a match.
          </p>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Email</span>
            <input
              v-model="forgotEmail"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="mobile-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <p v-if="forgotMessage" class="mobile-auth__success" role="status">
            {{ forgotMessage }}
          </p>
          <button
            type="submit"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting || isMockDataMode"
          >
            Send reset link
          </button>
        </form>
      </section>

      <!-- ── EMAIL VERIFY LOCK ─────────────────────────────────────────── -->
      <section
        v-else-if="view === 'email-verify'"
        key="email-verify"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="pop('login')"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Verify email</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>
        <div class="mobile-auth__form">
          <p class="mobile-auth__forgot-blurb">
            Your account is locked until you verify
            <strong v-if="emailGateMasked">{{ emailGateMasked }}</strong
            ><template v-else>your email</template>. Open the link we sent, then
            sign in again.
          </p>
          <p v-if="forgotMessage" class="mobile-auth__success" role="status">
            {{ forgotMessage }}
          </p>
          <button
            type="button"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting"
            @click="resendEmailVerification"
          >
            Resend verification email
          </button>
        </div>
      </section>

      <!-- ── NEW-IP EMAIL CODE ─────────────────────────────────────────── -->
      <section
        v-else-if="view === 'email-ip'"
        key="email-ip"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="pop('login')"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Confirm sign-in</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>
        <form class="mobile-auth__form" @submit.prevent="submitEmailIpCode">
          <p class="mobile-auth__forgot-blurb">
            Enter the code we sent to
            <strong v-if="emailGateMasked">{{ emailGateMasked }}</strong
            ><template v-else>your email</template>.
          </p>
          <label class="mobile-auth__field">
            <span class="mobile-auth__label">Email code</span>
            <input
              v-model="emailIpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="8"
              class="mobile-auth__input"
              placeholder="000000"
            />
          </label>
          <button
            type="submit"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting"
          >
            Continue
          </button>
          <button
            type="button"
            class="mobile-auth__inline-link"
            :disabled="submitting"
            @click="resendEmailIpCode"
          >
            Resend code
          </button>
        </form>
      </section>

      <!-- ── MFA ───────────────────────────────────────────────────────── -->
      <section
        v-else
        key="mfa"
        class="mobile-auth__page mobile-auth__page--form"
      >
        <header class="mobile-auth__top-nav">
          <button
            type="button"
            class="mobile-auth__back"
            aria-label="Back"
            @click="
              mfaToken = null;
              pop('login');
            "
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 18l-6-6 6-6"
              />
            </svg>
          </button>
          <h1 class="mobile-auth__top-title">Two-factor</h1>
          <span
            class="mobile-auth__back mobile-auth__back--ghost"
            aria-hidden="true"
          />
        </header>
        <form class="mobile-auth__form" @submit.prevent="submitMfa">
          <div class="mobile-auth__seg" role="group" aria-label="MFA factor">
            <button
              type="button"
              class="mobile-auth__seg-btn"
              :class="{ 'is-active': mfaFactor === 'totp' }"
              @click="mfaFactor = 'totp'"
            >
              Authenticator
            </button>
            <button
              type="button"
              class="mobile-auth__seg-btn"
              :class="{ 'is-active': mfaFactor === 'recovery' }"
              @click="mfaFactor = 'recovery'"
            >
              Recovery code
            </button>
          </div>
          <label v-if="mfaFactor === 'totp'" class="mobile-auth__field">
            <span class="mobile-auth__label">6-digit code</span>
            <input
              v-model="mfaTotpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="8"
              class="mobile-auth__input"
              placeholder="000000"
            />
          </label>
          <label v-else class="mobile-auth__field">
            <span class="mobile-auth__label">Recovery code</span>
            <input
              v-model="mfaRecoveryCode"
              type="text"
              autocomplete="off"
              class="mobile-auth__input"
              placeholder="XXXX-XXXX-XXXX"
            />
          </label>
          <button
            type="submit"
            class="mobile-auth__primary mobile-auth__primary--filled"
            :disabled="submitting"
          >
            Continue
          </button>
        </form>
      </section>
    </transition>

    <AuthAlertModal
      :model-value="showAuthErrorModal"
      :message="errorMessage"
      title="Sign-in issue"
      variant="error"
      @update:model-value="onAuthErrorModalUpdate"
    />

    <LegalDocsModal v-model="legalModalOpen" :initial-tab="legalModalTab" />

    <PasskeyHelpModal
      v-model="passkeyModalOpen"
      :on-sign-in="passkeyModalSignIn"
    />
  </div>
</template>

<style scoped lang="scss" src="./styles/MobileAuthExperience.scss"></style>
