<script setup lang="ts">
import type { RemoteTrack } from 'livekit-client';
import {
  ref,
  computed,
  watch,
  watchEffect,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
} from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import {
  clearHtmlVideoElement,
  mediaStreamFromLiveKitTrack,
} from '@/utils/livekitTrackMediaStream';
import { echoPlaybackRegisterTrackElement } from '@/services/livekit/echoRemotePlaybackWebAudio';
import { useLocalScreenSharePreviewSuspend } from '@/composables/useLocalScreenSharePreviewSuspend';
import { useLiveKitTrackSurfaceGeneration } from '@/composables/useLiveKitTrackSurfaceGeneration';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';

type LocalTrackLike = {
  mediaStreamTrack?: MediaStreamTrack;
  track?: MediaStreamTrack;
};

const props = defineProps<{
  track: RemoteTrack | LocalTrackLike | null;
  participantName: string;
  participantPfp?: string;
  /** Echo user id — used for hi-res / fallback avatar when video track is not ready. */
  participantId?: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
  isFocused?: boolean;
  /** Mirror horizontally (typical for local camera preview). */
  mirrorVideo?: boolean;
  /** Video scaling inside the tile (`cover` fits small circular docks). */
  fitVideo?: 'contain' | 'cover';
  /** Hide the bottom name/pfp strip (parent UI provides labels). */
  hideParticipantBar?: boolean;
  /** When true, do not open the built-in stream menu — parent handles context menu (e.g. CallView). */
  delegateContextMenu?: boolean;
  /**
   * When true, show output volume for this remote participant (mic + stream audio via LiveKit).
   * Parent should pass {@link remoteStreamVolumePercent} and handle {@link remoteStreamVolumeChange}.
   */
  remoteStreamVolumeControl?: boolean;
  /** Current remote output level 0–200 (from LiveKit / voice session). */
  remoteStreamVolumePercent?: number;
}>();

type StreamLayerQuality = 'high' | 'medium' | 'low';

const emit = defineEmits<{
  (e: 'request-focus'): void;
  (e: 'request-fullscreen'): void;
  (e: 'remoteStreamVolumeChange', v: number): void;
  /** Fires once remote video playback is wired for per-user volume (muxed stream audio / GainNode). */
  (e: 'remoteVideoPlaybackWired', participantId: string): void;
  (
    e: 'auto-stream-layer-quality',
    payload: { participantId: string; quality: StreamLayerQuality },
  ): void;
  (
    e: 'manual-stream-layer-quality',
    payload: { participantId: string; quality: StreamLayerQuality },
  ): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const tileRootRef = ref<HTMLElement | null>(null);
const hasAttachedVideoStream = ref(false);

/**
 * Screen-share tiles: hide the avatar/name/LIVE strip on narrow touch viewports so
 * the stream stays readable (CallView / fullscreen widgets).
 */
const streamShareHideUserChrome = ref(false);
let streamShareViewportCleanup: (() => void) | null = null;

function updateStreamShareHideUserChrome() {
  if (typeof window === 'undefined') return;
  if (!props.isScreenShare) {
    streamShareHideUserChrome.value = false;
    return;
  }
  const narrow = window.innerWidth < 600;
  const touchLike =
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  streamShareHideUserChrome.value = narrow && touchLike;
}

watch(
  () => props.isScreenShare,
  () => {
    updateStreamShareHideUserChrome();
  },
  { immediate: true },
);

const localScreenSharePreviewSuspendEnabled = computed(
  () => !!(props.isLocal && props.isScreenShare && props.track),
);

const { previewSuspended, bumpPreviewActivity } =
  useLocalScreenSharePreviewSuspend({
    enabled: localScreenSharePreviewSuspendEnabled,
  });

const trackSurfaceGeneration = useLiveKitTrackSurfaceGeneration(
  () => props.track,
);

/** Dedupe {@link emit} when watchEffect re-runs without a new track/attachment. */
let lastRemotePlaybackWireKey = '';

watchEffect(() => {
  void trackSurfaceGeneration.value;
  const el = videoRef.value;
  const t = props.track;
  if (!el) return;
  if (!t) {
    clearHtmlVideoElement(el);
    hasAttachedVideoStream.value = false;
    lastRemotePlaybackWireKey = '';
    return;
  }
  if (props.isLocal && props.isScreenShare && previewSuspended.value) {
    clearHtmlVideoElement(el);
    hasAttachedVideoStream.value = false;
    lastRemotePlaybackWireKey = '';
    return;
  }
  const ms = mediaStreamFromLiveKitTrack(t, { kind: 'video' });
  if (ms && el.srcObject !== ms) {
    el.srcObject = ms;
    hasAttachedVideoStream.value = true;
  } else if (!ms) {
    clearHtmlVideoElement(el);
    hasAttachedVideoStream.value = false;
    lastRemotePlaybackWireKey = '';
  } else {
    hasAttachedVideoStream.value = true;
  }
  const pid = props.participantId?.trim();
  if (!props.isLocal && pid && hasAttachedVideoStream.value && el.srcObject) {
    const sid = (t as { sid?: string }).sid ?? '';
    const wireKey = `${pid}:${sid}`;
    if (
      echoPlaybackRegisterTrackElement(t, el) &&
      wireKey !== lastRemotePlaybackWireKey
    ) {
      lastRemotePlaybackWireKey = wireKey;
      emit('remoteVideoPlaybackWired', pid);
    }
  }
});

function onLocalScreenSharePointerdown() {
  if (!localScreenSharePreviewSuspendEnabled.value) return;
  bumpPreviewActivity();
}

onBeforeUnmount(() => {
  clearHtmlVideoElement(videoRef.value);
  hasAttachedVideoStream.value = false;
});

function onRequestFullscreen() {
  emit('request-fullscreen');
}

const avatarDisplayUrl = computed(() =>
  resolveCallTileAvatarUrl(
    props.participantPfp,
    props.participantId?.trim() ?? '',
  ),
);

function onTileDoubleClick() {
  emit('request-focus');
}

const qualityMenuOpen = ref(false);
const qualityMenuPos = ref({ left: 0, top: 0 });
type StreamQuality = StreamLayerQuality;
const selectedQuality = ref<StreamQuality>('high');

const shouldAutoStreamLayer = computed(
  () => !props.isLocal && !!props.participantId?.trim() && !!props.track,
);

let lastAutoEmittedQuality: StreamLayerQuality | null = null;

watchEffect((onCleanup) => {
  if (!shouldAutoStreamLayer.value) {
    lastAutoEmittedQuality = null;
    return;
  }
  const el = tileRootRef.value;
  if (!el) return;

  const run = () => {
    const w = el.getBoundingClientRect().width;
    if (w < 8) return;
    const q: StreamLayerQuality =
      w <= 320 ? 'low' : w <= 960 ? 'medium' : 'high';
    if (q === lastAutoEmittedQuality) return;
    lastAutoEmittedQuality = q;
    selectedQuality.value = q;
    const pid = props.participantId?.trim() ?? '';
    if (!pid) return;
    emit('auto-stream-layer-quality', { participantId: pid, quality: q });
  };

  const ro = new ResizeObserver(() => run());
  ro.observe(el);
  run();
  onCleanup(() => {
    ro.disconnect();
  });
});

const QUALITY_LABELS: Record<StreamQuality, string> = {
  high: 'High (Source)',
  medium: 'Medium',
  low: 'Low',
};

function onContextMenu(e: MouseEvent) {
  if (props.isLocal) return;
  if (props.delegateContextMenu) {
    /** Parent (e.g. CallView) handles menu; kill native video/context UI. */
    e.preventDefault();
    return;
  }
  e.preventDefault();
  closePfpOutputVolumeMenu();
  qualityMenuPos.value = { left: e.clientX, top: e.clientY };
  qualityMenuOpen.value = true;
}

function selectQuality(q: StreamQuality) {
  selectedQuality.value = q;
  qualityMenuOpen.value = false;
  const pid = props.participantId?.trim() ?? '';
  if (!props.isLocal && pid) {
    emit('manual-stream-layer-quality', { participantId: pid, quality: q });
  }
}

function closeQualityMenu() {
  qualityMenuOpen.value = false;
}

const pipSupported = computed(
  () => typeof document !== 'undefined' && document.pictureInPictureEnabled,
);

const streamVolumeSliderValue = computed(
  () => props.remoteStreamVolumePercent ?? 100,
);

const lastNonZeroStreamVolume = ref(100);

watch(
  streamVolumeSliderValue,
  (v) => {
    if (v > 0) lastNonZeroStreamVolume.value = v;
  },
  { immediate: true },
);

const streamVolumeMuted = computed(
  () =>
    !!props.remoteStreamVolumeControl &&
    !props.isLocal &&
    streamVolumeSliderValue.value <= 0,
);

const streamVolumeHover = ref(false);
const streamVolumeFocusWithin = ref(false);

const streamVolumeSliderExpanded = computed(
  () => streamVolumeHover.value || streamVolumeFocusWithin.value,
);

function onStreamVolumeControlFocusIn() {
  streamVolumeFocusWithin.value = true;
}

function onStreamVolumeControlFocusOut(e: FocusEvent) {
  const root = e.currentTarget;
  const next = e.relatedTarget;
  if (
    root instanceof HTMLElement &&
    next instanceof Node &&
    root.contains(next)
  ) {
    return;
  }
  streamVolumeFocusWithin.value = false;
}

function toggleStreamVolumeMute() {
  if (!props.remoteStreamVolumeControl || props.isLocal) return;
  if (streamVolumeSliderValue.value <= 0) {
    const restore =
      lastNonZeroStreamVolume.value > 0 ? lastNonZeroStreamVolume.value : 100;
    emit('remoteStreamVolumeChange', restore);
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

const pfpOutputMenuOpen = ref(false);
const pfpOutputMenuPos = ref({ left: 0, top: 0 });
const pfpOutputMenuRef = ref<HTMLElement | null>(null);
const pfpOutputMenuDraft = ref(100);

function closePfpOutputVolumeMenu() {
  pfpOutputMenuOpen.value = false;
}

function onRemotePfpContextMenu(e: MouseEvent) {
  if (!props.remoteStreamVolumeControl || props.isLocal) return;
  e.stopPropagation();
  openPfpOutputVolumeMenu(e);
}

function openPfpOutputVolumeMenu(e: MouseEvent) {
  if (!props.remoteStreamVolumeControl || props.isLocal) return;
  e.preventDefault();
  e.stopPropagation();
  closeQualityMenu();
  const cur = streamVolumeSliderValue.value;
  pfpOutputMenuDraft.value = cur;
  pfpOutputMenuPos.value = clampMenuToViewport(e.clientX, e.clientY, 220, 120);
  pfpOutputMenuOpen.value = true;
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = pfpOutputMenuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      pfpOutputMenuPos.value = clampMenuToViewport(
        r.left,
        r.top,
        r.width,
        r.height,
      );
    });
  });
}

function onPfpOutputVolumeInput(ev: Event) {
  if (!props.remoteStreamVolumeControl) return;
  const raw = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const v = Math.max(0, Math.min(200, Math.round(raw)));
  pfpOutputMenuDraft.value = v;
  if (v > 0) lastNonZeroStreamVolume.value = v;
  emit('remoteStreamVolumeChange', v);
}

watch(streamVolumeSliderValue, (v) => {
  if (!pfpOutputMenuOpen.value) return;
  pfpOutputMenuDraft.value = v;
});

function onDocPointerDown(e: MouseEvent) {
  const path = e.composedPath();
  if (
    path.some(
      (n) =>
        n instanceof HTMLElement &&
        n.classList?.contains('stream-quality-menu'),
    )
  ) {
    return;
  }
  const volRoot = pfpOutputMenuRef.value;
  if (volRoot && path.includes(volRoot)) return;
  closeQualityMenu();
  closePfpOutputVolumeMenu();
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
    /* not supported or denied */
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocPointerDown, true);
  updateStreamShareHideUserChrome();
  window.addEventListener('resize', updateStreamShareHideUserChrome);
  const mqNarrow = window.matchMedia?.('(max-width: 599px)');
  const mqCoarse = window.matchMedia?.('(pointer: coarse)');
  const onMq = () => updateStreamShareHideUserChrome();
  mqNarrow?.addEventListener('change', onMq);
  mqCoarse?.addEventListener('change', onMq);
  streamShareViewportCleanup = () => {
    window.removeEventListener('resize', updateStreamShareHideUserChrome);
    mqNarrow?.removeEventListener('change', onMq);
    mqCoarse?.removeEventListener('change', onMq);
    streamShareViewportCleanup = null;
  };
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocPointerDown, true);
  streamShareViewportCleanup?.();
});
</script>

<template>
  <div
    ref="tileRootRef"
    class="stream-video-tile group relative h-full min-h-0 w-full cursor-default overflow-hidden rounded-xl border border-border bg-[var(--bg)] transition-[box-shadow,border-color] duration-200"
    :title="hideParticipantBar ? participantName : undefined"
    :class="{
      'ring-2 ring-violet-500/50 border-violet-400/30': isFocused,
    }"
    @dblclick="onTileDoubleClick"
    @contextmenu="onContextMenu"
    @pointerdown="onLocalScreenSharePointerdown"
  >
    <video
      v-show="hasAttachedVideoStream"
      ref="videoRef"
      class="stream-video-tile__video absolute inset-0 z-0 h-full w-full"
      :class="[
        fitVideo === 'cover' ? 'object-cover' : 'object-contain',
        { 'scale-x-[-1]': mirrorVideo },
      ]"
      autoplay
      playsinline
      :muted="!!isLocal"
    />

    <div
      v-if="!hasAttachedVideoStream"
      class="stream-video-tile__loading absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-[var(--bg)]"
      aria-busy="true"
    >
      <div class="relative" @contextmenu="onRemotePfpContextMenu">
        <PausedGifAvatar
          :src="avatarDisplayUrl"
          :alt="participantName"
          :session-key="participantId ?? participantName"
          img-class="h-28 w-28 rounded-full object-cover ring-2 ring-border"
        />
      </div>
      <div class="stream-video-tile__loading-dot" aria-hidden="true" />
    </div>

    <div
      v-if="isLocal && isScreenShare"
      class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-4"
    >
      <div
        v-if="previewSuspended && track"
        class="pointer-events-auto flex max-w-[min(100%,22rem)] flex-col items-center gap-3 rounded-xl border border-border bg-overlay-heavy px-5 py-4 text-center shadow-lg backdrop-blur-md"
      >
        <p class="text-sm font-medium text-fg">
          Preview paused to save CPU and battery
        </p>
        <p class="text-xs leading-snug text-fg-subtle">
          You are still sharing — others still see your screen. Click anywhere
          on this tile or use the button below to show your preview again.
        </p>
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          @click.stop="bumpPreviewActivity"
        >
          Show preview
        </button>
      </div>
      <p
        v-else
        class="max-w-[90%] rounded-lg bg-scrim-2 px-4 py-2 text-center text-sm font-medium text-fg backdrop-blur-sm"
      >
        You are sharing your screen
      </p>
    </div>

    <div
      v-if="!hideParticipantBar && !streamShareHideUserChrome"
      class="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-end"
    >
      <div
        class="stream-video-tile__bar inline-flex max-w-[min(100%,240px)] min-w-0 flex-nowrap items-center gap-2 rounded-lg border border-border px-2 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
      >
        <div
          class="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-border"
          @contextmenu="onRemotePfpContextMenu"
        >
          <PausedGifAvatar
            :src="avatarDisplayUrl"
            :alt="participantName"
            :session-key="participantId ?? participantName"
            unavailable-variant="avatar"
            wrapper-class="relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-full"
          />
        </div>
        <span
          class="min-w-0 truncate text-[13px] leading-none text-fg"
          :title="participantName"
        >
          {{ participantName }}
        </span>
        <span
          v-if="isScreenShare"
          class="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white"
        >
          LIVE
        </span>
      </div>
    </div>

    <div
      class="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-1.5"
    >
      <div
        v-if="remoteStreamVolumeControl && !isLocal"
        class="stream-video-tile__vol-ctrl pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center rounded-full bg-scrim-2 pr-0.5 opacity-100 shadow-lg backdrop-blur-sm transition-[max-width,padding] duration-200 ease-out"
        :class="
          streamVolumeSliderExpanded ? 'max-w-[11.5rem] pl-2' : 'max-w-9 pl-0'
        "
        @mouseenter="streamVolumeHover = true"
        @mouseleave="streamVolumeHover = false"
        @focusin="onStreamVolumeControlFocusIn"
        @focusout="onStreamVolumeControlFocusOut"
        @click.stop
        @pointerdown.stop
      >
        <input
          type="range"
          class="stream-video-tile__vol-range h-1 shrink-0 cursor-pointer appearance-none rounded-full bg-glass-active accent-emerald-400 transition-[width,opacity,margin] duration-200 ease-out pointer-coarse:!mr-1.5 pointer-coarse:!w-[min(28vw,88px)] pointer-coarse:!opacity-100"
          :class="
            streamVolumeSliderExpanded
              ? 'stream-video-tile__vol-range--expanded mr-1.5 w-[min(28vw,96px)] opacity-100'
              : 'stream-video-tile__vol-range--collapsed pointer-coarse:stream-video-tile__vol-range--expanded'
          "
          min="0"
          max="200"
          step="1"
          :value="streamVolumeSliderValue"
          :aria-valuenow="streamVolumeSliderValue"
          aria-valuemin="0"
          aria-valuemax="200"
          aria-label="Stream volume"
          @input="onStreamVolumeRangeInput"
        />
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-overlay-heavy focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          :aria-label="
            streamVolumeMuted ? 'Unmute stream audio' : 'Mute stream audio'
          "
          :aria-expanded="streamVolumeSliderExpanded"
          @click.stop="toggleStreamVolumeMute"
          @dblclick.stop
        >
          <img
            :src="streamVolumeMuted ? icons.notificationsOff : icons.volumeUp"
            alt=""
            class="h-[18px] w-[18px] brightness-0 invert"
            :class="streamVolumeMuted ? 'opacity-90' : ''"
            aria-hidden="true"
          />
        </button>
      </div>
      <button
        v-if="pipSupported && track"
        type="button"
        class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-scrim-2 text-white opacity-0 shadow-lg backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-overlay-heavy group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Picture in picture"
        @click.stop="togglePip"
        @dblclick.stop
      >
        <svg
          class="h-[18px] w-[18px]"
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
        class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-scrim-2 text-white opacity-0 shadow-lg backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-overlay-heavy group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Fullscreen"
        @click.stop="onRequestFullscreen"
        @dblclick.stop
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="pfpOutputMenuOpen && remoteStreamVolumeControl && !isLocal"
        ref="pfpOutputMenuRef"
        class="stream-tile-output-vol-menu fixed z-[400] min-w-[220px] rounded-lg border border-border bg-[var(--echo-menu-bg)] px-3 py-2 shadow-xl"
        :style="{
          left: `${pfpOutputMenuPos.left}px`,
          top: `${pfpOutputMenuPos.top}px`,
        }"
        role="menu"
        @click.stop
        @pointerdown.stop
        @mousedown.stop
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-gray-100">
            {{ participantName }}
          </p>
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
        </div>
        <div class="mt-2 flex items-center gap-2">
          <input
            type="range"
            class="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
            min="0"
            max="200"
            step="1"
            :value="pfpOutputMenuDraft"
            aria-label="Participant volume"
            @input="onPfpOutputVolumeInput"
          />
          <span
            class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
            >{{ Math.round(pfpOutputMenuDraft) }}%</span
          >
        </div>
      </div>
    </Teleport>

    <!-- Right-click stream menu -->
    <Teleport to="body">
      <div
        v-if="qualityMenuOpen && !isLocal"
        class="stream-quality-menu fixed z-[400] rounded-lg border border-border bg-[var(--echo-menu-bg)] py-1 shadow-xl"
        :class="remoteStreamVolumeControl ? 'min-w-[220px]' : 'min-w-[180px]'"
        :style="{
          left: `${qualityMenuPos.left}px`,
          top: `${qualityMenuPos.top}px`,
        }"
        role="menu"
        @click.stop
      >
        <div
          v-if="remoteStreamVolumeControl"
          class="border-b border-border px-3 py-2"
          @pointerdown.stop
        >
          <div
            class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="h-3.5 w-3.5 opacity-80 filter invert"
            />
            Their volume
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              type="range"
              class="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
              min="0"
              max="200"
              step="1"
              :value="streamVolumeSliderValue"
              aria-label="Participant volume"
              @input="onStreamVolumeRangeInput"
            />
            <span
              class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
              >{{ Math.round(streamVolumeSliderValue) }}%</span
            >
          </div>
        </div>
        <div
          class="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
        >
          Stream Quality
        </div>
        <button
          v-for="(label, key) in QUALITY_LABELS"
          :key="key"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          :class="
            selectedQuality === key
              ? 'text-indigo-300 bg-indigo-500/10'
              : 'text-gray-200 hover:bg-glass-hover'
          "
          role="menuitem"
          @click="selectQuality(key as StreamQuality)"
        >
          <span
            class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
            :class="
              selectedQuality === key
                ? 'border-indigo-400 bg-indigo-500'
                : 'border-border bg-transparent'
            "
          >
            <span
              v-if="selectedQuality === key"
              class="block h-1.5 w-1.5 rounded-full bg-white"
            />
          </span>
          {{ label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.stream-video-tile__bar {
  background: color-mix(in srgb, black 50%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.stream-video-tile__vol-range--collapsed {
  width: 0;
  min-width: 0;
  margin-right: 0;
  opacity: 0;
  pointer-events: none;
}

.stream-video-tile__vol-range {
  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    background: mediumspringgreen;
    border: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, black 35%, transparent);
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    background: mediumspringgreen;
    border: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, black 35%, transparent);
  }

  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: color-mix(in srgb, white 22%, transparent);
  }

  &::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: color-mix(in srgb, white 22%, transparent);
  }
}

.stream-video-tile__loading-dot {
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  animation: stream-video-tile-pulse 2s ease-in-out infinite;
}

@keyframes stream-video-tile-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.05);
  }
}
</style>
