<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    imageUrl: string;
    positionY: number;
    sessionKey: string;
  }>(),
  { title: 'Reposition banner' },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [positionY: number];
}>();

const open = computed(() => props.modelValue);
const draft = ref(50);

watch(
  () => [open.value, props.positionY] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    const n = Number(props.positionY);
    draft.value = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  },
  { immediate: true },
);

const previewRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
let dragStartClientY = 0;
let dragStartPositionY = 50;
let dragBoxHeight = 1;

const objectPosition = computed(() => `50% ${draft.value}%`);
const safe = computed(() => safeImageUrl(props.imageUrl));

function close() {
  emit('update:modelValue', false);
}

function reset() {
  draft.value = 50;
}

function save() {
  emit('save', draft.value);
  close();
}

function onPointerDown(e: PointerEvent) {
  const el = previewRef.value;
  if (!el) return;
  dragging.value = true;
  dragStartClientY = e.clientY;
  dragStartPositionY = draft.value;
  dragBoxHeight = Math.max(1, el.getBoundingClientRect().height);
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const delta = e.clientY - dragStartClientY;
  const next = dragStartPositionY + (delta / dragBoxHeight) * 100;
  draft.value = Math.max(0, Math.min(100, next));
}

function onPointerUp() {
  dragging.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === 'Escape') close();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[220] flex items-center justify-center bg-overlay-dim backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div
        class="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-[var(--echo-modal-bg-heavy)] shadow-2xl"
      >
        <header class="flex items-center justify-between gap-3 px-5 py-4">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-fg">
              {{ title }}
            </div>
            <div class="mt-0.5 text-xs text-fg-subtle">
              Drag up or down to choose what shows in the cut.
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="close"
          >
            Close
          </button>
        </header>

        <div class="px-5 pb-5">
          <div
            ref="previewRef"
            class="relative isolate h-40 w-full overflow-hidden rounded-xl bg-scrim-1 ring-1 ring-border"
            :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @pointerleave="onPointerUp"
          >
            <LimitedGifImg
              :src="safe"
              :session-key="sessionKey"
              alt=""
              wrapper-class="absolute inset-0 z-0 overflow-hidden"
              img-class="absolute inset-0 block h-full w-full object-cover"
              :img-style="{ objectPosition }"
              :respect-reduced-motion="true"
            />
            <div
              class="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/15 to-black/35"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute inset-0 z-[3]"
              aria-hidden="true"
            >
              <div
                class="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-scrim-2 px-3 py-1 text-[11px] font-semibold text-fg backdrop-blur"
              >
                {{ Math.round(draft) }}%
              </div>
              <div
                class="absolute inset-x-0 top-1/2 h-px bg-glass-10 mix-blend-overlay"
              />
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              class="rounded-xl bg-glass-1 px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-2"
              @click="reset"
            >
              Reset
            </button>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-xl bg-glass-1 px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-2"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
                @click="save"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
