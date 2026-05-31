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
  authDiscordDesktopHandoffStartUrl,
  authDiscordLoginStart,
  authForgotPassword,
  authGoogleDesktopHandoffStartUrl,
  authGoogleLoginStart,
  authLogin,
  authLoginMfa,
  authPasskeyLoginOptions,
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
  isDesktop,
  openExternal,
  startOAuthFlow,
} from '@/platform/desktopBridge';
import { iosNativeHaptic } from '@/platform/iosNativeFeedback';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import {
  ECHO_PUBLIC_SUPPORT_EMAIL,
  echoPublicSupportMailtoHref,
} from '@/config/echoPublicSupportContact';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  normalizeEmail,
} from '@/utils/accountValidation';
import LegalDocsModal from '@/components/LegalDocsModal.vue';
import AuthAlertModal from '@/components/auth/AuthAlertModal.vue';

const props = withDefaults(
  defineProps<{
    /** Disable forms (preview mode). */
    isMockDataMode?: boolean;
  }>(),
  { isMockDataMode: false },
);

const emit = defineEmits<{ authenticated: [] }>();

const authSession = useAuthSessionStore();

type View = 'welcome' | 'login' | 'register' | 'forgot' | 'mfa';
const view = ref<View>('welcome');
const direction = ref<'forward' | 'back'>('forward');

function push(target: Exclude<View, 'welcome'>) {
  iosNativeHaptic('selection');
  direction.value = 'forward';
  view.value = target;
}

function pop(target: View = 'welcome') {
  iosNativeHaptic('selection');
  direction.value = 'back';
  view.value = target;
}

// ── Platform / biometric detection ──────────────────────────────────────────

type BiometricKind = 'faceId' | 'touchId' | 'passkey' | 'none';
const biometric = ref<BiometricKind>(
  ECHO_PASSKEYS_ENABLED ? 'passkey' : 'none',
);

function detectIosBiometric(): 'faceId' | 'touchId' | 'none' {
  if (typeof window === 'undefined') return 'none';
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/.test(ua);
  if (!isIos) return 'none';
  // Heuristic: notch/Face-ID iPhones and modern iPads have screen >=800pt on
  // their longest edge. Older SE/8 iPhones top out at 736pt → Touch ID.
  const longestEdge = Math.max(window.screen.width, window.screen.height);
  return longestEdge >= 800 ? 'faceId' : 'touchId';
}

async function detectBiometric(): Promise<BiometricKind> {
  if (!ECHO_PASSKEYS_ENABLED) return 'none';
  if (
    typeof window === 'undefined' ||
    typeof window.PublicKeyCredential === 'undefined' ||
    !(
      'isUserVerifyingPlatformAuthenticatorAvailable' in
      window.PublicKeyCredential
    )
  ) {
    return 'passkey';
  }
  let hasPlatformAuth: boolean;
  try {
    hasPlatformAuth =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    hasPlatformAuth = false;
  }
  if (!hasPlatformAuth) return 'passkey';
  const ios = detectIosBiometric();
  if (ios !== 'none') return ios;
  // Non-iOS platform authenticator (Mac Touch ID, Android, Windows Hello).
  // Best generic label is "Passkey" — covers all WebAuthn flows uniformly.
  const ua = navigator.userAgent || '';
  if (/Macintosh|Mac OS X/.test(ua)) return 'touchId';
  return 'passkey';
}

onMounted(() => {
  void detectBiometric().then((b) => {
    biometric.value = b;
  });
  // Surface any OAuth error left by a system-browser handoff round-trip so
  // the user sees it on the first paint, not after they re-try silently.
  try {
    const g = sessionStorage.getItem('echo_google_oauth_error')?.trim();
    if (g) {
      sessionStorage.removeItem('echo_google_oauth_error');
      errorMessage.value = messageForGoogleOAuthError(g);
      return;
    }
    const d = sessionStorage.getItem('echo_discord_oauth_error')?.trim();
    if (d) {
      sessionStorage.removeItem('echo_discord_oauth_error');
      errorMessage.value = messageForDiscordOAuthError(d);
    }
  } catch {
    /* ignore */
  }
});

const biometricLabel = computed(() => {
  switch (biometric.value) {
    case 'faceId':
      return 'Sign in with Face ID';
    case 'touchId':
      return 'Sign in with Touch ID';
    case 'passkey':
      return 'Sign in with Passkey';
    default:
      return '';
  }
});

const biometricVerb = computed(() => {
  // Used as the smaller "Use Face ID" link inside the email form.
  switch (biometric.value) {
    case 'faceId':
      return 'Use Face ID';
    case 'touchId':
      return 'Use Touch ID';
    case 'passkey':
      return 'Use Passkey';
    default:
      return '';
  }
});

// In the Tauri iOS app the WKWebView origin (tauri://localhost) does not match
// the WebAuthn RP ID (chat-echo.com), so startAuthentication always fails.
// The native Swift overlay (EchoNativeAuthBridge) handles passkeys directly via
// ASAuthorizationController — hide the web passkey CTA when running in Tauri.
const showPasskeyCta = computed(
  () => ECHO_PASSKEYS_ENABLED && !props.isMockDataMode && !isDesktop(),
);

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
    if (c === 'INVALID_MFA_CODE') return 'That code doesn’t match. Try again.';
    if (c === 'INVALID_MFA_TOKEN')
      return 'The sign-in step expired. Try logging in again.';
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
  iosNativeHaptic('error');
}

function signalAuthSuccess(): void {
  iosNativeHaptic('success');
}

// ── Auth flows ──────────────────────────────────────────────────────────────

async function runPasskeyLogin(): Promise<void> {
  if (props.isMockDataMode || !ECHO_PASSKEYS_ENABLED) return;
  iosNativeHaptic('medium');
  submitting.value = true;
  errorMessage.value = '';
  try {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const raw = username.value.trim();
    const ident: { username?: string; email?: string } = {};
    if (raw) {
      if (raw.includes('@')) ident.email = raw;
      else ident.username = raw;
    }
    const { options, challengeId } = await authPasskeyLoginOptions(ident);
    const credential = await startAuthentication({
      optionsJSON: options as any,
    });
    const result = await authPasskeyLoginVerify({
      challengeId,
      credential: credential as unknown as Record<string, unknown>,
    });
    if (isAuthLoginMfaChallenge(result)) {
      mfaToken.value = result.mfaToken;
      mfaFactor.value = 'totp';
      mfaTotpCode.value = '';
      mfaRecoveryCode.value = '';
      push('mfa');
      return;
    }
    authSession.setSession(result);
    signalAuthSuccess();
    emit('authenticated');
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function startDiscord(): Promise<void> {
  if (props.isMockDataMode) return;
  iosNativeHaptic('light');
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (isDesktop()) {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPendingDesktopOAuthReturnPath(returnPath);
      const nonce = createPendingDesktopOAuthHandoffNonce();
      const startUrl = authDiscordDesktopHandoffStartUrl(nonce);
      await openExternal(startUrl, { skipSafetyPrompt: true });
      return;
    }
    const { authorizeUrl } = await authDiscordLoginStart();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    if (isDesktop()) clearPendingDesktopOAuthHandoffNonce();
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

async function startGoogle(): Promise<void> {
  if (props.isMockDataMode) return;
  iosNativeHaptic('light');
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (isDesktop()) {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPendingDesktopOAuthReturnPath(returnPath);
      const nonce = createPendingDesktopOAuthHandoffNonce();
      const startUrl = authGoogleDesktopHandoffStartUrl(nonce);
      await openExternal(startUrl, { skipSafetyPrompt: true });
      return;
    }
    const { authorizeUrl } = await authGoogleLoginStart();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    if (isDesktop()) clearPendingDesktopOAuthHandoffNonce();
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
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
    if (isAuthLoginMfaChallenge(result)) {
      mfaToken.value = result.mfaToken;
      mfaFactor.value = 'totp';
      mfaTotpCode.value = '';
      mfaRecoveryCode.value = '';
      push('mfa');
      return;
    }
    authSession.setSession(result);
    signalAuthSuccess();
    emit('authenticated');
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
    signalAuthSuccess();
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
    signalAuthSuccess();
    emit('authenticated');
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
    iosNativeHaptic('success');
  } catch (e) {
    setAuthError(mapError(e));
  } finally {
    submitting.value = false;
  }
}

function openLegalModal(tabId: 'terms' | 'privacy') {
  iosNativeHaptic('selection');
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
          <!-- Biometric / passkey hero CTA — only when device exposes a platform authenticator -->
          <button
            v-if="showPasskeyCta"
            type="button"
            class="mobile-auth__biometric"
            :disabled="submitting"
            :aria-label="biometricLabel"
            @click="runPasskeyLogin"
          >
            <span class="mobile-auth__biometric-glyph" aria-hidden="true">
              <!-- Face ID glyph -->
              <svg
                v-if="biometric === 'faceId'"
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 9.5V7a2 2 0 0 1 2-2h2.5" />
                <path d="M18.5 5H21a2 2 0 0 1 2 2v2.5" />
                <path d="M23 18.5V21a2 2 0 0 1-2 2h-2.5" />
                <path d="M9.5 23H7a2 2 0 0 1-2-2v-2.5" />
                <path d="M10 12v2" />
                <path d="M18 12v2" />
                <path d="M14 11v4.5a1.5 1.5 0 0 0 1.5 1.5h.7" />
                <path d="M10 19.2c1.2 1.1 2.6 1.6 4 1.6s2.8-.5 4-1.6" />
              </svg>
              <!-- Generic passkey glyph -->
              <svg
                v-else-if="biometric === 'passkey'"
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10.8 15.2a5.1 5.1 0 1 1 3.1 3.1" />
                <path d="M13.2 18.8 6.5 25.5" />
                <path d="M8.9 23.1 7.3 21.5" />
                <path d="M11.3 20.7 9.7 19.1" />
                <circle cx="16.5" cy="11.5" r="1.25" />
              </svg>
              <!-- Touch ID / fingerprint glyph -->
              <svg
                v-else
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 4c-3.4 0-6.3 1.9-7.7 4.7" />
                <path d="M5.5 13.7c0-4.7 3.8-8.6 8.5-8.6 2 0 3.9.7 5.4 1.9" />
                <path d="M14 9c-2.6 0-4.7 2.1-4.7 4.7v3.4c0 .6.2 1.1.5 1.6" />
                <path d="M18.7 13.7c0-1.5-.7-2.9-1.9-3.8" />
                <path d="M14 13.4v3.6c0 1.3 1 2.4 2.4 2.4" />
                <path d="M9.2 22c-1-1.3-1.7-2.9-2-4.6" />
                <path d="M19.5 21.8c1.4-1.8 2.2-4 2.2-6.5" />
                <path d="M14 17v2" />
                <path d="M11.6 23.5c1.6.7 3.4.7 5 0" />
              </svg>
            </span>
            <span class="mobile-auth__biometric-text">{{
              biometricLabel
            }}</span>
          </button>

          <div class="mobile-auth__divider" aria-hidden="true">
            <span class="mobile-auth__divider-line" />
            <span class="mobile-auth__divider-text">or</span>
            <span class="mobile-auth__divider-line" />
          </div>

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

          <button
            v-if="showPasskeyCta"
            type="button"
            class="mobile-auth__outline"
            :disabled="submitting"
            @click="runPasskeyLogin"
          >
            {{ biometricVerb }}
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
  </div>
</template>

<style scoped lang="scss">
.mobile-auth {
  position: relative;
  isolation: isolate;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-height: 100dvh;
  /**
   * Subtle nested gradient (works in both light and dark themes via mix).
   * The hero glow + logo are layered above this.
   */
  background:
    radial-gradient(
      120% 75% at 50% 0%,
      color-mix(in srgb, var(--accent) 22%, var(--bg)) 0%,
      var(--bg) 55%
    ),
    var(--bg);
  overflow: hidden;
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.mobile-auth__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.mobile-auth__bg-logo {
  position: absolute;
  top: 45%;
  left: 50%;
  width: clamp(34rem, 172vw, 74rem);
  max-width: none;
  height: auto;
  transform: translate(-50%, -50%) rotate(-7deg);
  opacity: 0.2;
  filter: blur(20px) saturate(1.24);
  mix-blend-mode: screen;
}

.mobile-auth__bg-tint {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at 50% 8%,
      color-mix(in srgb, var(--accent) 38%, transparent) 0%,
      transparent 55%
    ),
    radial-gradient(
      circle at 100% 100%,
      color-mix(in srgb, #4c1d95 32%, transparent) 0%,
      transparent 60%
    );
  opacity: 0.7;
}

.mobile-auth__bg-shadow {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg) 8%, transparent) 0%,
    color-mix(in srgb, var(--bg) 42%, transparent) 48%,
    color-mix(in srgb, var(--bg) 92%, transparent) 92%,
    var(--bg) 100%
  );
}

.mobile-auth__page {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: min(100%, 27rem);
  min-height: 0;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 1.5rem;
}

.mobile-auth__page--welcome {
  justify-content: center;
  gap: 1.25rem;
}

.mobile-auth__page--form {
  justify-content: flex-start;
  gap: 0;
}

/* ── Brand head ─────────────────────────────────────────────────────────── */

/* ── Hero ───────────────────────────────────────────────────────────────── */

.mobile-auth__hero {
  text-align: center;
}

.mobile-auth__title {
  margin: 0;
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
  color: var(--text);
  text-shadow: 0 6px 36px color-mix(in srgb, var(--bg) 55%, transparent);
}

.mobile-auth__subtitle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  margin: 0.5rem 0 0 0;
  font-size: 1.05rem;
  font-weight: 500;
  color: color-mix(in srgb, var(--text) 64%, transparent);
}

.mobile-auth__subtitle-logo {
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 0.42rem;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 36%, transparent);
}

/* ── Centre stack ───────────────────────────────────────────────────────── */

.mobile-auth__center {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
}

/* Biometric hero CTA — the big purple central button */
.mobile-auth__biometric {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 4.25rem;
  padding: 1.05rem 1.4rem;
  border-radius: 1.35rem;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 96%, white 4%) 0%,
    var(--accent) 100%
  );
  color: var(--accent-contrast-fg);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow:
    0 12px 38px color-mix(in srgb, var(--accent) 38%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 26%, transparent);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease,
    box-shadow 0.18s ease;

  &:active:not(:disabled) {
    transform: translateY(1px) scale(0.995);
    filter: brightness(0.96);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.mobile-auth__biometric-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  color: var(--accent-contrast-fg);
}

.mobile-auth__biometric-glyph svg {
  width: 100%;
  height: 100%;
}

.mobile-auth__biometric-text {
  font-variant-numeric: tabular-nums;
}

/* OR divider */
.mobile-auth__divider {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.1rem 0;
}

.mobile-auth__divider-line {
  flex: 1 1 auto;
  height: 1px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
}

.mobile-auth__divider-text {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text) 48%, transparent);
}

/* OAuth chips */
.mobile-auth__chips {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.mobile-auth__chip {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  min-height: 3.1rem;
  padding: 0.7rem 1.1rem;
  border-radius: 1rem;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--surface) 55%, var(--bg));
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
  backdrop-filter: blur(14px);

  &:active:not(:disabled) {
    transform: scale(0.99);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.mobile-auth__chip--discord {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, #5865f2 34%, white 4%) 0%,
      color-mix(in srgb, #5865f2 18%, transparent) 56%,
      color-mix(in srgb, #2b2149 54%, transparent) 100%
    ),
    color-mix(in srgb, #5865f2 18%, transparent);
  color: color-mix(in srgb, white 92%, #5865f2);
  box-shadow:
    0 12px 30px color-mix(in srgb, #5865f2 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
    inset 0 -16px 34px color-mix(in srgb, black 18%, transparent);
}

.mobile-auth__chip--google {
  background:
    linear-gradient(
      135deg,
      white 0%,
      color-mix(in srgb, white 94%, #fbbc05 6%) 42%,
      color-mix(in srgb, white 90%, #4285f4 10%) 100%
    ),
    color-mix(in srgb, white 94%, var(--bg) 6%);
  color: #202124;
  box-shadow:
    0 12px 28px color-mix(in srgb, black 20%, transparent),
    inset 0 1px 0 white,
    inset 0 -14px 30px color-mix(in srgb, #dfe4ea 42%, transparent);
}

.mobile-auth__chip-icon {
  flex-shrink: 0;
  width: 1.4rem;
  height: 1.4rem;
}

.mobile-auth__chip-icon--discord {
  color: #5865f2;
}

.mobile-auth__chip-text {
  flex: 1 1 auto;
  text-align: left;
}

/* Primary + ghost actions */
.mobile-auth__primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 3.1rem;
  margin-top: 0.35rem;
  padding: 0.85rem 1.2rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 75%, var(--bg));
  color: var(--text);
  font-size: 0.98rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;

  &:active:not(:disabled) {
    transform: scale(0.99);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.mobile-auth__primary--echo {
  border-color: transparent;
  background: color-mix(in srgb, var(--surface) 82%, var(--accent) 10%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent);
}

.mobile-auth__primary-logo {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 0.38rem;
}

.mobile-auth__primary--filled {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent);
  color: var(--accent-contrast-fg);
  box-shadow: 0 6px 22px color-mix(in srgb, var(--accent) 35%, transparent);

  &:active:not(:disabled) {
    filter: brightness(0.96);
  }
}

.mobile-auth__ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.65rem 1rem;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--text) 76%, transparent);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;

  &:active:not(:disabled) {
    color: var(--text);
  }
}

.mobile-auth__outline {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 2.9rem;
  margin-top: 0.2rem;
  padding: 0.65rem 1rem;
  border-radius: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

/* Footer */

.mobile-auth__footer {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding-top: 0.25rem;
}

.mobile-auth__legal,
.mobile-auth__support {
  margin: 0;
  text-align: center;
  font-size: 0.75rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text) 52%, transparent);
}

.mobile-auth__legal-link,
.mobile-auth__support-link,
.mobile-auth__inline-link {
  border: none;
  background: none;
  padding: 0 0.15rem;
  font: inherit;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── Form pages ─────────────────────────────────────────────────────────── */

.mobile-auth__top-nav {
  display: grid;
  grid-template-columns: 2.5rem 1fr 2.5rem;
  align-items: center;
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.mobile-auth__top-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0;
  color: var(--text);
}

.mobile-auth__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 1.25rem;
  border: none;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  color: var(--text);
  cursor: pointer;
  backdrop-filter: blur(8px);

  svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  &--ghost {
    background: transparent;
    pointer-events: none;
  }
}

.mobile-auth__form {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 0.95rem;
  min-height: 0;
  margin-top: 0;
  padding-block: 0.75rem 1rem;
}

.mobile-auth__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mobile-auth__label {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.005em;
  color: color-mix(in srgb, var(--text) 70%, transparent);
}

.mobile-auth__input {
  width: 100%;
  min-height: 3.05rem;
  padding: 0.75rem 1rem;
  border-radius: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, var(--bg));
  color: var(--text);
  font-size: 1rem;
  letter-spacing: 0;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &::placeholder {
    color: color-mix(in srgb, var(--text) 38%, transparent);
  }

  &:focus {
    border-color: color-mix(in srgb, var(--accent) 65%, transparent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  &:disabled {
    opacity: 0.55;
  }
}

.mobile-auth__row-end {
  display: flex;
  justify-content: flex-end;
}

.mobile-auth__center-text {
  text-align: center;
  font-size: 0.92rem;
  color: var(--text);
  margin: 0.25rem 0 0;
}

.mobile-auth__muted {
  color: color-mix(in srgb, var(--text) 56%, transparent);
  font-weight: 400;
  margin-right: 0.3rem;
}

.mobile-auth__forgot-blurb {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text) 66%, transparent);
}

/* ── Success ────────────────────────────────────────────────────────────── */

.mobile-auth__success {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, #10b981 18%, transparent);
  color: color-mix(in srgb, white 95%, #10b981);
  font-size: 0.875rem;
}

/* ── Strength meter ─────────────────────────────────────────────────────── */

.mobile-auth__strength {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.mobile-auth__strength-track {
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}

.mobile-auth__strength-fill {
  height: 100%;
  border-radius: 999px;
  transition:
    width 0.28s ease,
    background 0.28s ease;
}

.strength-fill--weak {
  background: linear-gradient(90deg, #f43f5e, #fb7185);
}
.strength-fill--fair {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}
.strength-fill--good {
  background: linear-gradient(90deg, #10b981, #34d399);
}
.strength-fill--strong {
  background: linear-gradient(90deg, #10b981, #14b8a6);
}

.mobile-auth__strength-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--text) 60%, transparent);
}

/* ── Segmented (MFA factor switcher) ────────────────────────────────────── */

.mobile-auth__seg {
  display: flex;
  gap: 0.3rem;
  padding: 0.25rem;
  border-radius: 0.95rem;
  background: color-mix(in srgb, var(--surface) 65%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}

.mobile-auth__seg-btn {
  flex: 1 1 0;
  padding: 0.55rem 0.8rem;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 0.7rem;
  color: color-mix(in srgb, var(--text) 64%, transparent);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;

  &.is-active {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--text);
  }
}

/* ── Page transitions (forward/back slide) ─────────────────────────────── */

.mauth-forward-enter-active,
.mauth-forward-leave-active,
.mauth-back-enter-active,
.mauth-back-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.32, 0.72, 0.27, 1),
    opacity 0.22s ease;
}

.mauth-forward-enter-from {
  transform: translateX(24px);
  opacity: 0;
}

.mauth-forward-leave-to {
  transform: translateX(-12px);
  opacity: 0;
}

.mauth-back-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}

.mauth-back-leave-to {
  transform: translateX(12px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mauth-forward-enter-active,
  .mauth-forward-leave-active,
  .mauth-back-enter-active,
  .mauth-back-leave-active {
    transition-duration: 0.05s;
  }

  .mauth-forward-enter-from,
  .mauth-forward-leave-to,
  .mauth-back-enter-from,
  .mauth-back-leave-to {
    transform: none;
  }
}

@media (max-width: 374px), (max-height: 720px) {
  .mobile-auth__page {
    padding-inline: 1.25rem;
  }

  .mobile-auth__title {
    font-size: 2.55rem;
  }
}
</style>
