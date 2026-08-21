<script setup lang="ts">
import {
  ref,
  watch,
  watchEffect,
  onUnmounted,
  onMounted,
  nextTick,
  computed,
} from 'vue';
import type { RemoteTrack } from 'livekit-client';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/features/layout/display/avatarDisplay';
import {
  clearHtmlVideoElement,
  mediaStreamFromLiveKitTrack,
} from '@/features/voice/livekitTrackMediaStream';
import { useLocalScreenSharePreviewSuspend } from '@/features/voice/composables/useLocalScreenSharePreviewSuspend';
import { useLiveKitTrackSurfaceGeneration } from '@/features/voice/composables/useLiveKitTrackSurfaceGeneration';
import { clampMenuToViewport } from '@/features/layout/useContextMenuPosition';

type LocalTrackLike = {
  mediaStreamTrack?: MediaStreamTrack;
  track?: MediaStreamTrack;
};

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    track: RemoteTrack | LocalTrackLike | null;
    audioTrack?: RemoteTrack | null;
    participantName: string;
    participantPfp?: string;
    participantId?: string;
    isLocal?: boolean;
    isScreenShare?: boolean;
    /** Remote participant: master output volume (0–100) via LiveKit (mic + system audio). */
    remoteStreamVolumeControl?: boolean;
    remoteStreamVolumePercent?: number;
  }>(),
  {
    isLocal: false,
    isScreenShare: false,
    remoteStreamVolumeControl: false,
    remoteStreamVolumePercent: 100,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'remoteStreamVolumeChange', v: number): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const audioRef = ref<HTMLAudioElement | null>(null);

const pipSupported = computed(
  () => typeof document !== 'undefined' && document.pictureInPictureEnabled,
);

const avatarDisplayUrl = computed(() =>
  resolveCallTileAvatarUrl(
    props.participantPfp,
    props.participantId?.trim() ?? '',
  ),
);

const localScreenSharePreviewSuspendEnabled = computed(
  () =>
    props.modelValue &&
    !!props.isLocal &&
    !!props.isScreenShare &&
    !!props.track,
);

const { previewSuspended, bumpPreviewActivity } =
  useLocalScreenSharePreviewSuspend({
    enabled: localScreenSharePreviewSuspendEnabled,
  });

const videoSurfaceGeneration = useLiveKitTrackSurfaceGeneration(
  () => props.track,
);

watchEffect(() => {
  void videoSurfaceGeneration.value;
  const el = videoRef.value;
  const t = props.track;
  if (!el) return;
  if (!t) {
    clearHtmlVideoElement(el);
    return;
  }
  if (props.isLocal && props.isScreenShare && previewSuspended.value) {
    clearHtmlVideoElement(el);
    return;
  }
  const ms = mediaStreamFromLiveKitTrack(t, { kind: 'video' });
  if (ms && el.srcObject !== ms) {
    el.srcObject = ms;
  } else if (!ms) {
    clearHtmlVideoElement(el);
  }
});

function onFullscreenLocalScreenPointerdown() {
  if (!localScreenSharePreviewSuspendEnabled.value) return;
  bumpPreviewActivity();
}

watchEffect(() => {
  const el = audioRef.value;
  const t = props.audioTrack;
  if (!el) return;
  if (!t) {
    el.srcObject = null;
    return;
  }
  const ms = mediaStreamFromLiveKitTrack(t, { kind: 'audio' });
  if (ms && el.srcObject !== ms) {
    el.srcObject = ms;
  } else if (!ms) {
    el.srcObject = null;
  }
  /** Level is applied on LiveKit publications; keep element gain at 1 to avoid double-attenuation. */
  el.volume = 1;
});

const lastNonZeroStreamVolume = ref(100);

watch(
  () => props.remoteStreamVolumePercent,
  (v) => {
    if (typeof v === 'number' && v > 0) lastNonZeroStreamVolume.value = v;
  },
  { immediate: true },
);

const streamVolumeSliderValue = computed(
  () => props.remoteStreamVolumePercent ?? 100,
);

const streamVolumeMenuOpen = ref(false);
const streamVolumeMenuPos = ref({ left: 0, top: 0 });
const streamVolumeMenuRef = ref<HTMLElement | null>(null);
const streamVolumeMenuDraft = ref(100);

const streamVolumeMuted = computed(
  () => props.remoteStreamVolumeControl && streamVolumeSliderValue.value <= 0,
);

function toggleStreamOutputMute() {
  if (!props.remoteStreamVolumeControl) return;
  if (streamVolumeSliderValue.value <= 0) {
    emit(
      'remoteStreamVolumeChange',
      lastNonZeroStreamVolume.value > 0 ? lastNonZeroStreamVolume.value : 100,
    );
  } else {
    lastNonZeroStreamVolume.value = streamVolumeSliderValue.value;
    emit('remoteStreamVolumeChange', 0);
  }
}

function onStreamVolumeRangeInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const v = Math.max(0, Math.min(200, Math.round(raw)));
  if (v > 0) lastNonZeroStreamVolume.value = v;
  emit('remoteStreamVolumeChange', v);
}

function closeStreamVolumeMenu() {
  streamVolumeMenuOpen.value = false;
}

function onFullscreenContextMenu(e: MouseEvent) {
  if (!props.remoteStreamVolumeControl || !props.modelValue) return;
  e.preventDefault();
  e.stopPropagation();
  streamVolumeMenuDraft.value = streamVolumeSliderValue.value;
  streamVolumeMenuPos.value = clampMenuToViewport(
    e.clientX,
    e.clientY,
    230,
    120,
  );
  streamVolumeMenuOpen.value = true;
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = streamVolumeMenuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      streamVolumeMenuPos.value = clampMenuToViewport(
        r.left,
        r.top,
        r.width,
        r.height,
      );
    });
  });
}

function onStreamVolumeMenuInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const v = Math.max(0, Math.min(200, Math.round(raw)));
  streamVolumeMenuDraft.value = v;
  if (v > 0) lastNonZeroStreamVolume.value = v;
  emit('remoteStreamVolumeChange', v);
}

const showControls = ref(true);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function bumpControlsVisibility() {
  showControls.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    showControls.value = false;
  }, 3000);
}

function onOverlayPointerdown() {
  bumpControlsVisibility();
  onFullscreenLocalScreenPointerdown();
}

function close() {
  emit('update:modelValue', false);
}

async function togglePip() {
  const el = videoRef.value;
  if (!el) return;
  try {
    if (document.pictureInPictureElement === el) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await el.requestPictureInPicture();
    }
  } catch {
    /* PiP not supported or denied */
  }
}

let escCleanup: (() => void) | null = null;

function onDocumentPointerDown(e: MouseEvent) {
  if (!streamVolumeMenuOpen.value) return;
  const menuEl = streamVolumeMenuRef.value;
  if (!menuEl) {
    closeStreamVolumeMenu();
    return;
  }
  const path = e.composedPath();
  if (path.includes(menuEl)) return;
  closeStreamVolumeMenu();
}

watch(
  () => props.modelValue,
  (open) => {
    escCleanup?.();
    escCleanup = null;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!open) {
      showControls.value = true;
      closeStreamVolumeMenu();
      return;
    }
    showControls.value = true;
    bumpControlsVisibility();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeydown);
    escCleanup = () => window.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
  escCleanup?.();
  if (hideTimer) clearTimeout(hideTimer);
  const el = videoRef.value;
  if (el && document.pictureInPictureElement === el) {
    try {
      void document.exitPictureInPicture();
    } catch {
      /* ignore */
    }
  }
  clearHtmlVideoElement(videoRef.value);
});

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown, true);
});

watch(streamVolumeSliderValue, (v) => {
  if (!streamVolumeMenuOpen.value) return;
  streamVolumeMenuDraft.value = v;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[600] flex flex-col bg-black"
      @mousemove="bumpControlsVisibility"
      @pointerdown="onOverlayPointerdown"
      @contextmenu="onFullscreenContextMenu"
    >
      <video
        ref="videoRef"
        class="fullscreen-stream-overlay__video min-h-0 w-full flex-1"
        autoplay
        playsinline
        :muted="!!audioTrack"
      />
      <audio
        v-if="audioTrack"
        ref="audioRef"
        class="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
        autoplay
        playsinline
      />
      <div
        v-if="localScreenSharePreviewSuspendEnabled && previewSuspended"
        class="pointer-events-none fixed inset-0 z-[550] flex items-center justify-center p-6"
      >
        <div
          class="pointer-events-auto flex max-w-[min(100%,22rem)] flex-col items-center gap-3 rounded-xl border border-border bg-overlay-heavy px-5 py-4 text-center shadow-lg backdrop-blur-md"
        >
          <p class="text-sm font-medium text-fg">
            Preview paused to save CPU and battery
          </p>
          <p class="text-xs leading-snug text-fg-subtle">
            You are still sharing. Click anywhere or use the button to show your
            preview again.
          </p>
          <button
            type="button"
            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            @click.stop="bumpPreviewActivity"
          >
            Show preview
          </button>
        </div>
      </div>
      <Transition name="controls-fade">
        <div
          v-show="showControls"
          class="pointer-events-none fixed inset-0 p-6"
        >
          <div
            class="pointer-events-auto absolute bottom-6 left-6 flex max-w-[min(560px,calc(100%-3rem))] flex-wrap items-center gap-3 rounded-xl border border-border bg-scrim-2 px-3 py-2 text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            <PausedGifAvatar
              :src="avatarDisplayUrl"
              :alt="participantName"
              :session-key="participantId ?? participantName"
              img-class="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{
              participantName
            }}</span>
            <span
              v-if="isScreenShare"
              class="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white"
            >
              LIVE
            </span>
            <div
              v-if="remoteStreamVolumeControl"
              class="flex min-w-0 max-w-full shrink-0 items-center gap-2 border-l border-border pl-3"
              @click.stop
              @pointerdown.stop
            >
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg transition-colors hover:bg-glass-hover"
                :aria-label="
                  streamVolumeMuted
                    ? 'Unmute stream audio'
                    : 'Mute stream audio'
                "
                @click="toggleStreamOutputMute"
              >
                <img
                  :src="icons.volumeUp"
                  alt=""
                  class="h-[18px] w-[18px]"
                  :class="streamVolumeMuted ? 'opacity-35' : ''"
                />
              </button>
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                class="fullscreen-stream-overlay__volume h-1.5 w-[min(28vw,140px)] min-w-[100px] cursor-pointer appearance-none rounded-full bg-glass-active accent-emerald-500"
                :value="streamVolumeSliderValue"
                :aria-valuenow="streamVolumeSliderValue"
                aria-valuemin="0"
                aria-valuemax="200"
                aria-label="Stream volume"
                @input="onStreamVolumeRangeInput"
              />
            </div>
          </div>

          <div
            class="pointer-events-auto absolute right-6 top-6 flex items-center gap-2"
          >
            <button
              v-if="pipSupported"
              type="button"
              class="fullscreen-stream-overlay__btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-scrim-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-overlay-heavy"
              aria-label="Picture in picture"
              @click="togglePip"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <rect x="11" y="11" width="9" height="8" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              class="fullscreen-stream-overlay__btn flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-scrim-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-overlay-heavy"
              aria-label="Close fullscreen"
              @click="close"
            >
              <svg
                class="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
      <Teleport to="body">
        <div
          v-if="streamVolumeMenuOpen && remoteStreamVolumeControl"
          ref="streamVolumeMenuRef"
          class="fixed z-[610] min-w-[220px] rounded-lg border border-border bg-[var(--echo-menu-bg)] px-3 py-2 shadow-xl"
          :style="{
            left: `${streamVolumeMenuPos.left}px`,
            top: `${streamVolumeMenuPos.top}px`,
          }"
          role="menu"
          @click.stop
          @pointerdown.stop
          @mousedown.stop
        >
          <p
            class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="h-3.5 w-3.5 opacity-80 filter invert"
            />
            Their volume
          </p>
          <div class="mt-2 flex items-center gap-2">
            <input
              type="range"
              class="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
              min="0"
              max="200"
              step="1"
              :value="streamVolumeMenuDraft"
              aria-label="Participant volume"
              @input="onStreamVolumeMenuInput"
            />
            <span
              class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
            >
              {{ Math.round(streamVolumeMenuDraft) }}%
            </span>
          </div>
        </div>
      </Teleport>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.fullscreen-stream-overlay__video {
  object-fit: contain;
  background-color: black;
}

.controls-fade-enter-active,
.controls-fade-leave-active {
  transition: opacity 0.25s ease;
}

.controls-fade-enter-from,
.controls-fade-leave-to {
  opacity: 0;
}

.fullscreen-stream-overlay__volume {
  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 9999px;
    background: mediumspringgreen;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, black 35%, transparent);
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 9999px;
    background: mediumspringgreen;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, black 35%, transparent);
  }

  &::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 9999px;
    background: color-mix(in srgb, white 20%, transparent);
  }

  &::-moz-range-track {
    height: 6px;
    border-radius: 9999px;
    background: color-mix(in srgb, white 20%, transparent);
  }
}
</style>
