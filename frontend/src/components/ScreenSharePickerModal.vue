<script setup lang="ts">
/**
 * Shown only when `VITE_SCREEN_SHARE_CONFIG_MODAL=true` (e.g. future native app).
 * Browser builds skip this and use `SCREEN_SHARE_BROWSER_DEFAULTS` in `screenShareUi.ts`.
 */
import { ref, toRef, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (
    e: 'confirm',
    opts: {
      quality: '1080p60' | '720p30' | '720p15' | 'auto';
      audio: boolean;
      contentHint: 'motion' | 'detail';
    },
  ): void;
}>();

type Quality = '1080p60' | '720p30' | '720p15' | 'auto';

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

/** Default: Auto → 1080p @ 30fps (see `useLiveKitVoiceRoom.startScreenShare`). */
const quality = ref<Quality>('auto');
const contentHint = ref<'motion' | 'detail'>('detail');
const includeAudio = ref(true);

const QUALITY_SELECT_OPTIONS: {
  value: Quality;
  label: string;
}[] = [
  { value: 'auto', label: 'Auto — 1080p · 30fps (recommended)' },
  { value: '1080p60', label: '1080p · 60fps' },
  { value: '720p30', label: '720p · 30fps' },
  { value: '720p15', label: '720p · 15fps (text & slides)' },
];

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      quality.value = 'auto';
      contentHint.value = 'detail';
      includeAudio.value =
        !echoSyncCapabilities.browser.prefersScreenShareAudioDisabledByDefault;
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

function onConfirm() {
  emit('confirm', {
    quality: quality.value,
    audio: includeAudio.value,
    contentHint: contentHint.value,
  });
  emit('update:modelValue', false);
}

function toggleAudio() {
  includeAudio.value = !includeAudio.value;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="screen-share-modal">
      <div
        v-if="modelValue"
        class="screen-share-overlay fixed inset-0 z-[500] flex items-center justify-center px-4 py-8"
        tabindex="-1"
        @click.self="close"
        @keydown.esc="close"
      >
        <div
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          aria-labelledby="screen-share-modal-title"
          class="screen-share-panel real-glass-modal relative w-full max-w-md overflow-hidden rounded-xl p-6 text-foreground outline-none"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2
                id="screen-share-modal-title"
                class="text-lg font-bold leading-tight tracking-tight"
              >
                Share your screen
              </h2>
              <p class="mt-1 text-sm text-[var(--muted)]">
                Choose quality and whether to capture system audio.
              </p>
            </div>
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--glass-tint)] hover:text-[var(--text)]"
              aria-label="Close"
              @click="close"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-6 space-y-5">
            <div>
              <label
                id="screen-share-quality-label"
                class="settings-label text-[var(--muted)]"
                for="screen-share-quality"
              >
                Quality
              </label>
              <select
                id="screen-share-quality"
                v-model="quality"
                class="screen-share-select mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--text)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25"
                aria-describedby="screen-share-quality-hint"
              >
                <option
                  v-for="opt in QUALITY_SELECT_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <p
                id="screen-share-quality-hint"
                class="mt-2 text-xs leading-relaxed text-[var(--muted)]"
              >
                Auto targets 1080p at 30fps. Pick a preset to force a specific
                resolution and frame rate.
              </p>
            </div>

            <div>
              <span
                id="screen-share-hint-label"
                class="settings-label text-[var(--muted)]"
              >
                Optimize for
              </span>
              <div
                class="mt-2 inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
                role="group"
                aria-labelledby="screen-share-hint-label"
              >
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  :class="
                    contentHint === 'motion'
                      ? 'bg-[var(--glass-tint)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  "
                  @click="contentHint = 'motion'"
                >
                  Motion
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  :class="
                    contentHint === 'detail'
                      ? 'bg-[var(--glass-tint)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  "
                  @click="contentHint = 'detail'"
                >
                  Detail
                </button>
              </div>
              <p class="mt-2 text-xs text-[var(--muted)]">
                Motion favors smooth video; detail sharpens text and UI.
              </p>
            </div>

            <div
              class="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
            >
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <div
                  class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--glass-tint)] text-[var(--accent)]"
                  aria-hidden="true"
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                    />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-[var(--text)]">
                    System audio
                  </div>
                  <p class="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                    Include sound from the window, tab, or display you select
                    next (when the browser allows it).
                  </p>
                  <p
                    v-if="
                      echoSyncCapabilities.browser
                        .prefersScreenShareAudioDisabledByDefault
                    "
                    class="mt-1 text-xs leading-snug text-[var(--muted)]"
                  >
                    This browser may not offer system audio for every share
                    source, so audio starts off disabled by default.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="includeAudio"
                class="screen-share-audio-switch relative h-7 w-12 shrink-0 rounded-full border border-[var(--border)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
                :class="
                  includeAudio
                    ? 'bg-indigo-600/90 border-indigo-500/50'
                    : 'bg-[var(--glass-tint)]'
                "
                @click="toggleAudio"
              >
                <span
                  class="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
                  :class="
                    includeAudio ? 'translate-x-[1.625rem]' : 'translate-x-0'
                  "
                />
              </button>
            </div>
          </div>

          <div
            class="mt-8 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-5"
          >
            <button
              type="button"
              class="rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--glass-tint)] hover:text-[var(--text)]"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-indigo-600/90 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              @click="onConfirm"
            >
              Share screen
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.settings-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.screen-share-overlay {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}

.screen-share-select {
  appearance: auto;
  cursor: pointer;
}

.screen-share-modal-enter-active,
.screen-share-modal-leave-active {
  transition: opacity 0.2s ease;
}

.screen-share-modal-enter-from,
.screen-share-modal-leave-to {
  opacity: 0;
}

.screen-share-modal-enter-active .screen-share-panel {
  transition:
    transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1),
    opacity 0.22s ease;
}

.screen-share-modal-leave-active .screen-share-panel {
  transition:
    transform 0.16s ease-in,
    opacity 0.16s ease;
}

.screen-share-modal-enter-from .screen-share-panel {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

.screen-share-modal-leave-to .screen-share-panel {
  opacity: 0;
  transform: scale(0.98) translateY(4px);
}
</style>
