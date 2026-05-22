<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  revokeMeYoutubeStreamKey,
  saveMeYoutubeStreamKey,
  unlinkMeYoutube,
} from '@/api/meYoutube';
import {
  youtubeConnectCta,
  youtubeNativeConnectionBlurb,
  youtubeNativeConnectionTitle,
  youtubeOAuthCallbackUrlIntro,
  youtubeReconnectCta,
  youtubeRequiresGoogleLinkHint,
  youtubeSettingsSectionTitle,
  youtubeStreamKeyBlurb,
  youtubeStreamKeyNeverShownAgain,
  youtubeStreamKeyRevokeCta,
  youtubeStreamKeySaveCta,
  youtubeStreamKeySavedLabel,
  youtubeStreamKeySwitchToNativeHint,
  youtubeStreamKeyTitle,
} from '@/features/youtube/youtubeIntegrationCopy';
import { useYoutubeLinkSettings } from '@/features/settings/composables/useYoutubeLinkSettings';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import type { SettingsSection } from '@/features/settings/types';

const props = defineProps<{
  navigateToSection?: (section: SettingsSection) => void;
}>();

const {
  state,
  loading,
  actionError,
  connectBusy,
  lastOAuthRedirectUri,
  onConnect,
  refresh,
} = useYoutubeLinkSettings();

const disconnectBusy = ref(false);
const streamKeyInput = ref('');
const streamKeyServerUrl = ref('rtmp://a.rtmp.youtube.com/live2');
const streamKeyBusy = ref(false);
const streamKeyRevokeBusy = ref(false);
const streamKeyConfirm = ref(false);

const hasOAuthLink = computed(() => state.value?.linked === true);
const hasStreamKey = computed(() => !!state.value?.streamKey);
const oauthConfigured = computed(() => state.value?.configured === true);
const activeMode = computed(() => state.value?.connectionMode ?? 'none');

const displayInitial = computed(() => {
  if (state.value?.linked !== true) return '?';
  const t = state.value.profile?.channelTitle?.trim() ?? '';
  return t ? t.charAt(0).toUpperCase() : '?';
});

async function onDisconnectOAuth() {
  disconnectBusy.value = true;
  try {
    await unlinkMeYoutube();
    dispatchAppToast('YouTube channel unlinked.', 'info');
    await refresh();
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not unlink YouTube.',
      'error',
    );
  } finally {
    disconnectBusy.value = false;
  }
}

async function onSaveStreamKey() {
  const key = streamKeyInput.value.trim();
  if (!key) {
    dispatchAppToast('Enter your YouTube stream key.', 'error');
    return;
  }
  if (!streamKeyConfirm.value) {
    dispatchAppToast('Confirm that you understand the key cannot be shown again.', 'error');
    return;
  }
  streamKeyBusy.value = true;
  try {
    await saveMeYoutubeStreamKey({
      streamKey: key,
      serverUrl: streamKeyServerUrl.value.trim() || undefined,
    });
    streamKeyInput.value = '';
    streamKeyConfirm.value = false;
    dispatchAppToast('Stream key saved. Echo will not show it again.', 'info');
    await refresh();
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not save stream key.',
      'error',
    );
  } finally {
    streamKeyBusy.value = false;
  }
}

async function onRevokeStreamKey() {
  streamKeyRevokeBusy.value = true;
  try {
    await revokeMeYoutubeStreamKey();
    dispatchAppToast('Stream key revoked.', 'info');
    await refresh();
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not revoke stream key.',
      'error',
    );
  } finally {
    streamKeyRevokeBusy.value = false;
  }
}
</script>

<template>
  <div class="settings-youtube-root w-full min-w-0 max-w-5xl">
    <div v-if="echoSyncCapabilities.isMockDataMode" class="text-sm text-muted">
      Preview mode doesn’t use a live account, so YouTube can’t be linked here.
    </div>

    <div v-else-if="loading" class="text-sm text-muted">Loading…</div>

    <div v-else class="flex flex-col gap-6">
      <p v-if="actionError" class="text-sm text-red-400/90">
        {{ actionError }}
      </p>

      <p
        v-if="state && !oauthConfigured && !hasStreamKey"
        class="max-w-2xl text-sm leading-relaxed text-muted"
      >
        YouTube live isn’t enabled on this Echo server yet. An admin needs to set
        <code class="font-mono text-xs">GOOGLE_OAUTH_*</code> and
        <code class="font-mono text-xs">YOUTUBE_OAUTH_REDIRECT_URI</code> for channel
        linking, or you can still use a stream key once the server can store encrypted
        credentials (<code class="font-mono text-xs">ECHO_DISCORD_TOKEN_ENCRYPTION_KEY</code>).
      </p>

      <div
        v-if="lastOAuthRedirectUri"
        class="max-w-3xl space-y-2 text-sm text-muted"
      >
        <p class="leading-relaxed">
          {{ youtubeOAuthCallbackUrlIntro }}
          <code
            class="mt-2 block break-all rounded-xl bg-scrim-1 px-3 py-2.5 font-mono text-[11px] leading-snug text-foreground/90"
            >{{ lastOAuthRedirectUri }}</code
          >
        </p>
      </div>

      <!-- OAuth channel link -->
      <div class="settings-card rounded-2xl px-6 py-8 sm:px-8">
        <div class="flex items-center gap-3">
          <img :src="icons.youtube" alt="" class="h-8 w-8 opacity-90" />
          <div>
            <h4 class="text-lg font-bold text-foreground">
              {{ youtubeNativeConnectionTitle }}
            </h4>
            <p class="mt-1 max-w-xl text-sm text-muted">
              {{ youtubeNativeConnectionBlurb }}
            </p>
          </div>
        </div>

        <template v-if="hasOAuthLink && state?.profile">
          <div class="mt-6 flex items-start gap-4">
            <div
              class="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border bg-bg"
            >
              <PausedGifAvatar
                v-if="state.profile.channelThumbnailUrl"
                :src="safeImageUrl(state.profile.channelThumbnailUrl)"
                alt=""
                session-key="youtube-settings-avatar"
                img-class="h-full w-full object-cover"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center bg-scrim-1 text-lg font-semibold"
              >
                {{ displayInitial }}
              </div>
            </div>
            <div class="min-w-0">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85"
              >
                {{ youtubeSettingsSectionTitle }}
              </span>
              <p class="font-semibold text-foreground">
                {{ state.profile.channelTitle }}
              </p>
              <p
                v-if="activeMode === 'oauth'"
                class="mt-1 text-xs text-[color:var(--set-positive-label-fg)]"
              >
                Used for stage go-live
              </p>
            </div>
          </div>
          <div class="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-glass-hover disabled:opacity-50"
              :disabled="connectBusy"
              @click="onConnect"
            >
              {{ youtubeReconnectCta }}
            </button>
            <button
              type="button"
              class="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400/90 hover:bg-red-500/10 disabled:opacity-50"
              :disabled="disconnectBusy"
              @click="onDisconnectOAuth"
            >
              Unlink channel
            </button>
          </div>
        </template>

        <template v-else-if="oauthConfigured && !state?.googleLinked">
          <p class="mt-6 max-w-xl text-sm text-muted">
            {{ youtubeRequiresGoogleLinkHint }}
          </p>
          <button
            v-if="props.navigateToSection"
            type="button"
            class="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg hover:opacity-90"
            @click="props.navigateToSection('Google')"
          >
            Open Google settings
          </button>
        </template>

        <template v-else-if="oauthConfigured && state?.googleLinked">
          <button
            type="button"
            class="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg hover:opacity-90 disabled:opacity-50"
            :disabled="connectBusy"
            @click="onConnect"
          >
            {{ connectBusy ? 'Opening Google…' : youtubeConnectCta }}
          </button>
        </template>
      </div>

      <!-- Stream key path -->
      <div class="settings-card rounded-2xl px-6 py-8 sm:px-8">
        <h4 class="text-lg font-bold text-foreground">
          {{ youtubeStreamKeyTitle }}
        </h4>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {{ youtubeStreamKeyBlurb }}
        </p>

        <template v-if="hasStreamKey && state?.streamKey">
          <div
            class="mt-6 rounded-xl border border-border bg-scrim-1/60 px-4 py-4"
          >
            <p class="text-sm font-semibold text-foreground">
              {{ youtubeStreamKeySavedLabel }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Saved
              {{
                new Date(state.streamKey.savedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              }}. Echo cannot display the key again.
            </p>
            <p
              v-if="activeMode === 'stream_key'"
              class="mt-2 text-xs text-[color:var(--set-positive-label-fg)]"
            >
              Used for stage go-live
            </p>
            <p
              v-else-if="hasOAuthLink"
              class="mt-2 text-xs text-muted"
            >
              Channel link takes priority for go-live. Revoke the channel link to use
              this stream key on stages.
            </p>
          </div>
          <p class="mt-4 max-w-xl text-sm text-muted">
            {{ youtubeStreamKeySwitchToNativeHint }}
          </p>
          <button
            type="button"
            class="mt-4 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400/90 hover:bg-red-500/10 disabled:opacity-50"
            :disabled="streamKeyRevokeBusy"
            @click="onRevokeStreamKey"
          >
            {{ streamKeyRevokeBusy ? 'Revoking…' : youtubeStreamKeyRevokeCta }}
          </button>
        </template>

        <template v-else>
          <p class="mt-4 text-sm text-muted">
            {{ youtubeStreamKeyNeverShownAgain }}
          </p>
          <label class="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">
            RTMP server (optional)
            <input
              v-model="streamKeyServerUrl"
              type="text"
              class="settings-input mt-2 font-mono text-xs"
              placeholder="rtmp://a.rtmp.youtube.com/live2"
              autocomplete="off"
            />
          </label>
          <label class="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted">
            Stream key
            <input
              v-model="streamKeyInput"
              type="password"
              class="settings-input mt-2 font-mono text-xs"
              placeholder="Paste from YouTube Studio"
              autocomplete="off"
            />
          </label>
          <label class="mt-4 flex cursor-pointer items-start gap-3 text-sm text-muted">
            <input
              v-model="streamKeyConfirm"
              type="checkbox"
              class="mt-1"
            />
            <span>
              I understand Echo will encrypt this key and I won’t be able to view it
              again in Settings. I can revoke and enter a new key later.
            </span>
          </label>
          <button
            type="button"
            class="mt-6 rounded-xl border border-border bg-glass-1 px-5 py-2.5 text-sm font-bold text-foreground hover:bg-glass-hover disabled:opacity-50"
            :disabled="streamKeyBusy"
            @click="onSaveStreamKey"
          >
            {{ streamKeyBusy ? 'Saving…' : youtubeStreamKeySaveCta }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
