<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { withBasePath } from '@/features/layout/urlNavigation';
import StageYoutubeGoLiveModal, {
  type YoutubeGoLiveConfirmPayload,
} from '@/features/voice/components/StageYoutubeGoLiveModal.vue';
import { useStageYoutubeLive } from '@/features/voice/composables/useStageYoutubeLive';
import { youtubeStageStreamKeyLiveHint } from '@/features/youtube/youtubeIntegrationCopy';

const appBase = import.meta.env.BASE_URL || '/';
const youtubeHeroArt = withBasePath('/vc-activities/youtube-hero.svg', appBase);

const props = withDefaults(
  defineProps<{
    echoServerId: string;
    stageChannelId: string;
    canManage: boolean;
    compact?: boolean;
    enabled?: boolean;
    /** Hide entirely for audience when not live (call view header). */
    hideWhenIdleForAudience?: boolean;
  }>(),
  { compact: false, enabled: true, hideWhenIdleForAudience: false },
);

const emit = defineEmits<{
  liveStarted: [];
}>();

const setupModalOpen = ref(false);

const {
  stream,
  loading,
  actionBusy,
  goLiveTitle,
  goLiveDescription,
  privacyStatus,
  usesStreamKeyDelivery,
  isStreamKeyLive,
  youtubeChannelTitle,
  youtubeChannelThumbnailUrl,
  egressLayout,
  setEgressLayout,
  goLive,
  endLive,
} = useStageYoutubeLive({
  echoServerId: () => props.echoServerId,
  stageChannelId: () => props.stageChannelId,
  enabled: () =>
    props.enabled &&
    !!props.echoServerId?.trim() &&
    !!props.stageChannelId?.trim(),
});

const isLive = computed(
  () =>
    stream.value?.active &&
    (stream.value.status === 'live' || stream.value.status === 'starting'),
);

async function onModalConfirm(payload: YoutubeGoLiveConfirmPayload) {
  goLiveTitle.value = payload.title;
  goLiveDescription.value = payload.description;
  privacyStatus.value = payload.privacyStatus;
  setupModalOpen.value = false;
  await goLive();
  if (
    stream.value?.active &&
    (stream.value.status === 'live' || stream.value.status === 'starting')
  ) {
    emit('liveStarted');
  }
}

function openSetupModal() {
  setupModalOpen.value = true;
}

const shouldRender = computed(
  () => !props.hideWhenIdleForAudience || props.canManage || isLive.value,
);
</script>

<template>
  <div
    v-if="shouldRender"
    class="stage-youtube-go-live flex flex-col gap-2"
    :class="compact ? 'stage-youtube-go-live--compact' : ''"
  >
    <div class="flex flex-wrap items-center gap-2">
      <img :src="icons.youtube" alt="" class="h-5 w-5 shrink-0 opacity-90" />

      <template v-if="isLive">
        <span
          class="inline-flex items-center gap-1.5 rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          YouTube live
        </span>
        <a
          v-if="stream?.watchUrl"
          :href="stream.watchUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="max-w-[12rem] truncate text-xs font-medium text-accent hover:underline"
        >
          Open stream
        </a>
        <span
          v-else-if="isStreamKeyLive && canManage"
          class="max-w-md text-xs text-fg-subtle"
        >
          {{ youtubeStageStreamKeyLiveHint }}
        </span>
      </template>

      <template v-else-if="canManage">
        <button
          type="button"
          class="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-red-950/25 hover:bg-red-500 disabled:opacity-50"
          :class="compact ? 'w-full sm:w-auto' : ''"
          :disabled="actionBusy || loading"
          @click="openSetupModal"
        >
          Go live on YouTube
        </button>
      </template>

      <p v-else class="text-xs leading-relaxed text-muted">
        A moderator with Manage Channels can start the YouTube live stream.
      </p>
    </div>

    <div
      v-if="isLive && canManage && !compact"
      class="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2"
    >
      <select
        :value="egressLayout"
        class="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-fg"
        title="Program layout sent to YouTube"
        :disabled="actionBusy || loading"
        @change="
          setEgressLayout(
            ($event.target as HTMLSelectElement).value as
              | 'grid'
              | 'spotlight'
              | 'screen',
          )
        "
      >
        <option value="grid">Grid</option>
        <option value="spotlight">Spotlight</option>
        <option value="screen">Screen first</option>
      </select>
      <button
        type="button"
        class="ml-auto rounded-lg border border-border px-3 py-1 text-xs font-semibold text-fg hover:bg-glass-hover disabled:opacity-50"
        :disabled="actionBusy || loading"
        @click="endLive"
      >
        End live
      </button>
    </div>

    <StageYoutubeGoLiveModal
      v-model="setupModalOpen"
      :busy="actionBusy || loading"
      :uses-stream-key-delivery="usesStreamKeyDelivery"
      :youtube-channel-title="youtubeChannelTitle"
      :youtube-channel-thumbnail-url="youtubeChannelThumbnailUrl"
      :fallback-thumbnail-url="youtubeHeroArt"
      :initial-title="goLiveTitle"
      :initial-description="goLiveDescription"
      :initial-privacy="privacyStatus"
      @confirm="onModalConfirm"
    />
  </div>
</template>
