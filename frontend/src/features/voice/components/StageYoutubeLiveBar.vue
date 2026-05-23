<script setup lang="ts">
import { computed } from 'vue';
import { icons } from '@/assets/icons';
import { useStageYoutubeLive } from '@/features/voice/composables/useStageYoutubeLive';
import { youtubeStageStreamKeyLiveHint } from '@/features/youtube/youtubeIntegrationCopy';

const props = defineProps<{
  echoServerId: string;
  stageChannelId: string;
  canManage: boolean;
}>();

const {
  stream,
  loading,
  actionBusy,
  goLiveTitle,
  privacyStatus,
  usesStreamKeyDelivery,
  isStreamKeyLive,
  goLive,
  endLive,
} = useStageYoutubeLive({
  echoServerId: () => props.echoServerId,
  stageChannelId: () => props.stageChannelId,
  enabled: () => !!props.echoServerId?.trim() && !!props.stageChannelId?.trim(),
});

const isLive = computed(
  () =>
    stream.value?.active &&
    (stream.value.status === 'live' || stream.value.status === 'starting'),
);

const showModeratorControls = computed(() => props.canManage);
</script>

<template>
  <div
    v-if="showModeratorControls || isLive"
    class="stage-youtube-bar flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-scrim-1/80 px-3 py-2"
  >
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
        v-else-if="isStreamKeyLive && showModeratorControls"
        class="max-w-md text-xs text-fg-subtle"
      >
        {{ youtubeStageStreamKeyLiveHint }}
      </span>
      <span v-else-if="!showModeratorControls" class="text-xs text-fg-subtle">
        Stream link is visible to moderators only
      </span>
      <button
        v-if="showModeratorControls"
        type="button"
        class="ml-auto rounded-lg border border-border px-3 py-1 text-xs font-semibold text-fg hover:bg-glass-hover disabled:opacity-50"
        :disabled="actionBusy || loading"
        @click="endLive"
      >
        End live
      </button>
    </template>

    <template v-else-if="showModeratorControls">
      <input
        v-model="goLiveTitle"
        type="text"
        maxlength="100"
        placeholder="Stream title (optional)"
        class="min-w-[10rem] max-w-[14rem] flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-subtle"
      />
      <select
        v-if="!usesStreamKeyDelivery"
        v-model="privacyStatus"
        class="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-fg"
      >
        <option value="unlisted">Unlisted</option>
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <span
        v-else
        class="max-w-xs text-xs text-fg-subtle"
        title="Privacy is set in YouTube Studio when using a stream key"
      >
        Using saved stream key
      </span>
      <button
        type="button"
        class="rounded-lg bg-red-600/90 px-3 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
        :disabled="actionBusy || loading"
        @click="goLive"
      >
        Go live on YouTube
      </button>
    </template>
  </div>
</template>
