<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { icons } from '@/assets/icons';
import { usePlatform } from '@/platform/usePlatform';
import {
  AuthApiError,
  authDiscordDesktopHandoffStartUrl,
  authDiscordLoginStart,
  authGoogleDesktopHandoffStartUrl,
  authGoogleLoginStart,
} from '@/api/authClient';
import {
  isDesktop,
  openExternal,
  startOAuthFlow,
} from '@/platform/desktopBridge';
import {
  clearPendingDesktopOAuthHandoffNonce,
  createPendingDesktopOAuthHandoffNonce,
  setPendingDesktopOAuthReturnPath,
} from '@/platform/desktopOAuthHandoff';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import { messageForDiscordOAuthError } from '@/features/discord/discordIntegrationCopy';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { GOOGLE_SSO_SIGNIN_UI_ENABLED } from '@/features/google/googleSsoUiEnabled';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import {
  ECHO_PUBLIC_SUPPORT_EMAIL,
  echoPublicSupportMailtoHref,
} from '@/config/echoPublicSupportContact';
import LegalDocsModal from '@/components/LegalDocsModal.vue';

const props = withDefaults(
  defineProps<{
    /** Signed-in Echo user: empty public directory — show create/join instead of auth CTAs. */
    memberEmptyDirectory?: boolean;
    /** Compact shell: show a back control above the gate (same as Explore). */
    showMobileBack?: boolean;
  }>(),
  { memberEmptyDirectory: false, showMobileBack: false },
);

const welcomeTitle = computed(() =>
  props.memberEmptyDirectory ? 'Create or join a server' : 'Welcome back',
);
const welcomeSubtitle = computed(() =>
  props.memberEmptyDirectory
    ? "The public directory isn't listing any servers right now. Create one or join with an invite."
    : 'Pick up where you left off.',
);

defineEmits<{
  back: [];
  'log-in-echo': [];
  'sign-in-passkey': [];
  'create-account': [];
  'create-server': [];
  'join-server': [];
}>();

const { isMockDataMode } = usePlatform();
const oauthBusy = ref(false);
const oauthError = ref('');
const heroVisible = ref(true);
const heroRef = ref<HTMLElement | null>(null);
const gateRootRef = ref<HTMLElement | null>(null);
const isNarrowViewport = ref(false);
const legalModalOpen = ref(false);
const legalModalTab = ref<'terms' | 'privacy'>('terms');

let io: IntersectionObserver | undefined;
let onViewportResize: (() => void) | undefined;

onMounted(() => {
  readOauthReturnError();
  if (typeof window !== 'undefined') {
    const updateViewportFlag = () => {
      isNarrowViewport.value = window.innerWidth < 800;
    };
    updateViewportFlag();
    onViewportResize = updateViewportFlag;
    window.addEventListener('resize', onViewportResize, { passive: true });
  }
  // Keep the gate anchored to the auth controls on open; some environments
  // restore nested scroll positions after mount and can land on the hero-only
  // region, which looks blank at medium widths.
  void nextTick(() => {
    const root = gateRootRef.value;
    if (!root) return;
    const forceTop = () => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    };
    forceTop();
    requestAnimationFrame(forceTop);
    setTimeout(forceTop, 0);
    setTimeout(forceTop, 120);
  });
  if (!heroRef.value) return;
  io = new IntersectionObserver(
    ([entry]) => {
      heroVisible.value = entry.isIntersecting;
    },
    { threshold: 0 },
  );
  io.observe(heroRef.value);
});

onBeforeUnmount(() => {
  io?.disconnect();
  if (typeof window !== 'undefined' && onViewportResize) {
    window.removeEventListener('resize', onViewportResize);
  }
});

function mapOauthError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.body.code === 'NOT_CONFIGURED')
      return (
        err.body.message ||
        'This sign-in method isn’t available on this server.'
      );
    if (err.body.code === 'NOT_AVAILABLE')
      return (
        err.body.message || 'That isn’t available right now. Try again later.'
      );
    return translateApiErrorBody(err.body);
  }
  if (err instanceof Error) return err.message;
  return echoT('common.somethingWentWrong');
}

function readOauthReturnError() {
  try {
    const googleCode = sessionStorage
      .getItem('echo_google_oauth_error')
      ?.trim();
    if (googleCode) {
      sessionStorage.removeItem('echo_google_oauth_error');
      oauthError.value = messageForGoogleOAuthError(googleCode);
      return;
    }
    const discordCode = sessionStorage
      .getItem('echo_discord_oauth_error')
      ?.trim();
    if (discordCode) {
      sessionStorage.removeItem('echo_discord_oauth_error');
      oauthError.value = messageForDiscordOAuthError(discordCode);
    }
  } catch {
    /* ignore */
  }
}

async function onDiscordClick() {
  if (isMockDataMode) return;
  oauthBusy.value = true;
  oauthError.value = '';
  try {
    if (isDesktop()) {
      // Store SPA route so we can return to the correct page after the OAuth system-browser roundtrip.
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
    console.error('[echo][discord][welcome-gate] start failed', {
      isDesktop: isDesktop(),
      error:
        e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    oauthError.value = mapOauthError(e);
  } finally {
    oauthBusy.value = false;
  }
}

async function onGoogleClick() {
  if (isMockDataMode) return;
  oauthBusy.value = true;
  oauthError.value = '';
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
    console.error('[echo][google][welcome-gate] start failed', {
      isDesktop: isDesktop(),
      error:
        e instanceof Error ? { name: e.name, message: e.message } : String(e),
    });
    oauthError.value = mapOauthError(e);
  } finally {
    oauthBusy.value = false;
  }
}

function openLegalModal(tabId: 'terms' | 'privacy') {
  legalModalTab.value = tabId;
  legalModalOpen.value = true;
}
</script>

<template>
  <div
    ref="gateRootRef"
    class="welcome-back-explore-gate custom-scrollbar flex h-full min-h-[100dvh] w-full flex-col overflow-x-hidden overflow-y-auto bg-surface lg:min-h-0 lg:bg-[var(--echo-chat-view-bg)]"
    role="region"
    :aria-label="memberEmptyDirectory ? 'Create or join a server' : 'Sign in'"
  >
    <div v-if="showMobileBack" class="flex shrink-0 px-4 pt-3">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
        aria-label="Back"
        @click="$emit('back')"
      >
        <img
          :src="icons.arrowLeft"
          alt=""
          class="h-4 w-4 shrink-0 opacity-90 brightness-0 invert"
        />
        <span>Back</span>
      </button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row lg:min-h-0">
      <!-- Hero: full-height fluid + oversized logo (same language as Echo rail corner) -->
      <div
        v-if="!isNarrowViewport"
        ref="heroRef"
        :class="[
          'welcome-back-hero order-2 relative isolate mx-3 mt-3 min-h-[13rem] overflow-hidden rounded-2xl border border-border/80 sm:mx-6 sm:mt-6 sm:min-h-[min(44vh,26rem)] lg:order-1 lg:mx-0 lg:mt-0 lg:min-h-0 lg:flex-1 lg:rounded-none lg:border-0',
          { 'welcome-back-hero--paused': !heroVisible },
        ]"
      >
        <svg
          class="welcome-back-hero__defs pointer-events-none absolute h-0 w-0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter
              id="wb-hero-grain"
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
              color-interpolation-filters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.8"
                numOctaves="4"
                seed="41"
                result="noise"
              />
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0 0 0 0.55 0"
                result="mono"
              />
            </filter>
            <radialGradient id="wb-echo-fluid-sheen" cx="34%" cy="28%" r="70%">
              <stop offset="0%" stop-color="#D4F5FF" stop-opacity="0.38" />
              <stop offset="35%" stop-color="#7ED4FF" stop-opacity="0.2" />
              <stop offset="100%" stop-color="#7ED4FF" stop-opacity="0" />
            </radialGradient>
            <linearGradient
              id="wb-echo-fluid-blue"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stop-color="#8AE1FF" stop-opacity="0.42" />
              <stop offset="42%" stop-color="#2D77FF" stop-opacity="0.38" />
              <stop offset="100%" stop-color="#4126C8" stop-opacity="0.12" />
            </linearGradient>
            <linearGradient
              id="wb-echo-fluid-violet"
              x1="25%"
              y1="5%"
              x2="78%"
              y2="100%"
            >
              <stop offset="0%" stop-color="#7D8BFF" stop-opacity="0.14" />
              <stop offset="55%" stop-color="#4A3BFF" stop-opacity="0.28" />
              <stop offset="100%" stop-color="#1B1238" stop-opacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div
          class="welcome-back-hero__fluid pointer-events-none"
          aria-hidden="true"
        >
          <div class="welcome-back-hero__base" />
          <div class="welcome-back-hero__logo-bg">
            <img
              :src="icons.echoRounded"
              alt=""
              class="welcome-back-hero__logo-bg-img"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="welcome-back-hero__ambient" />
          <div class="welcome-back-hero__highlight" />
          <svg
            class="welcome-back-hero__liquid"
            viewBox="0 0 320 220"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <g>
              <path
                d="M-32 70C6 8 92-10 172 6c54 10 110 40 124 89 11 39-10 81-48 102-36 21-82 22-122 14C76 201 30 183 4 149-20 118-24 84-32 70Z"
                fill="url(#wb-echo-fluid-blue)"
                opacity="0.62"
              />
              <path
                d="M14 82C44 38 108 20 170 32c50 10 96 34 112 69 12 28-1 58-30 77-32 21-76 28-118 22-39-6-77-23-102-52-20-22-27-52-12-74Z"
                fill="url(#wb-echo-fluid-violet)"
                opacity="0.45"
              />
              <ellipse
                cx="108"
                cy="48"
                rx="92"
                ry="46"
                fill="url(#wb-echo-fluid-sheen)"
                opacity="0.5"
              />
              <path
                d="M-8 142c18-28 54-44 88-40 28 2 56 15 70 38 14 24 8 58-16 80-21 18-50 28-80 24-27-4-55-19-66-44-11-20-10-42 4-58Z"
                fill="#091020"
                opacity="0.48"
              />
            </g>
          </svg>
          <div class="welcome-back-hero__particles" />
          <div class="welcome-back-hero__shadow" />
        </div>

        <div
          class="welcome-back-hero__mesh pointer-events-none"
          aria-hidden="true"
        />
        <div
          class="welcome-back-hero__grain pointer-events-none"
          aria-hidden="true"
        />
        <div class="welcome-back-hero__rects" aria-hidden="true">
          <span class="welcome-back-hero__rect welcome-back-hero__rect--a" />
          <span class="welcome-back-hero__rect welcome-back-hero__rect--b" />
          <span class="welcome-back-hero__rect welcome-back-hero__rect--c" />
          <span class="welcome-back-hero__rect welcome-back-hero__rect--d" />
          <span class="welcome-back-hero__rect welcome-back-hero__rect--e" />
          <span class="welcome-back-hero__rect welcome-back-hero__rect--f" />
        </div>

        <div
          class="welcome-back-hero__scrim pointer-events-none"
          aria-hidden="true"
        />
        <div
          class="welcome-back-hero__vignette pointer-events-none"
          aria-hidden="true"
        />

        <header
          class="welcome-back-hero__head relative z-[2] flex h-full min-h-0 flex-col justify-end gap-3 px-4 pb-5 pt-10 antialiased sm:gap-5 sm:px-10 sm:pb-10 sm:pt-20 lg:justify-center lg:gap-6 lg:px-12 lg:py-12 xl:px-16"
        >
          <p class="welcome-back-hero__eyebrow">Echo</p>
          <h1
            class="welcome-back-hero__title max-w-[18ch] text-balance sm:max-w-[22ch] lg:max-w-[24ch]"
          >
            Welcome back
          </h1>
          <p
            v-if="memberEmptyDirectory"
            class="welcome-back-hero__subtitle max-w-lg text-balance ps-0.5 sm:max-w-xl lg:max-w-2xl lg:ps-1"
          >
            The public directory isn’t listing any servers right now. Create one
            or join with an invite.
          </p>
          <p
            v-else
            class="welcome-back-hero__subtitle max-w-lg text-balance ps-0.5 sm:max-w-xl lg:max-w-2xl lg:ps-1"
          >
            Pick up where you left off.
          </p>
        </header>
      </div>

      <aside
        :class="[
          'order-1 flex w-full shrink-0 flex-col justify-center border-border bg-surface px-4 py-6 antialiased sm:px-8 sm:py-12 lg:order-2 lg:w-full lg:max-w-[min(32rem,100%)] lg:border-l lg:border-t-0 lg:border-border xl:max-w-[36rem] xl:px-12',
          isNarrowViewport
            ? 'min-h-full justify-start border-l-0 py-8 sm:py-10'
            : '',
        ]"
        aria-labelledby="welcome-back-gate-heading"
      >
        <!-- Compact header shown only on narrow viewports where the hero is hidden -->
        <div
          v-if="isNarrowViewport"
          class="welcome-back-narrow-header mb-8 flex flex-col gap-2"
          aria-hidden="true"
        >
          <p class="welcome-back-narrow-header__eyebrow">Echo</p>
          <h1 class="welcome-back-narrow-header__title">
            <template v-if="memberEmptyDirectory"
              >Create or join a server</template
            >
            <template v-else>Welcome back</template>
          </h1>
          <p class="welcome-back-narrow-header__subtitle">
            <template v-if="memberEmptyDirectory">
              The public directory isn't listing any servers right now. Create
              one or join with an invite.
            </template>
            <template v-else>Pick up where you left off.</template>
          </p>
        </div>
        <h2 id="welcome-back-gate-heading" class="sr-only">
          <template v-if="memberEmptyDirectory"
            >Create or join a server</template
          >
          <template v-else> Sign in or create an account </template>
        </h2>
        <div
          v-if="memberEmptyDirectory"
          class="flex w-full flex-col gap-5 sm:mx-auto sm:max-w-xl lg:mx-0"
        >
          <button
            type="button"
            class="welcome-back-gate__primary w-full max-w-full self-center rounded-full px-4 py-3.5 text-base font-semibold leading-snug sm:w-4/5 sm:py-3"
            @click="$emit('create-server')"
          >
            Create server
          </button>
          <button
            type="button"
            class="welcome-back-gate__secondary w-full max-w-full self-center rounded-full border border-border bg-surface px-4 py-3.5 text-base font-semibold leading-snug text-foreground sm:w-4/5 sm:py-3"
            @click="$emit('join-server')"
          >
            Join with invite
          </button>
        </div>
        <div
          v-else
          class="flex w-full flex-col gap-5 sm:mx-auto sm:max-w-xl lg:mx-0"
        >
          <div
            class="flex w-full max-w-full flex-wrap items-stretch justify-center gap-2 self-center sm:w-4/5 sm:gap-3"
            role="group"
            aria-label="Quick sign-in"
          >
            <button
              type="button"
              class="welcome-back-gate__sso-pill welcome-back-gate__sso-pill--discord"
              :disabled="oauthBusy || isMockDataMode"
              aria-label="Continue with Discord"
              @click="onDiscordClick"
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
              <span class="welcome-back-gate__sso-pill-label">Discord</span>
            </button>
            <button
              v-if="GOOGLE_SSO_SIGNIN_UI_ENABLED"
              type="button"
              class="welcome-back-gate__sso-pill welcome-back-gate__sso-pill--google"
              :disabled="oauthBusy || isMockDataMode"
              aria-label="Continue with Google"
              @click="onGoogleClick"
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
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              <span class="welcome-back-gate__sso-pill-label">Google</span>
            </button>
            <button
              v-if="ECHO_PASSKEYS_ENABLED"
              type="button"
              class="welcome-back-gate__sso-pill welcome-back-gate__sso-pill--passkey"
              :disabled="oauthBusy || isMockDataMode"
              aria-label="Sign in with a passkey"
              @click="$emit('sign-in-passkey')"
            >
              <svg
                class="h-6 w-6 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span class="welcome-back-gate__sso-pill-label">Passkey</span>
            </button>
          </div>
          <p
            v-if="isMockDataMode"
            class="w-full max-w-full self-center rounded-xl border border-border bg-elevated px-3 py-2.5 text-center text-sm leading-snug text-muted sm:w-4/5"
          >
            <template v-if="ECHO_PASSKEYS_ENABLED">
              Preview mode: connect the full app to sign in with Discord or a
              passkey.
            </template>
            <template v-else>
              Preview mode: connect the full app to sign in with Discord.
            </template>
          </p>
          <p
            v-else-if="oauthError"
            class="welcome-back-gate__oauth-error w-full max-w-full self-center rounded-xl border border-border bg-elevated px-3 py-2.5 text-center text-sm leading-snug sm:w-4/5"
            role="alert"
          >
            {{ oauthError }}
          </p>
          <button
            type="button"
            class="welcome-back-gate__primary w-full max-w-full self-center rounded-full px-4 py-3.5 text-base font-semibold leading-snug sm:w-4/5 sm:py-3"
            @click="$emit('log-in-echo')"
          >
            Login with Echo
          </button>
          <button
            type="button"
            class="welcome-back-gate__create w-full max-w-full self-center rounded-full px-4 py-3.5 text-base font-semibold leading-snug sm:w-4/5 sm:py-3"
            @click="$emit('create-account')"
          >
            Create an account
          </button>
          <p
            class="w-full max-w-full self-center text-center text-xs leading-snug text-muted sm:w-4/5"
          >
            Continuing means you accept our
            <button
              type="button"
              class="welcome-back-gate__legal-link"
              @click="openLegalModal('terms')"
            >
              T.O.S
            </button>
            and
            <button
              type="button"
              class="welcome-back-gate__legal-link"
              @click="openLegalModal('privacy')"
            >
              Privacy policy
            </button>
            .
          </p>
          <p
            class="w-full max-w-full self-center text-center text-xs leading-snug text-muted sm:w-4/5"
          >
            Support, legal, or other concerns:
            <a
              class="underline decoration-muted/60 underline-offset-2 hover:text-foreground"
              :href="echoPublicSupportMailtoHref"
              >{{ ECHO_PUBLIC_SUPPORT_EMAIL }}</a
            >
          </p>
        </div>
      </aside>
    </div>
  </div>
  <LegalDocsModal v-model="legalModalOpen" :initial-tab="legalModalTab" />
</template>

<style scoped lang="scss">
.welcome-back-hero {
  contain: layout style;
}

.welcome-back-explore-gate {
  padding-bottom: max(env(safe-area-inset-bottom), 0px);
}

@media (max-width: 1023px) {
  .welcome-back-explore-gate > .flex > aside {
    position: sticky;
    top: 0;
    z-index: 3;
  }
}

@media (max-width: 799px) {
  .welcome-back-explore-gate > .flex {
    min-height: 100%;
  }

  .welcome-back-explore-gate > .flex > .welcome-back-hero {
    display: none;
  }

  .welcome-back-explore-gate > .flex > aside {
    position: static;
    z-index: auto;
    width: 100%;
    max-width: none;
    min-height: 100%;
    justify-content: flex-start;
    border-left: 0;
  }
}

.welcome-back-hero__fluid {
  position: absolute;
  inset: -12% -8% -8% -18%;
  z-index: 0;
  mask-image: radial-gradient(
    ellipse 95% 90% at 32% 38%,
    var(--vue-auto-234) 0%,
    var(--vue-auto-235) 38%,
    var(--vue-auto-236) 62%,
    transparent 100%
  );
}

.welcome-back-hero__base,
.welcome-back-hero__ambient,
.welcome-back-hero__highlight,
.welcome-back-hero__particles,
.welcome-back-hero__shadow,
.welcome-back-hero__liquid {
  position: absolute;
  inset: 0;
}

.welcome-back-hero__base {
  background:
    radial-gradient(
      circle at 22% 32%,
      var(--vue-auto-237) 0%,
      var(--vue-auto-238) 32%,
      var(--vue-auto-035) 68%
    ),
    radial-gradient(
      circle at 78% 12%,
      var(--vue-auto-239) 0%,
      var(--vue-auto-240) 55%
    ),
    linear-gradient(200deg, var(--vue-auto-241) 0%, var(--vue-auto-035) 100%);
}

.welcome-back-hero__logo-bg {
  position: absolute;
  inset: -8%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.95;
  isolation: isolate;
}

.welcome-back-hero__logo-bg-img {
  width: min(118%, 820px);
  max-width: none;
  height: auto;
  transform: scale(1.08) translateZ(0);
  filter: blur(14px) saturate(1.05);
  opacity: 0.26;
  mix-blend-mode: screen;
}

.welcome-back-hero__ambient {
  background:
    radial-gradient(
      ellipse at 30% 28%,
      var(--vue-auto-242) 0%,
      var(--vue-auto-243) 24%,
      var(--vue-auto-244) 46%,
      var(--vue-auto-035) 70%
    ),
    radial-gradient(
      ellipse at 72% 64%,
      var(--vue-auto-245) 0%,
      var(--vue-auto-035) 58%
    ),
    radial-gradient(
      ellipse at 12% 78%,
      var(--vue-auto-246) 0%,
      var(--vue-auto-247) 62%
    );
  filter: blur(28px) saturate(108%);
  opacity: 0.52;
  will-change: opacity;
  animation: wb-hero-breathe 26s ease-in-out infinite alternate;
}

.welcome-back-hero__highlight {
  inset: 4% 6%;
  background:
    radial-gradient(
      ellipse at 36% 30%,
      var(--vue-auto-248) 0%,
      var(--vue-auto-249) 22%,
      var(--vue-auto-250) 58%
    ),
    radial-gradient(
      ellipse at 70% 20%,
      var(--vue-auto-251) 0%,
      var(--vue-auto-252) 55%
    );
  mix-blend-mode: screen;
  opacity: 0.28;
}

.welcome-back-hero__liquid {
  inset: -6% -10%;
  width: calc(100% + 20%);
  height: calc(100% + 12%);
  opacity: 0.52;
  filter: blur(10px) saturate(108%);
  transform-origin: 30% 28%;
  will-change: transform;
  animation: wb-hero-drift 36s ease-in-out infinite alternate;
}

.welcome-back-hero__particles {
  background-image:
    radial-gradient(
      circle at 18% 21%,
      var(--vue-auto-253) 0 1.1px,
      var(--vue-auto-254) 1.8px,
      var(--vue-auto-255) 4.6px
    ),
    radial-gradient(
      circle at 28% 33%,
      var(--vue-auto-256) 0 1.2px,
      var(--vue-auto-257) 2px,
      var(--vue-auto-258) 4.8px
    ),
    radial-gradient(
      circle at 52% 24%,
      var(--vue-auto-259) 0 0.9px,
      var(--vue-auto-260) 1.7px,
      var(--vue-auto-261) 4.2px
    ),
    radial-gradient(
      circle at 46% 48%,
      var(--vue-auto-262) 0 1.1px,
      var(--vue-auto-263) 1.9px,
      var(--vue-auto-264) 4.5px
    );
  mix-blend-mode: screen;
  opacity: 0.18;
  will-change: transform, opacity;
  animation: wb-hero-twinkle 18s ease-in-out infinite alternate;
}

.welcome-back-hero__shadow {
  background:
    radial-gradient(
      ellipse at 24% 28%,
      var(--vue-auto-268) 0%,
      var(--vue-auto-269) 36%,
      var(--vue-auto-270) 72%,
      var(--vue-auto-271) 100%
    ),
    linear-gradient(180deg, var(--vue-auto-272) 0%, var(--vue-auto-273) 100%);
  mix-blend-mode: multiply;
  opacity: 0.72;
}

.welcome-back-hero__mesh {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image:
    linear-gradient(
      0deg,
      color-mix(in srgb, var(--border) 70%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--border) 70%, transparent) 1px,
      transparent 1px
    ),
    repeating-linear-gradient(
      -18deg,
      transparent 0,
      transparent 10px,
      color-mix(in srgb, var(--border) 28%, transparent) 10px,
      color-mix(in srgb, var(--border) 28%, transparent) 11px
    );
  background-size:
    22px 22px,
    22px 22px,
    auto;
  mix-blend-mode: multiply;
  opacity: 0.55;
  mask-image: radial-gradient(
    ellipse 92% 88% at 36% 40%,
    var(--vue-auto-006) 0%,
    color-mix(in srgb, var(--vue-auto-006) 45%, transparent) 55%,
    transparent 100%
  );
}

.welcome-back-hero__grain {
  position: absolute;
  inset: -4%;
  z-index: 1;
  filter: url(#wb-hero-grain);
  mix-blend-mode: overlay;
  opacity: 0.2;
  pointer-events: none;
}

.welcome-back-hero__rects {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.welcome-back-hero__rect {
  position: absolute;
  display: block;
  border-radius: 7px;
  border: 1px solid
    color-mix(in srgb, var(--echo-rail-corner-blue-42) 48%, transparent);
  box-shadow:
    0 0 0 1px
      color-mix(in srgb, var(--echo-rail-corner-violet-55) 22%, transparent),
    inset 0 0 56px color-mix(in srgb, var(--bg) 78%, transparent);
  opacity: 0.5;
}

.welcome-back-hero__rect--a {
  top: 7%;
  left: 5%;
  width: 24%;
  height: 19%;
  transform: rotate(-9deg);
}

.welcome-back-hero__rect--b {
  top: 12%;
  right: 8%;
  width: 17%;
  height: 31%;
  transform: rotate(7deg);
}

.welcome-back-hero__rect--c {
  bottom: 26%;
  left: 10%;
  width: 14%;
  height: 22%;
  transform: rotate(4deg);
}

.welcome-back-hero__rect--d {
  top: 38%;
  right: 18%;
  width: 28%;
  height: 12%;
  transform: rotate(-4deg);
}

.welcome-back-hero__rect--e {
  bottom: 12%;
  right: 12%;
  width: 20%;
  height: 24%;
  transform: rotate(-11deg);
}

.welcome-back-hero__rect--f {
  top: 52%;
  left: 4%;
  width: 11%;
  height: 16%;
  transform: rotate(12deg);
  opacity: 0.35;
}

.welcome-back-hero__scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg) 58%, transparent) 0%,
    color-mix(in srgb, var(--bg) 82%, transparent) 40%,
    color-mix(in srgb, var(--bg) 94%, transparent) 100%
  );
}

.welcome-back-hero__vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(
    ellipse 88% 78% at 34% 38%,
    transparent 0%,
    color-mix(in srgb, var(--bg) 62%, transparent) 72%,
    color-mix(in srgb, var(--bg) 94%, transparent) 100%
  );
  mix-blend-mode: multiply;
  opacity: 0.94;
}

/* Pause all hero animations when scrolled off-screen */
.welcome-back-hero--paused {
  .welcome-back-hero__ambient,
  .welcome-back-hero__liquid,
  .welcome-back-hero__particles {
    animation-play-state: paused;
  }
}

/* Honour prefers-reduced-motion: freeze animations and drop the blur-heavy logo overlay */
@media (prefers-reduced-motion: reduce) {
  .welcome-back-hero__ambient,
  .welcome-back-hero__liquid,
  .welcome-back-hero__particles {
    animation: none;
  }

  .welcome-back-hero__logo-bg {
    display: none;
  }

  .welcome-back-hero__grain {
    display: none;
  }

  .welcome-back-hero__mesh {
    opacity: 0.28;
  }
}

.welcome-back-hero__eyebrow {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.48em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--echo-rail-corner-blue-0) 58%, var(--muted));
  text-shadow:
    0 0 28px
      color-mix(in srgb, var(--echo-rail-corner-blue-42) 35%, transparent),
    0 1px 12px color-mix(in srgb, var(--bg) 55%, transparent);
}

.welcome-back-hero__title {
  margin: 0;
  font-size: clamp(2.75rem, 5.5vw + 1.35rem, 5.35rem);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.045em;
  background-image: linear-gradient(
    168deg,
    var(--text) 6%,
    color-mix(in srgb, var(--echo-rail-corner-sheen-0) 55%, var(--text)) 38%,
    color-mix(in srgb, var(--echo-rail-corner-blue-0) 32%, var(--text)) 72%,
    var(--text) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
  filter: drop-shadow(
    0 14px 42px color-mix(in srgb, var(--bg) 50%, transparent)
  );
}

.welcome-back-hero__subtitle {
  margin: 0;
  max-width: 36rem;
  font-size: clamp(1.08rem, 1.1vw + 0.92rem, 1.7rem);
  font-weight: 500;
  line-height: 1.42;
  letter-spacing: -0.018em;
  color: color-mix(in srgb, var(--muted) 72%, var(--echo-rail-corner-sheen-35));
  text-shadow:
    0 1px 2px color-mix(in srgb, var(--bg) 68%, transparent),
    0 10px 32px color-mix(in srgb, var(--bg) 48%, transparent);
}

@media (max-width: 639px) {
  .welcome-back-explore-gate {
    padding-bottom: max(env(safe-area-inset-bottom), 0.75rem);
  }

  .welcome-back-hero__eyebrow {
    letter-spacing: 0.32em;
  }

  .welcome-back-hero__title {
    font-size: clamp(2rem, 7.4vw + 0.9rem, 2.8rem);
    letter-spacing: -0.03em;
  }

  .welcome-back-hero__subtitle {
    font-size: 1rem;
    line-height: 1.35;
  }
}

.welcome-back-gate__sso-pill {
  display: inline-flex;
  min-height: 2.875rem;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border: 1px solid transparent;
  padding: 0.36rem 0.8rem;
  cursor: pointer;
  transform: translateZ(0);
  transition:
    background-color 0.22s ease,
    border-color 0.22s ease,
    filter 0.22s ease,
    transform 0.22s ease,
    box-shadow 0.22s ease;

  @media (min-width: 640px) {
    flex: 1 1 0;
    min-width: 0;
    max-width: 8.8rem;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

/* Match CTA width when only one SSO option is available. */
.welcome-back-gate__sso-pill:only-child {
  width: 100%;
}

@media (min-width: 640px) {
  .welcome-back-gate__sso-pill:only-child {
    max-width: none;
  }
}

.welcome-back-gate__sso-pill--discord {
  background: var(--auth-sso-discord-cell-bg);
  color: var(--accent-contrast-fg);
  border-color: color-mix(
    in srgb,
    var(--auth-sso-discord-cell-bg) 84%,
    var(--bg)
  );

  &:focus-visible {
    outline: 2px solid var(--accent-contrast-fg);
    outline-offset: 2px;
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--auth-sso-discord-cell-bg) 28%, transparent);
  }

  &:hover:not(:disabled) {
    background: var(--auth-sso-discord-cell-bg-hover);
    filter: brightness(1.03) saturate(1.02);
    transform: translate3d(0, -1px, 0);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent-contrast-fg) 32%, transparent),
      0 4px 14px
        color-mix(
          in srgb,
          var(--auth-sso-discord-cell-bg-hover) 26%,
          transparent
        );
  }

  &:active:not(:disabled) {
    filter: brightness(0.96) saturate(1.02);
    transform: translate3d(0, 0, 0) scale(0.99);
    box-shadow: none;
  }
}

.welcome-back-gate__sso-pill--google {
  background: color-mix(in srgb, var(--text) 92%, var(--bg));
  color: var(--bg);
  border-color: color-mix(in srgb, var(--text) 14%, var(--border));

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--text) 48%, var(--bg));
    outline-offset: 2px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--text) 10%, transparent);
  }

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 96%, var(--bg));
    border-color: color-mix(in srgb, var(--text) 18%, var(--border));
    filter: brightness(1.025);
    transform: translate3d(0, -1px, 0);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent);
  }

  &:active:not(:disabled) {
    background: color-mix(in srgb, var(--text) 90%, var(--bg));
    filter: brightness(0.985);
    transform: translate3d(0, 0, 0) scale(0.99);
    box-shadow: none;
  }
}

:global(html[data-theme='light']) {
  .welcome-back-hero__title {
    color: var(--text);
    background-image: none;
    -webkit-background-clip: unset;
    background-clip: unset;
    filter: none;
    text-shadow:
      0 1px 2px color-mix(in srgb, var(--bg) 22%, transparent),
      0 10px 28px color-mix(in srgb, var(--bg) 12%, transparent);
  }

  .welcome-back-hero__eyebrow {
    color: color-mix(
      in srgb,
      var(--echo-rail-corner-blue-100) 42%,
      var(--muted)
    );
    text-shadow: none;
  }

  .welcome-back-hero__mesh {
    opacity: 0.32;
    mix-blend-mode: multiply;
  }

  .welcome-back-hero__grain {
    opacity: 0.12;
    mix-blend-mode: multiply;
  }

  .welcome-back-hero__rect {
    opacity: 0.38;
    border-color: color-mix(
      in srgb,
      var(--echo-rail-corner-blue-42) 32%,
      transparent
    );
    box-shadow:
      0 0 0 1px
        color-mix(in srgb, var(--echo-rail-corner-violet-55) 12%, transparent),
      inset 0 0 40px color-mix(in srgb, var(--bg) 35%, transparent);
  }

  .welcome-back-hero__rect--f {
    opacity: 0.28;
  }

  .welcome-back-gate__sso-pill--google {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border);

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--text) 34%, var(--border));
      outline-offset: 2px;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--text) 6%, transparent);
    }

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--text) 3%, var(--surface));
      border-color: color-mix(in srgb, var(--text) 18%, var(--border));
      filter: none;
      transform: translate3d(0, -1px, 0);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 9%, transparent);
    }

    &:active:not(:disabled) {
      background: color-mix(in srgb, var(--text) 6%, var(--surface));
      filter: brightness(0.99);
      transform: translate3d(0, 0, 0) scale(0.99);
      box-shadow: none;
    }
  }
}

.welcome-back-gate__sso-pill--passkey {
  background: color-mix(in srgb, var(--accent) 42%, var(--surface));
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, var(--surface));
    outline-offset: 2px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
  }

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 56%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 68%, var(--border));
    transform: translate3d(0, -1px, 0);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent) 36%, transparent),
      0 4px 16px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  &:active:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 48%, var(--surface));
    filter: brightness(0.98);
    transform: translate3d(0, 0, 0) scale(0.99);
    box-shadow: none;
  }
}

.welcome-back-gate__sso-pill-label {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.015em;
  white-space: nowrap;
}

.welcome-back-gate__oauth-error {
  color: var(--vue-auto-082);
}

.welcome-back-gate__legal-link {
  margin: 0 0.2rem;
  border: none;
  background: none;
  padding: 0.15rem 0.1rem;
  font: inherit;
  font-weight: 600;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.welcome-back-gate__primary {
  background-color: var(--accent);
  color: var(--accent-contrast-fg);
  transform: translateZ(0);
  transition:
    background-color 0.22s ease,
    transform 0.22s ease,
    filter 0.22s ease,
    box-shadow 0.22s ease;

  &:hover {
    background-color: color-mix(
      in srgb,
      var(--accent-contrast-fg) 10%,
      var(--accent)
    );
    transform: translate3d(0, -1px, 0);
    filter: brightness(1.04);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--accent-contrast-fg) 16%, var(--accent)),
      0 5px 18px color-mix(in srgb, var(--accent) 28%, transparent);
  }

  &:active {
    transform: translate3d(0, 0, 0) scale(0.995);
    filter: brightness(0.94);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--accent) 32%, var(--accent-contrast-fg));
    outline-offset: 2px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
  }
}

.welcome-back-gate__create {
  color: var(--accent-contrast-fg);
  background: var(--set-success-grad);
  transform: translateZ(0);
  transition:
    transform 0.22s ease,
    filter 0.22s ease,
    box-shadow 0.22s ease;

  &:hover {
    filter: brightness(1.06) saturate(1.04);
    transform: translate3d(0, -1px, 0);
    box-shadow:
      0 0 0 1px
        color-mix(
          in srgb,
          var(--accent-contrast-fg) 28%,
          var(--oauth-google-green)
        ),
      0 5px 18px color-mix(in srgb, var(--oauth-google-green) 26%, transparent);
  }

  &:active {
    filter: brightness(0.94) saturate(1.02);
    transform: translate3d(0, 0, 0) scale(0.995);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid
      color-mix(
        in srgb,
        var(--oauth-google-green) 50%,
        var(--accent-contrast-fg)
      );
    outline-offset: 2px;
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--oauth-google-green) 14%, transparent);
  }
}

.welcome-back-gate__secondary {
  transform: translateZ(0);
  transition:
    background-color 0.22s ease,
    border-color 0.22s ease,
    color 0.22s ease,
    transform 0.22s ease,
    box-shadow 0.22s ease;

  &:hover {
    background: color-mix(in srgb, var(--text) 4%, var(--surface));
    border-color: color-mix(in srgb, var(--text) 22%, var(--border));
    color: var(--text);
    transform: translate3d(0, -1px, 0);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent);
  }

  &:active {
    background: color-mix(in srgb, var(--text) 7%, var(--surface));
    border-color: color-mix(in srgb, var(--text) 32%, var(--border));
    transform: translate3d(0, 0, 0) scale(0.995);
    box-shadow: none;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--text) 34%, var(--border));
    outline-offset: 2px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--text) 6%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-back-gate__sso-pill,
  .welcome-back-gate__primary,
  .welcome-back-gate__create,
  .welcome-back-gate__secondary {
    transition-duration: 0.05s;
  }

  .welcome-back-gate__sso-pill:hover:not(:disabled),
  .welcome-back-gate__sso-pill:active:not(:disabled),
  .welcome-back-gate__primary:hover,
  .welcome-back-gate__primary:active,
  .welcome-back-gate__create:hover,
  .welcome-back-gate__create:active,
  .welcome-back-gate__secondary:hover,
  .welcome-back-gate__secondary:active {
    transform: none;
  }
}

/* Older Safari / low-power WebKit fallback: keep hero readable without costly blending stacks. */
@supports (-webkit-touch-callout: none) {
  .welcome-back-hero__fluid {
    inset: 0;
    mask-image: none;
  }

  .welcome-back-hero__mesh,
  .welcome-back-hero__grain,
  .welcome-back-hero__rects,
  .welcome-back-hero__logo-bg {
    display: none;
  }

  .welcome-back-hero__ambient,
  .welcome-back-hero__liquid,
  .welcome-back-hero__particles {
    animation: none;
  }

  .welcome-back-hero__title {
    color: var(--text);
    background-image: none;
    -webkit-background-clip: unset;
    background-clip: unset;
    filter: none;
  }
}

/* Engines without color-mix support can otherwise lose contrast in gradients/overlays. */
@supports not (color: color-mix(in srgb, black, white)) {
  .welcome-back-hero__mesh,
  .welcome-back-hero__grain,
  .welcome-back-hero__rects {
    display: none;
  }

  .welcome-back-hero__title {
    color: var(--text);
    background-image: none;
    -webkit-background-clip: unset;
    background-clip: unset;
    filter: none;
  }

  .welcome-back-hero__subtitle {
    color: var(--muted);
    text-shadow: none;
  }
}

.welcome-back-narrow-header {
  padding-top: max(env(safe-area-inset-top), 0.5rem);
}

.welcome-back-narrow-header__eyebrow {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: var(--accent);
}

.welcome-back-narrow-header__title {
  margin: 0;
  font-size: clamp(1.75rem, 6vw + 0.6rem, 2.5rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.035em;
  color: var(--text);
}

.welcome-back-narrow-header__subtitle {
  margin: 0;
  margin-top: 0.25rem;
  font-size: 0.9375rem;
  font-weight: 400;
  line-height: 1.45;
  color: var(--muted);
}

@keyframes wb-hero-drift {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(6px, 4px, 0) scale(1.02);
  }
}

@keyframes wb-hero-breathe {
  0% {
    opacity: 0.44;
  }
  100% {
    opacity: 0.58;
  }
}

@keyframes wb-hero-twinkle {
  0% {
    opacity: 0.14;
    transform: translate3d(0, 0, 0);
  }
  100% {
    opacity: 0.26;
    transform: translate3d(2px, -2px, 0);
  }
}

/* Light mode: disable screen/overlay blend modes that wash out content */
:global([data-theme='light']) {
  .welcome-back-hero__logo-bg-img {
    mix-blend-mode: normal;
    opacity: 0.15;
    filter: blur(14px) saturate(1.05) brightness(0.85);
  }

  .welcome-back-hero__highlight {
    mix-blend-mode: normal;
    opacity: 0.15;
  }

  .welcome-back-hero__particles {
    mix-blend-mode: normal;
    opacity: 0.1;
  }

  .welcome-back-hero__grain {
    mix-blend-mode: normal;
    opacity: 0.1;
  }
}
</style>
