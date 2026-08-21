<script setup lang="ts">
import { computed, ref, shallowRef, unref, watch, type MaybeRef } from 'vue';
import type { EchoMediaPlaybackSyncV1 } from '@/audio/voiceEchoLiveKitData';
import type {
  VcActivityUiState,
  WatchTogetherTranscodeStatus,
} from '@/features/voice/vcActivityTypes';
import { watchTogetherNowPlaying } from '@/features/voice/vcActivityTypes';
import {
  useVcWatchTogetherPlayer,
  type VcWatchTogetherRemotePlaybackState,
} from '@/features/voice/composables/useVcWatchTogetherPlayer';
import { useVcWatchTogetherHlsPlayback } from '@/features/voice/composables/useVcWatchTogetherHlsPlayback';
import { useAuthSessionStore } from '@/features/auth/authSession';

const props = defineProps<{
  state: VcActivityUiState;
  compactLayout?: boolean;
  liveKitConnected?: boolean;
  publishVcWatchTogetherPlaybackSync?: (
    sample: EchoMediaPlaybackSyncV1,
  ) => void;
  vcWatchTogetherRemotePlayback?: MaybeRef<VcWatchTogetherRemotePlaybackState | null>;
  vcWatchTogetherPlaybackShouldPublish?: MaybeRef<boolean>;
  setWatchTogetherBrowseOpen: (open: boolean) => void;
  playWatchTogetherAtIndex: (index: number) => void;
}>();

const auth = useAuthSessionStore();
const st = computed(() => props.state);
const nowPlaying = computed(() => watchTogetherNowPlaying(st.value));

const videoEl = ref<HTMLVideoElement | null>(null);
const sourceUrl = computed(
  () => nowPlaying.value?.sourcePublicUrl?.trim() ?? '',
);
const tokenRef = computed(() => auth.accessToken);
const hlsPlayback = useVcWatchTogetherHlsPlayback(sourceUrl, {
  token: tokenRef,
});
const retryBusy = ref(false);

const hlsManifestUrl = computed(() => {
  const row = nowPlaying.value;
  if (row?.hlsManifestUrl?.trim()) return row.hlsManifestUrl.trim();
  return hlsPlayback.state.value.hlsManifestUrl;
});

const remotePlaybackMirror =
  shallowRef<VcWatchTogetherRemotePlaybackState | null>(null);
watch(
  () => unref(props.vcWatchTogetherRemotePlayback),
  (v) => {
    remotePlaybackMirror.value = v ?? null;
  },
  { immediate: true },
);

const canPublishPlayback = computed(
  () => unref(props.vcWatchTogetherPlaybackShouldPublish) ?? true,
);

const syncEnabled = computed(
  () => typeof props.publishVcWatchTogetherPlaybackSync === 'function',
);

function publishPlaybackBridge(sample: EchoMediaPlaybackSyncV1): void {
  props.publishVcWatchTogetherPlaybackSync?.(sample);
}

const playerCtl = useVcWatchTogetherPlayer({
  videoRef: videoEl,
  hlsManifestUrl,
  remotePlayback: remotePlaybackMirror,
  publish: publishPlaybackBridge,
  canPublish: canPublishPlayback,
});

watch(hlsManifestUrl, (url, prev) => {
  if (url && url !== prev && syncEnabled.value) {
    playerCtl.publishAfterSourceChange();
  }
});

const isHostControls = computed(() => canPublishPlayback.value);

function rowIsPlayable(row: {
  transcodeStatus: WatchTogetherTranscodeStatus;
  hlsManifestUrl: string | null;
}) {
  return row.transcodeStatus === 'ready' && !!row.hlsManifestUrl?.trim();
}

function playAt(index: number) {
  const row = st.value.watchTogetherPlaylist[index];
  if (!row) return;
  if (isHostControls.value && !rowIsPlayable(row)) return;
  props.playWatchTogetherAtIndex(index);
}

function findNextPlayableIndex(
  fromIndex: number,
  direction: 1 | -1,
): number | null {
  const pl = st.value.watchTogetherPlaylist;
  let i = fromIndex + direction;
  while (i >= 0 && i < pl.length) {
    if (rowIsPlayable(pl[i]!)) return i;
    i += direction;
  }
  return null;
}

function playNext() {
  const next = findNextPlayableIndex(st.value.watchTogetherCurrentIndex, 1);
  if (next != null) playAt(next);
}

function playPrevious() {
  const prev = findNextPlayableIndex(st.value.watchTogetherCurrentIndex, -1);
  if (prev != null) playAt(prev);
}

function toggleBrowse() {
  props.setWatchTogetherBrowseOpen(!st.value.watchTogetherBrowseOpen);
}

const playbackStatus = computed(() => {
  const row = nowPlaying.value;
  if (row && !rowIsPlayable(row)) {
    if (row.transcodeStatus === 'failed') return 'failed' as const;
    if (row.transcodeStatus === 'processing') return 'processing' as const;
    return 'pending' as const;
  }
  return hlsPlayback.state.value.status;
});

const playbackError = computed(() => {
  const row = nowPlaying.value;
  return (
    row?.transcodeError?.trim() ||
    hlsPlayback.state.value.lastError?.trim() ||
    null
  );
});

const hasNextPlayable = computed(
  () => findNextPlayableIndex(st.value.watchTogetherCurrentIndex, 1) != null,
);
const hasPreviousPlayable = computed(
  () => findNextPlayableIndex(st.value.watchTogetherCurrentIndex, -1) != null,
);

function queueStatusLabel(row: {
  transcodeStatus: WatchTogetherTranscodeStatus;
}): string {
  switch (row.transcodeStatus) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    case 'processing':
      return 'Processing';
    case 'pending':
      return 'Queued';
    case 'uploading':
      return 'Uploading';
    default:
      return row.transcodeStatus;
  }
}

async function retryCurrentTranscode() {
  if (!isHostControls.value || !sourceUrl.value.trim()) return;
  retryBusy.value = true;
  try {
    await hlsPlayback.retryTranscode();
  } finally {
    retryBusy.value = false;
  }
}
</script>

<template>
  <div
    class="vc-wt-stage relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
  >
    <aside
      v-show="st.watchTogetherBrowseOpen"
      class="vc-wt-browse custom-scrollbar shrink-0 overflow-y-auto border-b border-border lg:w-72 lg:border-b-0 lg:border-r"
    >
      <div class="px-3 py-3">
        <h3
          class="text-[12px] font-bold uppercase tracking-wide text-fg-subtle"
        >
          Queue
        </h3>
        <ul class="mt-2 space-y-1">
          <li v-for="(row, index) in st.watchTogetherPlaylist" :key="row.id">
            <button
              type="button"
              class="w-full rounded-lg px-2 py-2 text-left text-[12px] transition"
              :class="
                index === st.watchTogetherCurrentIndex
                  ? 'bg-[color-mix(in_srgb,#6d9fff_18%,transparent)] font-semibold text-fg'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
              "
              :disabled="isHostControls ? !rowIsPlayable(row) : false"
              :title="
                isHostControls && !rowIsPlayable(row)
                  ? `${queueStatusLabel(row)} — not playable yet`
                  : undefined
              "
              @click="playAt(index)"
            >
              <span class="line-clamp-2">{{ row.title }}</span>
              <span
                v-if="!rowIsPlayable(row)"
                class="mt-0.5 block text-[10px] font-normal opacity-70"
              >
                {{ queueStatusLabel(row) }}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        v-if="liveKitConnected === false"
        class="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] text-fg-subtle"
      >
        Reconnect to voice to stay in sync with the session host.
      </div>

      <div class="relative min-h-0 flex-1 bg-black">
        <video
          ref="videoEl"
          class="h-full w-full object-contain"
          playsinline
          :controls="isHostControls"
          :controlslist="
            isHostControls ? undefined : 'nodownload noremoteplayback'
          "
        />
        <div
          v-if="!nowPlaying"
          class="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-fg-subtle"
        >
          Nothing in queue
        </div>
        <div
          v-else-if="playerCtl.hlsUnsupported.value"
          class="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-sm text-fg-subtle"
        >
          HLS playback is not supported in this browser.
        </div>
        <div
          v-else-if="playbackStatus !== 'ready'"
          class="absolute inset-x-0 bottom-0 bg-scrim-2 px-3 py-2 text-center text-[11px] text-fg-soft"
        >
          <span v-if="playbackStatus === 'processing'"
            >Preparing HLS stream…</span
          >
          <span v-else-if="playbackStatus === 'failed'">
            {{ playbackError || 'Playback unavailable' }}
            <button
              v-if="isHostControls"
              type="button"
              class="ml-2 underline disabled:opacity-50"
              :disabled="retryBusy"
              @click="retryCurrentTranscode()"
            >
              Retry transcode
            </button>
            <span v-else class="ml-1 opacity-80"> · waiting for host </span>
          </span>
          <span v-else-if="playbackStatus === 'loading'">Loading stream…</span>
          <span v-else>Waiting for transcode…</span>
        </div>
        <div
          v-if="!isHostControls && nowPlaying && playbackStatus === 'ready'"
          class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-fg-soft"
        >
          Following host
        </div>
      </div>

      <div
        v-if="st.watchTogetherPlaylist.length"
        class="vc-wt-transport mx-2 mb-2 mt-0.5 flex shrink-0 items-center gap-2 rounded-xl border border-border/60 px-2 py-1.5 sm:mx-2.5 sm:px-2.5 sm:py-2"
      >
        <div
          v-if="isHostControls"
          class="flex shrink-0 items-center gap-px rounded-lg bg-elevated/70 p-px ring-1 ring-border/55"
        >
          <button
            type="button"
            class="rounded-md p-1.5 text-fg-soft transition hover:bg-glass-hover hover:text-fg disabled:opacity-35"
            aria-label="Previous in queue"
            :disabled="!hasPreviousPlayable"
            @click="playPrevious"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          <button
            type="button"
            class="rounded-md p-1.5 text-fg-soft transition hover:bg-glass-hover hover:text-fg disabled:opacity-35"
            aria-label="Next in queue"
            :disabled="!hasNextPlayable"
            @click="playNext"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>
        <div class="min-w-0 flex-1 px-0.5">
          <div
            class="truncate text-[11px] font-semibold leading-tight"
            :title="nowPlaying?.title ?? ''"
          >
            {{ nowPlaying?.title ?? '—' }}
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full border border-border/70 bg-elevated/80 px-2.5 py-1 text-[10px] font-bold tabular-nums text-fg-soft transition hover:text-fg sm:px-3"
          @click="toggleBrowse"
        >
          <span class="sm:hidden">{{ st.watchTogetherPlaylist.length }}</span>
          <span class="hidden sm:inline">
            Queue · {{ st.watchTogetherPlaylist.length }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vc-wt-stage {
  --vc-wt-brand: #6d9fff;
}
.vc-wt-transport {
  box-shadow: 0 8px 24px color-mix(in srgb, var(--bg) 40%, transparent);
}
</style>
