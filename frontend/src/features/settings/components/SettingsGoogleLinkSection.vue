<script setup lang="ts">
import { computed } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  googleConnectCta,
  googleDisconnectCta,
  googleMergeHintFull,
  googleMergeHintPartial,
  googleOAuthCallbackUrlIntro,
  googleReconnectCta,
  googleSettingsSectionTitle,
  googleYoutubeRequiresLinkHint,
} from '@/features/google/googleIntegrationCopy';
import { useGoogleLinkSettings } from '@/features/settings/composables/useGoogleLinkSettings';
import SettingsIntegrationPrivacyNotice from '@/features/settings/components/SettingsIntegrationPrivacyNotice.vue';

const {
  state,
  loading,
  actionError,
  connectBusy,
  disconnectBusy,
  lastOAuthRedirectUri,
  onConnect,
  onDisconnect,
  refresh,
} = useGoogleLinkSettings();

const googleConfigured = computed(() => state.value?.configured !== false);

const displayInitial = computed(() => {
  if (state.value?.linked !== true) return '?';
  const n = state.value.profile.name?.trim() ?? '';
  return n ? n.charAt(0).toUpperCase() : '?';
});
</script>

<template>
  <div class="settings-google-root w-full min-w-0 max-w-5xl">
    <div v-if="echoSyncCapabilities.isMockDataMode" class="text-sm text-muted">
      Preview mode doesn’t use a live account, so Google can’t be linked here.
    </div>

    <div v-else-if="loading" class="text-sm text-muted">Loading…</div>

    <div v-else class="flex flex-col gap-6">
      <SettingsIntegrationPrivacyNotice />

      <p v-if="actionError" class="text-sm text-red-400/90">
        {{ actionError }}
      </p>

      <p
        v-if="state && !googleConfigured"
        class="max-w-2xl text-sm leading-relaxed text-muted"
      >
        Google linking isn’t enabled on this Echo server yet. An admin needs to
        set
        <code class="font-mono text-xs">GOOGLE_OAUTH_CLIENT_ID</code>,
        <code class="font-mono text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>, and
        <code class="font-mono text-xs">GOOGLE_OAUTH_REDIRECT_URI</code>.
      </p>

      <div
        v-if="lastOAuthRedirectUri"
        class="max-w-3xl space-y-2 text-sm text-muted"
      >
        <p class="leading-relaxed">
          {{ googleOAuthCallbackUrlIntro }}
          <code
            class="mt-2 block break-all rounded-xl bg-scrim-1 px-3 py-2.5 font-mono text-[11px] leading-snug text-foreground/90"
            >{{ lastOAuthRedirectUri }}</code
          >
        </p>
      </div>

      <template v-if="state?.linked && state.profile">
        <div class="settings-card overflow-hidden rounded-2xl">
          <div class="relative px-6 pb-8 pt-8 sm:px-8 sm:pb-10">
            <div class="flex items-start gap-5">
              <div
                class="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-[6px] border-bg bg-bg shadow-lg shadow-black/20"
              >
                <PausedGifAvatar
                  v-if="state.profile.picture"
                  :src="safeImageUrl(state.profile.picture)"
                  alt=""
                  session-key="google-settings-avatar"
                  img-class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-scrim-1 text-2xl font-semibold text-foreground"
                >
                  {{ displayInitial }}
                </div>
              </div>
              <div class="min-w-0 flex-1 pt-1">
                <span
                  class="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85"
                >
                  {{ googleSettingsSectionTitle }}
                </span>
                <h4 class="mt-1 text-2xl font-bold text-foreground">
                  {{ state.profile.name || 'Google account' }}
                </h4>
                <p
                  class="mt-2 text-sm font-medium text-[color:var(--set-positive-label-fg)]"
                >
                  Connected
                </p>
              </div>
            </div>

            <div class="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2">
              <div class="min-w-0">
                <div class="settings-label mb-1.5">Email</div>
                <div class="text-sm leading-snug text-foreground/95">
                  {{
                    state.profile.emailPresent
                      ? 'Shared with Echo'
                      : 'Not shared'
                  }}
                </div>
              </div>
              <div class="min-w-0">
                <div class="settings-label mb-1.5">Google account ID</div>
                <div
                  class="font-mono text-xs leading-snug break-all text-foreground/90"
                >
                  {{ state.profile.googleSub }}
                </div>
              </div>
            </div>
          </div>

          <p class="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
            {{
              state.mergeKind === 'full'
                ? googleMergeHintFull
                : googleMergeHintPartial
            }}
          </p>
          <p class="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            {{ googleYoutubeRequiresLinkHint }}
          </p>

          <div class="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-glass-hover disabled:opacity-50"
              :disabled="connectBusy"
              @click="onConnect"
            >
              {{ googleReconnectCta }}
            </button>
            <button
              type="button"
              class="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400/90 hover:bg-red-500/10 disabled:opacity-50"
              :disabled="disconnectBusy"
              @click="onDisconnect"
            >
              {{ googleDisconnectCta }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="googleConfigured">
        <div class="settings-card rounded-2xl px-6 py-8 sm:px-8">
          <div class="flex items-center gap-3">
            <svg
              class="h-8 w-8 shrink-0"
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
            </svg>
            <div>
              <h4 class="text-lg font-bold text-foreground">
                Link Google for YouTube live
              </h4>
              <p class="mt-1 max-w-xl text-sm text-muted">
                Connect the Google account you use for Echo sign-in or YouTube.
                YouTube channel linking in Settings requires this step first.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg hover:opacity-90 disabled:opacity-50"
            :disabled="connectBusy"
            @click="onConnect"
          >
            {{ connectBusy ? 'Opening Google…' : googleConnectCta }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
