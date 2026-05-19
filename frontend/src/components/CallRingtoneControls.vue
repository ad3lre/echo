<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useCallRingtoneStore } from '@/stores/callRingtone';

withDefaults(
  defineProps<{
    /** `glass`: quarter-call header buttons; `toolbar`: DM fullscreen control bar. */
    variant?: 'glass' | 'toolbar';
  }>(),
  { variant: 'toolbar' },
);

const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const open = ref(false);
const trackPickerOpen = ref(false);
const panelStyle = ref<Record<string, string>>({});

const store = useCallRingtoneStore();
const {
  ringtoneOptionGroups,
  selectedId,
  selectedEntry,
  volumePercent,
  muted,
  ringtoneCanStepBack,
  ringtoneCanStepForward,
} = storeToRefs(store);

const label = computed(() => selectedEntry.value?.label ?? '');

let removeRepositionListeners: (() => void) | null = null;

function syncPanelPosition() {
  const el = triggerRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const panelW = 232;
  const estH = trackPickerOpen.value ? 380 : 220;
  let left = r.left + r.width / 2 - panelW / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - panelW - 10));
  let top = r.bottom + 8;
  if (top + estH > window.innerHeight - 10) {
    top = Math.max(10, r.top - estH - 8);
  }
  panelStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${panelW}px`,
  };
}

function attachRepositionListeners() {
  removeRepositionListeners?.();
  const onReposition = () => syncPanelPosition();
  window.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition);
  removeRepositionListeners = () => {
    window.removeEventListener('scroll', onReposition, true);
    window.removeEventListener('resize', onReposition);
    removeRepositionListeners = null;
  };
}

watch(open, (v) => {
  if (!v) {
    trackPickerOpen.value = false;
    removeRepositionListeners?.();
    return;
  }
  void nextTick(() => {
    syncPanelPosition();
    attachRepositionListeners();
  });
});

watch(trackPickerOpen, () => {
  if (!open.value) return;
  void nextTick(() => syncPanelPosition());
});

function toggleOpen() {
  open.value = !open.value;
}

function onVolumeInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  store.setVolumePercent(v);
}

function toggleTrackPicker() {
  trackPickerOpen.value = !trackPickerOpen.value;
}

function onDocPointerDown(e: MouseEvent) {
  if (!open.value) return;
  const t = e.target as Node | null;
  if (!t) return;
  if (triggerRef.value?.contains(t)) return;
  if (panelRef.value?.contains(t)) return;
  open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
  removeRepositionListeners?.();
});
</script>

<template>
  <div class="call-ringtone-root inline-flex shrink-0">
    <button
      ref="triggerRef"
      type="button"
      class="call-ringtone-trigger relative flex shrink-0 items-center justify-center border-0 transition-colors"
      :class="
        variant === 'glass'
          ? 'dm-call-on-glass-btn'
          : 'call-ringtone-trigger--toolbar'
      "
      title="Ringtone"
      aria-label="Ringtone settings"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="toggleOpen"
    >
      <svg
        class="call-ringtone-bell-icon h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span
        v-if="muted"
        class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-black/40"
        aria-hidden="true"
      />
    </button>

    <Teleport to="body">
      <div
        v-show="open"
        ref="panelRef"
        class="call-ringtone-dropdown fixed z-[300] rounded-xl shadow-xl shadow-black/35 outline-none"
        :style="{
          ...panelStyle,
          backgroundColor:
            'var(--chat-glass-header-bg, rgba(22, 16, 28, 0.96))',
          backdropFilter: 'var(--chat-glass-header-backdrop, blur(14px))',
          WebkitBackdropFilter: 'var(--chat-glass-header-backdrop, blur(14px))',
        }"
        role="dialog"
        aria-label="Ringtone"
        tabindex="-1"
        @pointerdown.stop
      >
        <div class="px-3 pb-3 pt-2.5">
          <div
            class="mb-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            Ringtone
          </div>

          <div class="mb-3 flex items-center gap-1.5">
            <button
              type="button"
              class="call-ringtone-dd-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-soft hover:bg-glass-hover hover:text-white disabled:pointer-events-none disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-soft"
              :title="ringtoneCanStepBack ? 'Previous' : 'First ringtone'"
              :aria-label="
                ringtoneCanStepBack ? 'Previous ringtone' : 'First ringtone'
              "
              :disabled="!ringtoneCanStepBack"
              @click="store.stepRingtone(-1)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              class="call-ringtone-name-btn min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-center text-[13px] font-medium leading-snug text-fg transition-colors hover:bg-glass-hover hover:text-white"
              :title="
                trackPickerOpen
                  ? 'Hide ringtone list'
                  : 'Browse ringtones — click to show list'
              "
              :aria-expanded="trackPickerOpen"
              @click.stop="toggleTrackPicker"
            >
              {{ label }}
            </button>
            <button
              type="button"
              class="call-ringtone-dd-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-soft hover:bg-glass-hover hover:text-white disabled:pointer-events-none disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-soft"
              :title="ringtoneCanStepForward ? 'Next' : 'Last ringtone'"
              :aria-label="
                ringtoneCanStepForward ? 'Next ringtone' : 'Last ringtone'
              "
              :disabled="!ringtoneCanStepForward"
              @click="store.stepRingtone(1)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <Transition name="call-ringtone-slide">
            <div
              v-if="trackPickerOpen && ringtoneOptionGroups.length > 0"
              class="call-ringtone-picker mb-3"
            >
              <ul
                class="call-ringtone-list max-h-[min(220px,42vh)] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5"
                role="listbox"
                aria-label="Ringtones"
              >
                <template
                  v-for="group in ringtoneOptionGroups"
                  :key="group.label"
                >
                  <li
                    class="call-ringtone-pack-label px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle first:pt-0"
                    role="presentation"
                  >
                    {{ group.label }}
                  </li>
                  <li
                    v-for="entry in group.entries"
                    :key="entry.id"
                    role="none"
                  >
                    <button
                      type="button"
                      role="option"
                      class="call-ringtone-list-item flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] leading-snug transition-colors"
                      :class="
                        entry.id === selectedId
                          ? 'bg-glass-active font-medium text-white'
                          : 'text-fg-soft hover:bg-glass-hover hover:text-white'
                      "
                      :aria-selected="entry.id === selectedId"
                      @click="store.setRingtoneById(entry.id)"
                    >
                      {{ entry.label }}
                    </button>
                  </li>
                </template>
              </ul>
            </div>
          </Transition>

          <button
            type="button"
            class="mb-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium transition-colors hover:bg-glass-hover"
            :class="
              muted ? 'text-amber-300/95' : 'text-fg-soft hover:text-fg-soft'
            "
            @click="store.toggleMuted()"
          >
            <svg
              v-if="!muted"
              class="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <svg
              v-else
              class="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            {{ muted ? 'Unmute ringtone' : 'Mute ringtone' }}
          </button>

          <div>
            <div
              class="mb-1.5 flex items-center justify-between text-[10px] font-medium text-fg-subtle"
            >
              <span>Volume</span>
              <span class="tabular-nums text-fg-soft"
                >{{ volumePercent }}%</span
              >
            </div>
            <input
              type="range"
              class="call-ringtone-volume h-1.5 w-full cursor-pointer accent-violet-400"
              min="0"
              max="100"
              :value="volumePercent"
              :aria-valuenow="volumePercent"
              aria-valuemin="0"
              aria-valuemax="100"
              @input="onVolumeInput"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.call-ringtone-bell-icon {
  color: currentColor;
}

.call-ringtone-trigger.dm-call-on-glass-btn {
  color: var(--fg);
}

.call-ringtone-name-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 1px;
}

.call-ringtone-slide-enter-active,
.call-ringtone-slide-leave-active {
  overflow: hidden;
  transition:
    max-height 0.22s ease,
    opacity 0.18s ease;
}
.call-ringtone-slide-enter-from,
.call-ringtone-slide-leave-to {
  max-height: 0;
  opacity: 0;
}
.call-ringtone-slide-enter-to,
.call-ringtone-slide-leave-from {
  max-height: 20rem;
  opacity: 1;
}

.call-ringtone-list {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, white 22%, transparent) transparent;
}
.call-ringtone-list::-webkit-scrollbar {
  width: 6px;
}
.call-ringtone-list::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: color-mix(in srgb, white 20%, transparent);
}

.call-ringtone-list-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 0;
}

.call-ringtone-trigger--toolbar {
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 50%;
  background: var(--vc-ctrl-bg);
  color: var(--fg);
  cursor: pointer;
  &:hover {
    background: var(--vc-ctrl-bg-hover);
    color: var(--text);
  }
}

:global([data-theme='dark'] .call-ringtone-trigger.dm-call-on-glass-btn),
:global([data-theme='dark'] .call-ringtone-trigger--toolbar) {
  color: white;
}
.call-ringtone-dd-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent);
  outline-offset: 1px;
}
.call-ringtone-volume {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  &::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, white 14%, transparent);
  }
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 95%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, black 35%, transparent);
  }
  &::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, white 14%, transparent);
  }
  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 95%, transparent);
  }
}
</style>
