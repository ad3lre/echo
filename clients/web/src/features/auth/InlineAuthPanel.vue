<script setup lang="ts">
/**
 * Desktop inline auth panel — the in-place, panel-flip replacement for the
 * LoginRegisterModal on the WelcomeBackExploreGate right rail. Welcome slide is
 * deliberately minimal (Login with Echo / Create an account); the OAuth options
 * live one slide deeper, on the login view. Auth success flows through the
 * session store, which re-renders the gate, so this component emits nothing.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { GOOGLE_SSO_SIGNIN_UI_ENABLED } from '@/features/google/googleSsoUiEnabled';
import LegalDocsModal from '@/components/LegalDocsModal.vue';
import PasskeyHelpModal from '@/features/auth/PasskeyHelpModal.vue';
import {
  useInlineAuthFlow,
  type InlineAuthView,
} from '@/features/auth/useInlineAuthFlow';

const props = withDefaults(
  defineProps<{
    isMockDataMode?: boolean;
    initialView?: InlineAuthView;
  }>(),
  { isMockDataMode: false, initialView: 'welcome' },
);

const flow = useInlineAuthFlow({
  isMockDataMode: () => props.isMockDataMode,
  initialView: props.initialView,
});
const {
  view,
  direction,
  submitting,
  errorMessage,
  username,
  password,
  email,
  displayName,
  forgotEmail,
  forgotMessage,
  mfaFactor,
  mfaTotpCode,
  mfaRecoveryCode,
  emailGateMasked,
  emailIpCode,
  passkeyAvailable,
  passwordStrength,
  strengthBarClass,
  push,
  pop,
  readReturnedOauthError,
  armConditionalPasskey,
  stopConditionalPasskey,
  signInWithPasskey,
  startDiscord,
  startGoogle,
  submitLogin,
  submitMfa,
  submitRegister,
  submitForgot,
  resendEmailVerification,
  submitEmailIpCode,
  resendEmailIpCode,
} = flow;

const legalModalOpen = ref(false);
const legalModalTab = ref<'terms' | 'privacy'>('terms');
const passkeyModalOpen = ref(false);

function openLegalModal(tabId: 'terms' | 'privacy') {
  legalModalTab.value = tabId;
  legalModalOpen.value = true;
}

// Arm passkey autofill only while the login slide is mounted; cancel the
// pending ceremony whenever we leave it (or unmount) so it never lingers.
watch(
  view,
  (next) => {
    if (next === 'login') {
      void armConditionalPasskey();
    } else {
      stopConditionalPasskey();
    }
  },
  { immediate: true },
);

onMounted(() => {
  readReturnedOauthError();
});

onBeforeUnmount(() => {
  stopConditionalPasskey();
});
</script>

<template>
  <div class="inline-auth">
    <transition :name="`iauth-${direction}`" mode="out-in">
      <!-- ── WELCOME ──────────────────────────────────────────────────── -->
      <div v-if="view === 'welcome'" key="welcome" class="inline-auth__view">
        <div class="inline-auth__stack">
          <button
            type="button"
            class="inline-auth__echo-cta"
            @click="push('login')"
          >
            <img
              :src="icons.echoRounded"
              alt=""
              class="inline-auth__echo-cta-glyph"
              aria-hidden="true"
            />
            <span>Login with Echo</span>
            <img
              :src="icons.echoRounded"
              alt=""
              class="inline-auth__echo-cta-accent"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="inline-auth__btn inline-auth__btn--create"
            @click="push('register')"
          >
            Create an account
          </button>
          <p class="inline-auth__legal">
            Continuing means you accept our
            <button
              type="button"
              class="inline-auth__link"
              @click="openLegalModal('terms')"
            >
              T.O.S
            </button>
            and
            <button
              type="button"
              class="inline-auth__link"
              @click="openLegalModal('privacy')"
            >
              Privacy policy
            </button>
            .
          </p>
        </div>
      </div>

      <!-- ── LOGIN ────────────────────────────────────────────────────── -->
      <div v-else-if="view === 'login'" key="login" class="inline-auth__view">
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Log in</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>

        <div class="inline-auth__sso" role="group" aria-label="Quick sign-in">
          <button
            type="button"
            class="inline-auth__pill inline-auth__pill--discord"
            :disabled="submitting || isMockDataMode"
            aria-label="Continue with Discord"
            @click="startDiscord"
          >
            <svg
              class="h-6 w-6 shrink-0 text-[var(--accent-contrast-fg)]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
              />
            </svg>
            <span class="inline-auth__pill-label">Discord</span>
          </button>
          <button
            v-if="GOOGLE_SSO_SIGNIN_UI_ENABLED"
            type="button"
            class="inline-auth__pill inline-auth__pill--google"
            :disabled="submitting || isMockDataMode"
            aria-label="Continue with Google"
            @click="startGoogle"
          >
            <svg
              class="h-6 w-6 shrink-0"
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
            <span class="inline-auth__pill-label">Google</span>
          </button>
        </div>

        <div class="inline-auth__divider" aria-hidden="true">
          <span class="inline-auth__divider-line" />
          <span class="inline-auth__divider-text">or</span>
          <span class="inline-auth__divider-line" />
        </div>

        <form class="inline-auth__form" @submit.prevent="submitLogin">
          <label class="inline-auth__field">
            <span class="inline-auth__label">Username or email</span>
            <input
              v-model="username"
              type="text"
              name="username"
              autocomplete="username webauthn"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="inline-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="inline-auth__field">
            <span class="inline-auth__label">Password</span>
            <input
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              class="inline-auth__input"
              placeholder="••••••••"
              :disabled="isMockDataMode"
            />
          </label>
          <div class="inline-auth__row-end">
            <button
              type="button"
              class="inline-auth__link"
              @click="
                forgotEmail = email || username;
                push('forgot');
              "
            >
              Forgot password?
            </button>
          </div>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="submit"
            class="inline-auth__btn inline-auth__btn--primary"
            :disabled="submitting || isMockDataMode"
          >
            {{ submitting ? 'Signing in…' : 'Log in' }}
          </button>
          <div class="inline-auth__login-foot">
            <p class="inline-auth__center-text">
              <span class="inline-auth__muted">New to Echo?</span>
              <button
                type="button"
                class="inline-auth__link"
                @click="push('register')"
              >
                Create an account
              </button>
            </p>
            <!-- Edge-case fallback: passkeys autofill can't surface (e.g. one
                 stored on another device). Conditional mediation handles the
                 common case silently via the username field above. -->
            <button
              v-if="passkeyAvailable"
              type="button"
              class="inline-auth__passkey-help"
              aria-label="Sign in with a passkey"
              title="Sign in with a passkey"
              @click="passkeyModalOpen = true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
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
        </form>
      </div>

      <!-- ── REGISTER ─────────────────────────────────────────────────── -->
      <div
        v-else-if="view === 'register'"
        key="register"
        class="inline-auth__view"
      >
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Create account</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>
        <form class="inline-auth__form" @submit.prevent="submitRegister">
          <label class="inline-auth__field">
            <span class="inline-auth__label">Email</span>
            <input
              v-model="email"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="inline-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="inline-auth__field">
            <span class="inline-auth__label">Username</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="inline-auth__input"
              placeholder="your_handle"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="inline-auth__field">
            <span class="inline-auth__label">
              Display name <span class="inline-auth__muted">(optional)</span>
            </span>
            <input
              v-model="displayName"
              type="text"
              autocomplete="nickname"
              class="inline-auth__input"
              placeholder="How others see you"
              :disabled="isMockDataMode"
            />
          </label>
          <label class="inline-auth__field">
            <span class="inline-auth__label">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="inline-auth__input"
              placeholder="At least 8 characters"
              :disabled="isMockDataMode"
            />
            <div v-if="password.length > 0" class="inline-auth__strength">
              <div class="inline-auth__strength-track">
                <div
                  class="inline-auth__strength-fill"
                  :class="strengthBarClass"
                  :style="{ width: `${passwordStrength.fillPct}%` }"
                />
              </div>
              <div class="inline-auth__strength-row">
                <span class="inline-auth__muted">Password strength</span>
                <span>{{ passwordStrength.label }}</span>
              </div>
            </div>
          </label>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="submit"
            class="inline-auth__btn inline-auth__btn--create"
            :disabled="submitting || isMockDataMode"
          >
            {{ submitting ? 'Creating account…' : 'Create account' }}
          </button>
          <p class="inline-auth__center-text">
            <span class="inline-auth__muted">Already have one?</span>
            <button
              type="button"
              class="inline-auth__link"
              @click="pop('login')"
            >
              Sign in
            </button>
          </p>
        </form>
      </div>

      <!-- ── FORGOT ───────────────────────────────────────────────────── -->
      <div v-else-if="view === 'forgot'" key="forgot" class="inline-auth__view">
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Forgot password</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>
        <form class="inline-auth__form" @submit.prevent="submitForgot">
          <p class="inline-auth__blurb">
            Enter the email on your account. We will send a reset link if we
            find a match.
          </p>
          <label class="inline-auth__field">
            <span class="inline-auth__label">Email</span>
            <input
              v-model="forgotEmail"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="inline-auth__input"
              placeholder="you@example.com"
              :disabled="isMockDataMode"
            />
          </label>
          <p v-if="forgotMessage" class="inline-auth__success" role="status">
            {{ forgotMessage }}
          </p>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="submit"
            class="inline-auth__btn inline-auth__btn--primary"
            :disabled="submitting || isMockDataMode"
          >
            Send reset link
          </button>
        </form>
      </div>

      <!-- ── Email verify lock ────────────────────────────────────────── -->
      <div
        v-else-if="view === 'email-verify'"
        key="email-verify"
        class="inline-auth__view"
      >
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Verify email</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>
        <div class="inline-auth__form">
          <p class="inline-auth__legal">
            Your account is locked until you verify
            <strong v-if="emailGateMasked">{{ emailGateMasked }}</strong
            ><template v-else>your email</template>. Open the link we sent, then
            sign in again.
          </p>
          <p v-if="forgotMessage" class="inline-auth__legal" role="status">
            {{ forgotMessage }}
          </p>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="button"
            class="inline-auth__btn inline-auth__btn--primary"
            :disabled="submitting"
            @click="resendEmailVerification"
          >
            Resend verification email
          </button>
        </div>
      </div>

      <!-- ── New-IP email code ─────────────────────────────────────────── -->
      <div
        v-else-if="view === 'email-ip'"
        key="email-ip"
        class="inline-auth__view"
      >
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Confirm sign-in</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>
        <form class="inline-auth__form" @submit.prevent="submitEmailIpCode">
          <p class="inline-auth__legal">
            Enter the code we sent to
            <strong v-if="emailGateMasked">{{ emailGateMasked }}</strong
            ><template v-else>your email</template> to confirm this new sign-in.
          </p>
          <label class="inline-auth__field">
            <span class="inline-auth__label">Email code</span>
            <input
              v-model="emailIpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="8"
              class="inline-auth__input"
              placeholder="000000"
            />
          </label>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="submit"
            class="inline-auth__btn inline-auth__btn--primary"
            :disabled="submitting"
          >
            Continue
          </button>
          <button
            type="button"
            class="inline-auth__link"
            :disabled="submitting"
            @click="resendEmailIpCode"
          >
            Resend code
          </button>
        </form>
      </div>

      <!-- ── MFA ──────────────────────────────────────────────────────── -->
      <div v-else key="mfa" class="inline-auth__view">
        <header class="inline-auth__nav">
          <button
            type="button"
            class="inline-auth__back"
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
          <h3 class="inline-auth__nav-title">Two-factor</h3>
          <span class="inline-auth__back inline-auth__back--ghost" />
        </header>
        <form class="inline-auth__form" @submit.prevent="submitMfa">
          <div class="inline-auth__seg" role="group" aria-label="MFA factor">
            <button
              type="button"
              class="inline-auth__seg-btn"
              :class="{ 'is-active': mfaFactor === 'totp' }"
              @click="mfaFactor = 'totp'"
            >
              Authenticator
            </button>
            <button
              type="button"
              class="inline-auth__seg-btn"
              :class="{ 'is-active': mfaFactor === 'recovery' }"
              @click="mfaFactor = 'recovery'"
            >
              Recovery code
            </button>
          </div>
          <label v-if="mfaFactor === 'totp'" class="inline-auth__field">
            <span class="inline-auth__label">6-digit code</span>
            <input
              v-model="mfaTotpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="8"
              class="inline-auth__input"
              placeholder="000000"
            />
          </label>
          <label v-else class="inline-auth__field">
            <span class="inline-auth__label">Recovery code</span>
            <input
              v-model="mfaRecoveryCode"
              type="text"
              autocomplete="off"
              class="inline-auth__input"
              placeholder="XXXX-XXXX-XXXX"
            />
          </label>
          <p v-if="errorMessage" class="inline-auth__error" role="alert">
            {{ errorMessage }}
          </p>
          <button
            type="submit"
            class="inline-auth__btn inline-auth__btn--primary"
            :disabled="submitting"
          >
            Continue
          </button>
        </form>
      </div>
    </transition>

    <LegalDocsModal v-model="legalModalOpen" :initial-tab="legalModalTab" />
    <PasskeyHelpModal
      v-model="passkeyModalOpen"
      :on-sign-in="signInWithPasskey"
    />
  </div>
</template>

<style scoped lang="scss" src="./styles/InlineAuthPanel.scss"></style>
