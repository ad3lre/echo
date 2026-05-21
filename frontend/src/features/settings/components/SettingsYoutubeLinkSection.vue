<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { unlinkMeYoutube } from '@/api/meYoutube';
import {
  youtubeConnectCta,
  youtubeOAuthCallbackUrlIntro,
  youtubeReconnectCta,
  youtubeSettingsSectionTitle,
} from '@/features/youtube/youtubeIntegrationCopy';
import { useYoutubeLinkSettings } from '@/features/settings/composables/useYoutubeLinkSettings';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

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

async function onDisconnect() {
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

const displayInitial = computed(() => {
  if (state.value?.linked !== true) return '?';
  const t = state.value.profile?.channelTitle?.trim() ?? '';
  return t ? t.charAt(0).toUpperCase() : '?';
});
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
        v-if="state && !state.configured"
        class="max-w-2xl text-sm leading-relaxed text-muted"
      >
        YouTube live isn’t enabled on this Echo server yet. An admin needs to set
        <code class="font-mono text-xs">GOOGLE_OAUTH_*</code> and
        <code class="font-mono text-xs">YOUTUBE_OAUTH_REDIRECT_URI</code>.
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

      <template v-if="state?.linked && state.profile">
        <div class="settings-card overflow-hidden rounded-2xl px-6 py-8 sm:px-8">
          <div class="flex items-start gap-4">
            <div
              class="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-bg"
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
                class="flex h-full w-full items-center justify-center bg-scrim-1 text-xl font-semibold"
              >
                {{ displayInitial }}
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85"
              >
                {{ youtubeSettingsSectionTitle }}
              </span>
              <h4 class="text-xl font-bold text-foreground">
                {{ state.profile.channelTitle }}
              </h4>
              <p class="mt-1 font-mono text-xs text-muted break-all">
                {{ state.profile.youtubeChannelId }}
              </p>
            </div>
          </div>
          <p class="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
            Use <strong class="font-semibold text-foreground/90">Go live on YouTube</strong>
            from any stage channel you can manage. Echo composites speaker video into a
            program feed (StreamYard-style) and sends it to YouTube over RTMP.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
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
              @click="onDisconnect"
            >
              Unlink channel
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="state?.configured">
        <div class="settings-card rounded-2xl px-6 py-8 sm:px-8">
          <div class="flex items-center gap-3">
            <img :src="icons.youtube" alt="" class="h-8 w-8 opacity-90" />
            <div>
              <h4 class="text-lg font-bold text-foreground">
                Stream stages to YouTube
              </h4>
              <p class="mt-1 max-w-xl text-sm text-muted">
                Connect the Google account that owns your YouTube channel. You’ll need
                live streaming enabled on that channel.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg hover:opacity-90 disabled:opacity-50"
            :disabled="connectBusy"
            @click="onConnect"
          >
            {{ youtubeConnectCta }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
