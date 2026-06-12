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

<style scoped lang="scss">
.inline-auth {
  position: relative;
  width: 100%;
}

/* Login footer: "new to Echo?" on the left, passkey affordance bottom-right. */
.inline-auth__login-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.inline-auth__login-foot .inline-auth__center-text {
  text-align: left;
}

/* Small bottom-right passkey affordance — opens the help modal. */
.inline-auth__passkey-help {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  cursor: pointer;
  opacity: 0.75;
  transition:
    opacity 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;

  svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  &:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    transform: translateY(-1px);
  }

  &:focus-visible {
    opacity: 1;
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }
}

.inline-auth__view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.inline-auth__stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

.inline-auth__btn {
  width: 100%;
  border-radius: 9999px;
  padding: 0.85rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
}

/* Filled accent buttons (login / forgot / mfa submit) */
.inline-auth__btn--primary {
  background-color: var(--accent);
  color: var(--accent-contrast-fg);
  transition:
    background-color 0.22s ease,
    transform 0.22s ease,
    filter 0.22s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.04);
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    transform: scale(0.995);
    filter: brightness(0.94);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

/* Create-account button (success gradient) */
.inline-auth__btn--create {
  color: var(--accent-contrast-fg);
  background: var(--set-success-grad);
  transition:
    transform 0.22s ease,
    filter 0.22s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.06) saturate(1.04);
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    transform: scale(0.995);
    filter: brightness(0.94);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

/* Echo CTA: inline glyph + an oversized foreground accent peeking past the edge */
.inline-auth__echo-cta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  overflow: visible;
  border-radius: 9999px;
  padding: 0.95rem 1rem;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  background-color: var(--accent);
  color: var(--accent-contrast-fg);
  transition:
    background-color 0.22s ease,
    transform 0.22s ease,
    filter 0.22s ease,
    box-shadow 0.22s ease;

  &:hover {
    transform: translate3d(0, -1px, 0);
    filter: brightness(1.04);
    box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 28%, transparent);
  }

  &:active {
    transform: scale(0.995);
    filter: brightness(0.94);
  }
}

/* ── SSO pills ─────────────────────────────────────────────────────────── */

.inline-auth__pill {
  display: inline-flex;
  min-height: 2.875rem;
  flex: 1 1 0;
  min-width: 0;
  max-width: 8.8rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border: 1px solid transparent;
  padding: 0.36rem 0.8rem;
  cursor: pointer;
  transition:
    background-color 0.22s ease,
    border-color 0.22s ease,
    filter 0.22s ease,
    transform 0.22s ease,
    box-shadow 0.22s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &:hover:not(:disabled) {
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    transform: scale(0.99);
  }
}

.inline-auth__pill--discord {
  background: var(--auth-sso-discord-cell-bg);
  color: var(--accent-contrast-fg);
  border-color: color-mix(
    in srgb,
    var(--auth-sso-discord-cell-bg) 84%,
    var(--bg)
  );

  &:hover:not(:disabled) {
    background: var(--auth-sso-discord-cell-bg-hover);
    filter: brightness(1.03) saturate(1.02);
  }
}

.inline-auth__pill--google {
  background: color-mix(in srgb, var(--text) 92%, var(--bg));
  color: var(--bg);
  border-color: color-mix(in srgb, var(--text) 14%, var(--border));

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 96%, var(--bg));
    filter: brightness(1.025);
  }
}

:global(html[data-theme='light']) .inline-auth__pill--google {
  background: var(--surface);
  color: var(--text);
  border-color: var(--border);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 3%, var(--surface));
    filter: none;
  }
}

.inline-auth__pill-label {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.015em;
  white-space: nowrap;
}

/* Inline text links (forgot, legal, switch-view) */
.inline-auth__link {
  margin: 0 0.15rem;
  border: none;
  background: none;
  padding: 0.1rem 0.05rem;
  font: inherit;
  font-weight: 600;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.inline-auth__echo-cta-glyph {
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 0.42rem;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent);
}

.inline-auth__echo-cta-accent {
  position: absolute;
  top: 50%;
  right: -0.6rem;
  width: 3.1rem;
  height: 3.1rem;
  transform: translateY(-50%) rotate(-8deg);
  border-radius: 0.9rem;
  opacity: 0.22;
  filter: blur(0.5px) saturate(1.1);
  pointer-events: none;
}

.inline-auth__legal {
  margin: 0;
  text-align: center;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--muted);
}

/* ── Slide nav ─────────────────────────────────────────────────────────── */

.inline-auth__nav {
  display: grid;
  grid-template-columns: 2.5rem 1fr 2.5rem;
  align-items: center;
}

.inline-auth__nav-title {
  margin: 0;
  text-align: center;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}

.inline-auth__back {
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

  svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  &--ghost {
    background: transparent;
    pointer-events: none;
  }

  &:hover:not(&--ghost) {
    background: color-mix(in srgb, var(--text) 8%, var(--surface));
  }
}

/* ── SSO + divider ─────────────────────────────────────────────────────── */

.inline-auth__sso {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 0.6rem;
}

.inline-auth__divider {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.inline-auth__divider-line {
  flex: 1 1 auto;
  height: 1px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
}

.inline-auth__divider-text {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--muted);
}

/* ── Forms ─────────────────────────────────────────────────────────────── */

.inline-auth__form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: 100%;
}

.inline-auth__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.inline-auth__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--text) 70%, transparent);
}

.inline-auth__input {
  width: 100%;
  min-height: 2.9rem;
  padding: 0.7rem 1rem;
  border-radius: 0.85rem;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, var(--bg));
  color: var(--text);
  font-size: 1rem;
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

.inline-auth__row-end {
  display: flex;
  justify-content: flex-end;
  margin-top: -0.3rem;
}

.inline-auth__center-text {
  text-align: center;
  font-size: 0.9rem;
  color: var(--text);
  margin: 0;
}

.inline-auth__muted {
  color: var(--muted);
  margin-right: 0.3rem;
}

.inline-auth__blurb {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text) 66%, transparent);
}

.inline-auth__error {
  margin: 0;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--vue-auto-082) 38%, transparent);
  background: color-mix(in srgb, var(--vue-auto-082) 12%, transparent);
  color: var(--vue-auto-082);
  font-size: 0.85rem;
  line-height: 1.4;
}

.inline-auth__success {
  margin: 0;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, #10b981 18%, transparent);
  color: color-mix(in srgb, white 95%, #10b981);
  font-size: 0.85rem;
}

/* ── Strength meter ────────────────────────────────────────────────────── */

.inline-auth__strength {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

.inline-auth__strength-track {
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}

.inline-auth__strength-fill {
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

.inline-auth__strength-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--text) 60%, transparent);
}

/* ── MFA segmented ─────────────────────────────────────────────────────── */

.inline-auth__seg {
  display: flex;
  gap: 0.3rem;
  padding: 0.25rem;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--surface) 65%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}

.inline-auth__seg-btn {
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

/* ── Slide transitions ─────────────────────────────────────────────────── */

.iauth-forward-enter-active,
.iauth-forward-leave-active,
.iauth-back-enter-active,
.iauth-back-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.32, 0.72, 0.27, 1),
    opacity 0.22s ease;
}

.iauth-forward-enter-from {
  transform: translateX(28px);
  opacity: 0;
}

.iauth-forward-leave-to {
  transform: translateX(-14px);
  opacity: 0;
}

.iauth-back-enter-from {
  transform: translateX(-28px);
  opacity: 0;
}

.iauth-back-leave-to {
  transform: translateX(14px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .iauth-forward-enter-active,
  .iauth-forward-leave-active,
  .iauth-back-enter-active,
  .iauth-back-leave-active {
    transition-duration: 0.05s;
  }

  .iauth-forward-enter-from,
  .iauth-forward-leave-to,
  .iauth-back-enter-from,
  .iauth-back-leave-to {
    transform: none;
  }
}
</style>
