<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { clampMenuToViewport } from '@/features/layout/useContextMenuPosition';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import {
  copyImageFromUrl,
  copyToClipboard,
} from '@/features/chat/copyToClipboard';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { openExternal } from '@/platform/desktopBridge';
import { loadImageViewerPreferences } from '@/features/settings/imageViewerPreferences';

export interface ImageItem {
  url: string;
  isGif?: boolean;
}

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const menuTriggerRef = ref<HTMLElement | null>(null);
const menuPosition = ref({ left: 0, top: 0 });

const menuStyle = computed(() => ({
  left: `${menuPosition.value.left}px`,
  top: `${menuPosition.value.top}px`,
}));

const safeZoom = computed(() => (Number.isFinite(zoom.value) ? zoom.value : 1));
const safePos = computed(() => ({
  x: Number.isFinite(pos.value.x) ? pos.value.x : 0,
  y: Number.isFinite(pos.value.y) ? pos.value.y : 0,
}));

const props = defineProps<{
  modelValue: boolean;
  images: ImageItem[];
  initialIndex?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const currentIndex = ref(0);
const zoom = ref(1);
const pos = ref({ x: 0, y: 0 });
const isDragging = ref(false);

const MAX_PAN = 4000;
/** Pan only when meaningfully zoomed (avoids float edge cases around 1). */
const MIN_ZOOM_FOR_PAN = 1.001;
const dragStart = ref({ x: 0, y: 0, posX: 0, posY: 0 });
/** Pointer id used for active pan (setPointerCapture on `containerRef`). */
const dragPointerId = ref<number | null>(null);
const containerRef = ref<HTMLElement | null>(null);
/** Hit target for click-outside + layout (GIF uses LimitedGifImg; static uses <img>). */
const mediaHitRef = ref<HTMLElement | null>(null);
const didDrag = ref(false);

const currentImage = ref<ImageItem | null>(null);
const canGoPrev = ref(false);
const canGoNext = ref(false);

function updateState() {
  currentImage.value = props.images[currentIndex.value] ?? null;
  canGoPrev.value = currentIndex.value > 0;
  canGoNext.value = currentIndex.value < props.images.length - 1;
}

function goPrev() {
  if (canGoPrev.value) {
    clearPanPointerCapture();
    currentIndex.value--;
    resetZoom();
    updateState();
  }
}

function goNext() {
  if (canGoNext.value) {
    clearPanPointerCapture();
    currentIndex.value++;
    resetZoom();
    updateState();
  }
}

function resetZoom() {
  zoom.value = 1;
  pos.value = { x: 0, y: 0 };
}

function clampPos() {
  const x = Number.isFinite(pos.value.x) ? pos.value.x : 0;
  const y = Number.isFinite(pos.value.y) ? pos.value.y : 0;
  pos.value = {
    x: Math.max(-MAX_PAN, Math.min(MAX_PAN, x)),
    y: Math.max(-MAX_PAN, Math.min(MAX_PAN, y)),
  };
}

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.25, 4);
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.25, 0.25);
  // Drift position towards center when zooming out
  pos.value = {
    x: (Number.isFinite(pos.value.x) ? pos.value.x : 0) * 0.6,
    y: (Number.isFinite(pos.value.y) ? pos.value.y : 0) * 0.6,
  };
  clampPos();
}

function applyPinchZoom(deltaY: number) {
  const prev = zoom.value;
  const next = Math.max(0.25, Math.min(4, prev * Math.exp(-deltaY * 0.002)));
  zoom.value = next;
  if (next < prev) {
    pos.value = {
      x: (Number.isFinite(pos.value.x) ? pos.value.x : 0) * 0.98,
      y: (Number.isFinite(pos.value.y) ? pos.value.y : 0) * 0.98,
    };
  }
  if (next <= 1) {
    pos.value = { x: 0, y: 0 };
  }
  clampPos();
}

function applyWheelPan(deltaX: number, deltaY: number) {
  pos.value = {
    x: (Number.isFinite(pos.value.x) ? pos.value.x : 0) - deltaX,
    y: (Number.isFinite(pos.value.y) ? pos.value.y : 0) - deltaY,
  };
  clampPos();
}

function onWheel(e: WheelEvent) {
  if (!props.modelValue) return;
  e.preventDefault();

  const { wheelScrollPans } = loadImageViewerPreferences();

  if (wheelScrollPans) {
    // Browsers map trackpad pinch to ctrl/meta + wheel; plain two-finger scroll pans.
    if (e.ctrlKey || e.metaKey) {
      applyPinchZoom(e.deltaY);
      return;
    }
    applyWheelPan(e.deltaX, e.deltaY);
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    applyPinchZoom(e.deltaY);
    return;
  }
  if (e.deltaY < 0) zoomIn();
  else if (e.deltaY > 0) zoomOut();
}

function clearPanPointerCapture() {
  const el = containerRef.value;
  const id = dragPointerId.value;
  if (el && id !== null && el.hasPointerCapture(id)) {
    try {
      el.releasePointerCapture(id);
    } catch {
      /* already released */
    }
  }
  dragPointerId.value = null;
  isDragging.value = false;
}

function onContainerPointerDown(e: PointerEvent) {
  if (!props.modelValue) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (safeZoom.value < MIN_ZOOM_FOR_PAN) return;
  const el = containerRef.value;
  if (!el) return;
  didDrag.value = false;
  isDragging.value = true;
  dragPointerId.value = e.pointerId;
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    posX: safePos.value.x,
    posY: safePos.value.y,
  };
  e.preventDefault();
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    clearPanPointerCapture();
  }
}

function onContainerPointerMove(e: PointerEvent) {
  if (!isDragging.value || dragPointerId.value !== e.pointerId) return;
  e.preventDefault();
  didDrag.value = true;
  pos.value = {
    x: dragStart.value.posX + (e.clientX - dragStart.value.x),
    y: dragStart.value.posY + (e.clientY - dragStart.value.y),
  };
  clampPos();
}

function onContainerPointerUp(e: PointerEvent) {
  if (dragPointerId.value !== e.pointerId) return;
  clearPanPointerCapture();
}

function onContainerPointerCancel(e: PointerEvent) {
  if (dragPointerId.value !== e.pointerId) return;
  clearPanPointerCapture();
}

function onContainerLostPointerCapture(e: PointerEvent) {
  if (dragPointerId.value !== e.pointerId) return;
  dragPointerId.value = null;
  isDragging.value = false;
}

function onContainerClick(e: MouseEvent) {
  if (didDrag.value) return;
  const img = mediaHitRef.value;
  if (img) {
    const r = img.getBoundingClientRect();
    if (
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom
    )
      return;
  }
  close();
}

function onContainerDoubleClick() {
  if (safeZoom.value <= 1) {
    zoom.value = 2;
  } else {
    resetZoom();
  }
}

function close() {
  clearPanPointerCapture();
  menuOpen.value = false;
  emit('update:modelValue', false);
}

async function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    await nextTick();
    const rect = menuTriggerRef.value?.getBoundingClientRect();
    if (rect) {
      const estW = 200;
      const estH = 120;
      const left = rect.right - estW;
      const top = rect.bottom + 8;
      menuPosition.value = clampMenuToViewport(left, top, estW, estH);
    }
    await nextTick();
    requestAnimationFrame(() => {
      const el = menuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      menuPosition.value = clampMenuToViewport(
        r.left,
        r.top,
        r.width,
        r.height,
      );
    });
  }
}

function closeMenu() {
  menuOpen.value = false;
}

function handleClickOutside(e: MouseEvent) {
  if (
    menuRef.value?.contains(e.target as Node) ||
    menuTriggerRef.value?.contains(e.target as Node)
  )
    return;
  menuOpen.value = false;
}

async function downloadImage() {
  const img = currentImage.value;
  if (!img?.url) return;
  closeMenu();
  try {
    const res = await fetch(img.url, { mode: 'cors' });
    if (!res.ok) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const ext = img.isGif ? 'gif' : blob.type?.split('/')[1] || 'png';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    void openExternal(img.url);
  }
}

function copyImageLink() {
  const img = currentImage.value;
  if (!img?.url) return;
  closeMenu();
  void copyToClipboard(img.url);
}

async function copyImageToClipboard() {
  const img = currentImage.value;
  if (!img?.url) return;
  const ok = await copyImageFromUrl(img.url);
  closeMenu();
  if (ok) dispatchAppToast('Image copied', 'info');
  else dispatchAppToast('Could not copy image', 'warning');
}

function openInBrowser() {
  const img = currentImage.value;
  if (!img?.url) return;
  closeMenu();
  void openExternal(img.url);
}

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'ArrowRight') goNext();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      menuOpen.value = false;
      currentIndex.value = Math.max(
        0,
        Math.min(props.initialIndex ?? 0, props.images.length - 1),
      );
      resetZoom();
      updateState();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      clearPanPointerCapture();
    }
  },
);

watch(
  () => [props.images, props.initialIndex],
  () => {
    if (props.modelValue) {
      clearPanPointerCapture();
      currentIndex.value = Math.max(
        0,
        Math.min(props.initialIndex ?? 0, props.images.length - 1),
      );
      resetZoom();
      updateState();
    }
  },
);

watch(currentIndex, () => {
  resetZoom();
});

function bindImageViewerWheel(): void {
  document.addEventListener('wheel', onWheel, { passive: false });
}

function unbindImageViewerWheel(): void {
  document.removeEventListener('wheel', onWheel);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) bindImageViewerWheel();
    else unbindImageViewerWheel();
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  clearPanPointerCapture();
  document.body.style.overflow = '';
  unbindImageViewerWheel();
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && images.length > 0"
      class="image-viewer-modal fixed inset-0 z-[200] flex flex-col bg-overlay-ink"
      @click.self="close"
    >
      <!-- Top right: Download, More options, Close -->
      <div
        class="viewer-btn-group absolute top-4 right-4 z-10 flex items-center gap-0.5 rounded-lg px-1 py-1"
      >
        <button
          type="button"
          class="p-2 rounded-full transition-colors"
          aria-label="Download"
          title="Download"
          @click="downloadImage"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>
        <div class="relative">
          <button
            ref="menuTriggerRef"
            type="button"
            class="p-2 rounded-full transition-colors"
            aria-label="More options"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            title="More options"
            @click="toggleMenu"
          >
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
          <Teleport to="body">
            <div
              v-if="menuOpen"
              ref="menuRef"
              class="ellipsis-menu fixed z-[210] min-w-[180px] py-1"
              :style="menuStyle"
            >
              <button
                type="button"
                class="chat-focus-ring w-full rounded-sm px-3 py-2 text-left text-sm text-foreground flex items-center gap-2 hover:bg-glass-hover"
                @click="copyImageToClipboard"
              >
                <svg
                  class="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy image
              </button>
              <button
                type="button"
                class="chat-focus-ring w-full rounded-sm px-3 py-2 text-left text-sm text-foreground flex items-center gap-2 hover:bg-glass-hover"
                @click="copyImageLink"
              >
                <svg
                  class="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Copy image link
              </button>
              <button
                type="button"
                class="chat-focus-ring w-full rounded-sm px-3 py-2 text-left text-sm text-foreground flex items-center gap-2 hover:bg-glass-hover"
                @click="openInBrowser"
              >
                <svg
                  class="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Open in browser
              </button>
            </div>
          </Teleport>
        </div>
        <button
          type="button"
          class="p-2 rounded-full transition-colors"
          aria-label="Close"
          title="Close"
          @click="close"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Prev -->
      <button
        v-if="canGoPrev"
        type="button"
        class="viewer-nav-btn absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-lg"
        aria-label="Previous"
        @click="goPrev"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <!-- Next -->
      <button
        v-if="canGoNext"
        type="button"
        class="viewer-nav-btn absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-lg"
        aria-label="Next"
        @click="goNext"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      <!-- Zoom controls -->
      <div
        class="viewer-zoom-bar absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-lg text-fg"
      >
        <button
          type="button"
          class="p-2 rounded-lg transition-colors"
          aria-label="Zoom out"
          @click="zoomOut"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20 12H4"
            />
          </svg>
        </button>
        <span class="text-sm text-fg-soft min-w-[3rem] text-center"
          >{{ Math.round(safeZoom * 100) }}%</span
        >
        <button
          type="button"
          class="p-2 rounded-lg transition-colors"
          aria-label="Zoom in"
          @click="zoomIn"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      <!-- Counter -->
      <div
        class="viewer-counter absolute top-4 left-4 z-10 px-3 py-1.5 rounded-lg text-sm text-fg"
      >
        {{ currentIndex + 1 }} / {{ images.length }}
      </div>

      <!-- Image container: fills viewport, image fits at 100% zoom (compact) -->
      <div
        ref="containerRef"
        class="viewer-no-drag flex-1 min-h-0 min-w-0 relative overflow-hidden cursor-grab touch-none"
        :class="{ 'cursor-grabbing': isDragging }"
        @pointerdown="onContainerPointerDown"
        @pointermove="onContainerPointerMove"
        @pointerup="onContainerPointerUp"
        @pointercancel="onContainerPointerCancel"
        @lostpointercapture="onContainerLostPointerCapture"
        @click="onContainerClick"
        @dblclick="onContainerDoubleClick"
        @dragstart.prevent
        @drag.prevent
      >
        <div
          v-if="currentImage"
          :key="`img-${currentIndex}-${currentImage.url}`"
          class="viewer-no-drag absolute inset-0 flex items-center justify-center"
          style="transform-origin: center center; will-change: transform"
          :style="{
            transform: `translate3d(${safePos.x}px, ${safePos.y}px, 0) scale(${safeZoom})`,
          }"
          @dragstart.prevent
          @drag.prevent
        >
          <div ref="mediaHitRef" class="inline-block max-w-full max-h-full">
            <LimitedGifImg
              v-if="currentImage.isGif"
              :src="currentImage.url"
              :session-key="`${currentIndex}-${currentImage.url}`"
              alt="GIF"
              wrapper-class="relative inline-block max-w-full max-h-full"
              img-class="img-no-drag viewer-image select-none pointer-events-none"
              :respect-reduced-motion="true"
            />
            <img
              v-else
              :src="currentImage.url"
              alt="Image"
              class="img-no-drag viewer-image select-none pointer-events-none"
              draggable="false"
              @dragstart.prevent
              @drag.prevent
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Block native image drag - our pan is the only drag */
.viewer-no-drag,
.viewer-no-drag *,
.img-no-drag {
  -webkit-user-drag: none !important;
  user-drag: none !important;
  -webkit-user-select: none;
  user-select: none;
}
.img-no-drag {
  pointer-events: none;
}

/* compact: image fits viewport at 100%, preserves aspect ratio */
.viewer-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

/* Match site's dark glass: msg-actions-bar / chat-input style */
.image-viewer-modal .viewer-btn-group,
.image-viewer-modal .viewer-zoom-bar,
.image-viewer-modal .viewer-counter {
  background: var(--vue-auto-069);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  box-shadow: inset 0 1px 0 var(--vue-auto-010);
}

.image-viewer-modal .viewer-btn-group button,
.image-viewer-modal .viewer-zoom-bar button {
  background: transparent;
  border: none;
  color: var(--vue-auto-009);
  transition:
    background 0.15s,
    color 0.15s;
}

.image-viewer-modal .viewer-btn-group button:hover,
.image-viewer-modal .viewer-zoom-bar button:hover {
  background: var(--vue-auto-003);
  color: var(--vue-auto-006);
}

.image-viewer-modal .viewer-btn-group button:active,
.image-viewer-modal .viewer-zoom-bar button:active {
  background: var(--vue-auto-002);
}

/* Prev/next float without a bar - need their own dark glass */
.image-viewer-modal .viewer-nav-btn {
  background: var(--vue-auto-069);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  box-shadow: inset 0 1px 0 var(--vue-auto-010);
  border: none;
  color: var(--vue-auto-009);
  transition:
    background 0.15s,
    color 0.15s;
}

.image-viewer-modal .viewer-nav-btn:hover {
  background: var(--vue-auto-004);
  color: var(--vue-auto-006);
}

.image-viewer-modal .viewer-nav-btn:active {
  background: var(--vue-auto-002);
}
</style>
