<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useCallRingtoneStore } from '@/features/voice/callRingtone';

withDefaults(
  defineProps<{
    title?: string;
    /** No card border/bg — parent supplies liquid glass. */
    embedded?: boolean;
  }>(),
  {
    title: 'Waiting music',
    embedded: false,
  },
);

const ringtoneStore = useCallRingtoneStore();
const {
  selectedEntry,
  volumePercent,
  muted: ringtoneMuted,
  ringtoneOptionGroups,
  selectedId,
  ringtoneCanStepBack,
  ringtoneCanStepForward,
} = storeToRefs(ringtoneStore);

const sheetOpen = ref(false);

watch(sheetOpen, (open, _, onCleanup) => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') sheetOpen.value = false;
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));
});

function onRingtoneVolumeInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  ringtoneStore.setVolumePercent(v);
}

function openRingtoneSheet() {
  if ((ringtoneOptionGroups.value?.length ?? 0) < 1) return;
  sheetOpen.value = true;
}

function pickRingtone(id: string) {
  ringtoneStore.setRingtoneById(id);
  sheetOpen.value = false;
}
</script>

<template>
  <div
    class="call-ringtone-inline rounded-xl px-3 py-2"
    :class="
      embedded
        ? 'call-ringtone-inline--embedded'
        : 'border border-border bg-glass-1'
    "
  >
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <p class="truncate text-[12px] font-semibold text-fg">
          {{ title }}
        </p>
        <button
          type="button"
          class="call-ringtone-inline__name max-w-full truncate border-0 bg-transparent p-0 text-left text-[11px] text-fg-soft transition-colors hover:text-fg"
          :disabled="(ringtoneOptionGroups?.length ?? 0) < 1"
          :title="
            (ringtoneOptionGroups?.length ?? 0) > 0
              ? 'Choose ringtone'
              : 'No ringtones available'
          "
          :aria-expanded="sheetOpen"
          aria-haspopup="dialog"
          @click.stop="openRingtoneSheet"
        >
          {{ selectedEntry?.label ?? 'Ringtone' }}
        </button>
      </div>
      <button
        type="button"
        class="call-ringtone-inline__ctrl"
        :title="ringtoneCanStepBack ? 'Previous ringtone' : 'First ringtone'"
        :aria-label="
          ringtoneCanStepBack ? 'Previous ringtone' : 'First ringtone'
        "
        :disabled="!ringtoneCanStepBack"
        @click="ringtoneStore.stepRingtone(-1)"
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
        class="call-ringtone-inline__ctrl"
        :class="{ 'call-ringtone-inline__ctrl--on': ringtoneMuted }"
        :title="ringtoneMuted ? 'Unmute ringtone' : 'Mute ringtone'"
        aria-label="Mute ringtone"
        @click="ringtoneStore.toggleMuted()"
      >
        <img
          :src="icons.volumeUp"
          alt=""
          class="call-ringtone-inline__icon h-4 w-4"
          :class="{ 'call-ringtone-inline__icon--off': ringtoneMuted }"
        />
      </button>
      <button
        type="button"
        class="call-ringtone-inline__ctrl"
        :title="ringtoneCanStepForward ? 'Next ringtone' : 'Last ringtone'"
        :aria-label="ringtoneCanStepForward ? 'Next ringtone' : 'Last ringtone'"
        :disabled="!ringtoneCanStepForward"
        @click="ringtoneStore.stepRingtone(1)"
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
    <div class="mt-2 flex items-center gap-2">
      <span class="w-10 shrink-0 text-[10px] text-fg-subtle">Vol</span>
      <input
        type="range"
        class="call-ringtone-inline__range h-1.5 w-full cursor-pointer"
        min="0"
        max="100"
        :value="volumePercent"
        @input="onRingtoneVolumeInput"
      />
      <span
        class="w-10 shrink-0 text-right text-[10px] tabular-nums text-fg-soft"
      >
        {{ volumePercent }}%
      </span>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="call-ringtone-inline-sheet">
      <div
        v-if="sheetOpen"
        class="call-ringtone-inline-sheet-root fixed inset-0 z-[320]"
      >
        <button
          type="button"
          class="call-ringtone-inline-sheet-scrim-btn absolute inset-0 border-0 bg-black/50 backdrop-blur-[1px]"
          aria-label="Close ringtone picker"
          @click="sheetOpen = false"
        />
        <div
          class="call-ringtone-inline-sheet-panel pointer-events-auto absolute bottom-0 left-0 right-0 z-[1] mx-auto w-full max-w-lg rounded-t-2xl border border-b-0 border-border bg-[var(--echo-dm-inset-bg)] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Choose ringtone"
          @click.stop
        >
          <div
            class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-glass-3"
            aria-hidden="true"
          />
          <div class="px-4 pb-3 pt-3">
            <div
              class="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
            >
              Ringtone
            </div>
            <ul
              class="call-ringtone-inline-sheet-list max-h-[min(52vh,320px)] space-y-0.5 overflow-y-auto overscroll-contain pr-0.5"
              role="listbox"
              aria-label="Ringtones"
            >
              <template
                v-for="group in ringtoneOptionGroups"
                :key="group.label"
              >
                <li
                  class="call-ringtone-inline-sheet-pack px-0.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle first:pt-0"
                  role="presentation"
                >
                  {{ group.label }}
                </li>
                <li v-for="entry in group.entries" :key="entry.id" role="none">
                  <button
                    type="button"
                    role="option"
                    class="call-ringtone-inline-sheet-item flex w-full items-center rounded-lg px-2.5 py-2.5 text-left text-[13px] leading-snug transition-colors"
                    :class="
                      entry.id === selectedId
                        ? 'bg-glass-active font-medium text-foreground'
                        : 'text-fg-soft hover:bg-glass-hover hover:text-foreground'
                    "
                    :aria-selected="entry.id === selectedId"
                    @click="pickRingtone(entry.id)"
                  >
                    {{ entry.label }}
                  </button>
                </li>
              </template>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.call-ringtone-inline--embedded {
  border: none;
  background: transparent;
}

.call-ringtone-inline__ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, white 8%, transparent);
  color: white;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
  cursor: pointer;
}

.call-ringtone-inline__ctrl:hover {
  background: color-mix(in srgb, white 14%, transparent);
  transform: scale(1.05);
}

.call-ringtone-inline__ctrl:active {
  transform: scale(0.97);
}

.call-ringtone-inline__ctrl:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  transform: none;
}

.call-ringtone-inline__ctrl:disabled:hover {
  background: color-mix(in srgb, white 8%, transparent);
  transform: none;
}

.call-ringtone-inline__ctrl--on {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}

.call-ringtone-inline__icon {
  filter: invert(1);
}

.call-ringtone-inline__icon--off {
  filter: invert(0.4) sepia(0.85) saturate(5) hue-rotate(330deg);
}

.call-ringtone-inline__range {
  accent-color: color-mix(in srgb, var(--accent) 75%, white 10%);
}

.call-ringtone-inline__name:disabled {
  cursor: default;
  opacity: 0.65;
}

.call-ringtone-inline__name:not(:disabled) {
  cursor: pointer;
}

.call-ringtone-inline__name:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.call-ringtone-inline-sheet-list {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, white 22%, transparent) transparent;
}

.call-ringtone-inline-sheet-list::-webkit-scrollbar {
  width: 6px;
}

.call-ringtone-inline-sheet-list::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: color-mix(in srgb, white 20%, transparent);
}

.call-ringtone-inline-sheet-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 0;
}

.call-ringtone-inline-sheet-enter-active,
.call-ringtone-inline-sheet-leave-active {
  transition: opacity 0.22s ease;
}

.call-ringtone-inline-sheet-enter-from,
.call-ringtone-inline-sheet-leave-to {
  opacity: 0;
}

.call-ringtone-inline-sheet-enter-active .call-ringtone-inline-sheet-panel,
.call-ringtone-inline-sheet-leave-active .call-ringtone-inline-sheet-panel {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

.call-ringtone-inline-sheet-enter-from .call-ringtone-inline-sheet-panel,
.call-ringtone-inline-sheet-leave-to .call-ringtone-inline-sheet-panel {
  transform: translateY(100%);
}
</style>
