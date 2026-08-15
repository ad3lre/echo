<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import {
  AuthApiError,
  authDiscordLoginStart,
  authGoogleLoginStart,
} from '@/api/authClient';
import { startOAuthFlow } from '@/platform/desktopBridge';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import { GOOGLE_SSO_SIGNIN_UI_ENABLED } from '@/features/google/googleSsoUiEnabled';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import type { EchoInvitePreviewDto } from '@/api/echo/types';

const props = defineProps<{
  preview: EchoInvitePreviewDto | null;
  loading: boolean;
  error: string | null;
  showMobileBack?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  'log-in-echo': [];
  'sign-in-passkey': [];
  'create-account': [];
  'continue-as-guest': [];
  'persist-before-oauth': [];
}>();

const oauthBusy = ref(false);
const oauthError = ref('');

const serverName = computed(() => props.preview?.name ?? '');
const serverIcon = computed(() => props.preview?.iconUrl ?? '');
const serverBanner = computed(() => props.preview?.bannerUrl ?? '');
const serverDescription = computed(() => props.preview?.description ?? '');
const memberCount = computed(() => props.preview?.memberCount ?? 0);
const topMembers = computed(() => props.preview?.topMembers ?? []);
const requiresApplication = computed(
  () => props.preview?.requiresApplication ?? false,
);

const hasBanner = computed(() => !!serverBanner.value);

function formatMemberCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
}

function mapOauthError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.body.code === 'NOT_CONFIGURED')
      return (
        err.body.message ||
        "This sign-in method isn't available on this server."
      );
    if (err.body.code === 'NOT_AVAILABLE')
      return (
        err.body.message || "That isn't available right now. Try again later."
      );
    return translateApiErrorBody(err.body);
  }
  if (err instanceof Error) return err.message;
  return echoT('common.somethingWentWrong');
}

async function startInviteOauth(
  start: () => Promise<{ authorizeUrl: string }>,
) {
  emit('persist-before-oauth');
  oauthBusy.value = true;
  oauthError.value = '';
  try {
    const { authorizeUrl } = await start();
    startOAuthFlow(authorizeUrl);
  } catch (e) {
    oauthError.value = mapOauthError(e);
  } finally {
    oauthBusy.value = false;
  }
}

function onDiscordClick() {
  return startInviteOauth(authDiscordLoginStart);
}

function onGoogleClick() {
  return startInviteOauth(authGoogleLoginStart);
}
</script>

<template>
  <div
    class="invite-landing flex h-full min-h-[100dvh] w-full flex-col overflow-x-hidden overflow-y-auto bg-surface lg:min-h-0 lg:bg-[var(--echo-chat-view-bg)]"
    role="region"
    aria-label="Server invite"
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

    <div
      class="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-8 lg:p-12"
    >
      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center gap-4">
        <div class="invite-landing__spinner" />
        <p class="text-sm text-muted">Loading invite...</p>
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        class="flex max-w-md flex-col items-center gap-6 text-center"
      >
        <div class="invite-landing__error-icon">
          <svg
            class="h-16 w-16 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-foreground">Invalid Invite</h1>
        <p class="text-base text-muted">{{ error }}</p>
      </div>

      <!-- Invite preview -->
      <div
        v-else-if="preview"
        class="invite-landing__card relative flex w-full max-w-lg flex-col items-center overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        <!-- Banner / Header background -->
        <div
          class="invite-landing__banner relative h-36 w-full overflow-hidden sm:h-44"
        >
          <img
            v-if="hasBanner"
            :src="serverBanner"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
          <div
            v-else
            class="invite-landing__banner-fallback absolute inset-0"
          />
          <div class="invite-landing__banner-scrim absolute inset-0" />
        </div>

        <!-- Server icon (overlapping banner) -->
        <div class="relative z-10 -mt-12 flex flex-col items-center px-6">
          <div
            class="invite-landing__icon-ring flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-elevated"
          >
            <img
              v-if="serverIcon"
              :src="serverIcon"
              :alt="serverName"
              class="h-full w-full rounded-full object-cover"
            />
            <span v-else class="text-3xl font-bold text-muted">{{
              serverName.charAt(0).toUpperCase()
            }}</span>
          </div>
        </div>

        <!-- Server info -->
        <div
          class="flex w-full flex-col items-center gap-3 px-6 pb-6 pt-3 text-center"
        >
          <p class="text-sm font-medium uppercase tracking-wider text-muted">
            You've been invited to join
          </p>
          <h1
            class="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
          >
            {{ serverName }}
          </h1>
          <p
            v-if="serverDescription"
            class="max-w-sm text-sm leading-relaxed text-muted"
          >
            {{ serverDescription }}
          </p>

          <!-- Meta badges -->
          <div class="flex items-center gap-4 text-xs text-muted">
            <span v-if="memberCount" class="flex items-center gap-1.5">
              <span
                class="inline-block h-2 w-2 rounded-full bg-[var(--echo-presence-online)]"
              />
              {{ formatMemberCount(memberCount) }}
              {{ memberCount === 1 ? 'member' : 'members' }}
            </span>
            <span v-if="requiresApplication" class="flex items-center gap-1.5">
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Application required
            </span>
          </div>

          <!-- Top members -->
          <div
            v-if="topMembers.length"
            class="mt-1 flex items-center -space-x-2"
          >
            <img
              v-for="(member, i) in topMembers.slice(0, 5)"
              :key="i"
              :src="member.pfp"
              :alt="member.name"
              :title="member.name"
              class="inline-block h-7 w-7 rounded-full border-2 border-surface object-cover"
            />
            <span v-if="topMembers.length > 5" class="ml-2 text-xs text-muted">
              +{{ topMembers.length - 5 }} more
            </span>
          </div>
        </div>

        <!-- Divider -->
        <div class="w-full border-t border-border" />

        <!-- Auth section -->
        <div class="flex w-full flex-col gap-4 px-6 py-6">
          <p class="text-center text-sm font-medium text-muted">
            Sign in to accept this invite
          </p>

          <!-- OAuth pills -->
          <div
            class="flex w-full flex-wrap items-stretch justify-center gap-2"
            role="group"
            aria-label="Quick sign-in"
          >
            <button
              type="button"
              class="invite-landing__sso-pill invite-landing__sso-pill--discord"
              :disabled="oauthBusy"
              aria-label="Continue with Discord"
              @click="onDiscordClick"
            >
              <svg
                class="h-5 w-5 shrink-0 text-[var(--accent-contrast-fg)]"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                />
              </svg>
              <span class="text-sm font-semibold">Discord</span>
            </button>
            <button
              v-if="GOOGLE_SSO_SIGNIN_UI_ENABLED"
              type="button"
              class="invite-landing__sso-pill invite-landing__sso-pill--google"
              :disabled="oauthBusy"
              aria-label="Continue with Google"
              @click="onGoogleClick"
            >
              <svg
                class="h-5 w-5 shrink-0"
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
              <span class="text-sm font-semibold">Google</span>
            </button>
            <button
              v-if="ECHO_PASSKEYS_ENABLED"
              type="button"
              class="invite-landing__sso-pill invite-landing__sso-pill--passkey"
              :disabled="oauthBusy"
              aria-label="Sign in with a passkey"
              @click="$emit('sign-in-passkey')"
            >
              <svg
                class="h-5 w-5 shrink-0"
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
              <span class="text-sm font-semibold">Passkey</span>
            </button>
          </div>

          <p
            v-if="oauthError"
            class="rounded-xl border border-border bg-elevated px-3 py-2.5 text-center text-sm leading-snug text-[var(--vue-auto-082)]"
            role="alert"
          >
            {{ oauthError }}
          </p>

          <!-- Email auth buttons -->
          <button
            type="button"
            class="invite-landing__primary w-full rounded-full px-4 py-3 text-base font-semibold leading-snug"
            @click="$emit('log-in-echo')"
          >
            Log in with Echo
          </button>
          <button
            type="button"
            class="invite-landing__create w-full rounded-full px-4 py-3 text-base font-semibold leading-snug"
            @click="$emit('create-account')"
          >
            Create an account
          </button>
        </div>
      </div>

      <!-- Subtle Echo branding -->
      <p class="mt-6 text-xs text-muted/60">Powered by Echo</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.invite-landing {
  padding-bottom: max(env(safe-area-inset-bottom), 0px);
}

@media (max-width: 799px) {
  .invite-landing {
    min-height: 0;
  }
}

.invite-landing__spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: invite-spin 0.7s linear infinite;
}

@keyframes invite-spin {
  to {
    transform: rotate(360deg);
  }
}

.invite-landing__banner-fallback {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 28%, var(--bg)) 0%,
    color-mix(in srgb, var(--accent) 8%, var(--bg)) 100%
  );
}

.invite-landing__banner-scrim {
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--bg) 12%, transparent) 60%,
    color-mix(in srgb, var(--bg) 42%, transparent) 100%
  );
}

.invite-landing__card {
  transform: translateZ(0);
  transition: box-shadow 0.28s ease;
}

.invite-landing__sso-pill {
  display: inline-flex;
  min-height: 2.75rem;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border: 1px solid transparent;
  padding: 0.32rem 0.75rem;
  cursor: pointer;
  transform: translateZ(0);
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
}

.invite-landing__sso-pill--discord {
  background: var(--auth-sso-discord-cell-bg);
  color: var(--accent-contrast-fg);
  border-color: color-mix(
    in srgb,
    var(--auth-sso-discord-cell-bg) 84%,
    var(--bg)
  );

  &:hover:not(:disabled) {
    background: var(--auth-sso-discord-cell-bg-hover);
    filter: brightness(1.03);
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    filter: brightness(0.96);
    transform: translate3d(0, 0, 0) scale(0.99);
  }
}

.invite-landing__sso-pill--google {
  background: color-mix(in srgb, var(--text) 92%, var(--bg));
  color: var(--bg);
  border-color: color-mix(in srgb, var(--text) 14%, var(--border));

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 96%, var(--bg));
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    background: color-mix(in srgb, var(--text) 90%, var(--bg));
    transform: translate3d(0, 0, 0) scale(0.99);
  }
}

:global(html[data-theme='light']) {
  .invite-landing__sso-pill--google {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--text) 3%, var(--surface));
    }

    &:active:not(:disabled) {
      background: color-mix(in srgb, var(--text) 6%, var(--surface));
    }
  }
}

.invite-landing__sso-pill--passkey {
  background: color-mix(in srgb, var(--accent) 42%, var(--surface));
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 56%, var(--surface));
    transform: translate3d(0, -1px, 0);
  }

  &:active:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 48%, var(--surface));
    transform: translate3d(0, 0, 0) scale(0.99);
  }
}

.invite-landing__primary {
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
}

.invite-landing__create {
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
  }

  &:active {
    filter: brightness(0.94);
    transform: translate3d(0, 0, 0) scale(0.995);
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite-landing__sso-pill,
  .invite-landing__primary,
  .invite-landing__create {
    transition-duration: 0.05s;
  }

  .invite-landing__sso-pill:hover:not(:disabled),
  .invite-landing__sso-pill:active:not(:disabled),
  .invite-landing__primary:hover,
  .invite-landing__primary:active,
  .invite-landing__create:hover,
  .invite-landing__create:active {
    transform: none;
  }

  .invite-landing__spinner {
    animation-duration: 1.2s;
  }
}
</style>
