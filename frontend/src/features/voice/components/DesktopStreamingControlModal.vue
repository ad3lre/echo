<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import type { DesktopStreamingPreferences } from '@/composables/useLiveKitVoiceRoom';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

const props = defineProps<{
  modelValue: boolean;
  mode: 'screen' | 'camera';
  settings: DesktopStreamingPreferences;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (
    e: 'confirm',
    payload: {
      mode: 'screen' | 'camera';
      settings: DesktopStreamingPreferences;
    },
  ): void;
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const screenQuality =
  ref<DesktopStreamingPreferences['screenQuality']>('720p30');
const screenContentHint =
  ref<DesktopStreamingPreferences['screenContentHint']>('detail');
const screenIncludeAudio = ref(true);
const cameraQuality = ref<DesktopStreamingPreferences['cameraQuality']>('720p');

const title = computed(() =>
  props.mode === 'screen' ? 'Go Live: Screen Share' : 'Start Camera Stream',
);
const subtitle = computed(() =>
  props.mode === 'screen'
    ? 'Tune quality before opening the native capture picker.'
    : 'Choose camera quality before publishing your video.',
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    screenQuality.value = props.settings.screenQuality;
    screenContentHint.value = props.settings.screenContentHint;
    screenIncludeAudio.value = props.settings.screenIncludeAudio;
    cameraQuality.value = props.settings.cameraQuality;
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

function onConfirm() {
  const next: DesktopStreamingPreferences = {
    screenQuality: screenQuality.value,
    screenContentHint: screenContentHint.value,
    screenIncludeAudio: screenIncludeAudio.value,
    cameraQuality: cameraQuality.value,
  };
  emit('confirm', { mode: props.mode, settings: next });
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="desktop-stream-modal">
      <div
        v-if="modelValue"
        class="desktop-stream-overlay fixed inset-0 z-[560] flex items-center justify-center px-4 py-8"
        tabindex="-1"
        @click.self="close"
        @keydown.esc="close"
      >
        <div
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          aria-labelledby="desktop-stream-modal-title"
          class="desktop-stream-panel relative w-full max-w-xl overflow-hidden rounded-2xl p-6 text-foreground outline-none"
        >
          <div class="mb-6 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2
                id="desktop-stream-modal-title"
                class="text-xl font-bold leading-tight"
              >
                {{ title }}
              </h2>
              <p class="mt-1 text-sm text-[var(--muted)]">
                {{ subtitle }}
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
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div v-if="mode === 'screen'" class="space-y-5">
            <section class="stream-card">
              <h3 class="stream-card-title">Capture source</h3>
              <p class="stream-card-copy">
                You will pick a display or window in the next native capture
                dialog.
              </p>
            </section>

            <section class="stream-card">
              <h3 class="stream-card-title">Quality preset</h3>
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="stream-option"
                  :class="{
                    'stream-option--active': screenQuality === '1080p60',
                  }"
                  @click="screenQuality = '1080p60'"
                >
                  <span class="font-semibold">1080p · 60 FPS</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Highest motion quality</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{
                    'stream-option--active': screenQuality === '720p30',
                  }"
                  @click="screenQuality = '720p30'"
                >
                  <span class="font-semibold">720p · 30 FPS</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Balanced default</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{
                    'stream-option--active': screenQuality === '720p15',
                  }"
                  @click="screenQuality = '720p15'"
                >
                  <span class="font-semibold">720p · 15 FPS</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Slides and coding</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{ 'stream-option--active': screenQuality === 'auto' }"
                  @click="screenQuality = 'auto'"
                >
                  <span class="font-semibold">Auto</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Adaptive quality</span
                  >
                </button>
              </div>
            </section>

            <section class="stream-card">
              <h3 class="stream-card-title">Optimize for</h3>
              <div
                class="inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
              >
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all"
                  :class="
                    screenContentHint === 'motion'
                      ? 'bg-[var(--glass-tint)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  "
                  @click="screenContentHint = 'motion'"
                >
                  Motion
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all"
                  :class="
                    screenContentHint === 'detail'
                      ? 'bg-[var(--glass-tint)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  "
                  @click="screenContentHint = 'detail'"
                >
                  Detail
                </button>
              </div>
            </section>

            <section class="stream-card">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="stream-card-title">System audio</h3>
                  <p class="stream-card-copy">
                    Include desktop or app audio in your stream when supported.
                  </p>
                </div>
                <button
                  type="button"
                  class="stream-switch relative h-7 w-12 rounded-full border border-[var(--border)]"
                  :class="
                    screenIncludeAudio
                      ? 'bg-indigo-600/90 border-indigo-500/60'
                      : 'bg-[var(--glass-tint)]'
                  "
                  role="switch"
                  :aria-checked="screenIncludeAudio"
                  @click="screenIncludeAudio = !screenIncludeAudio"
                >
                  <span
                    class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                    :class="
                      screenIncludeAudio
                        ? 'translate-x-[1.625rem]'
                        : 'translate-x-0'
                    "
                  />
                </button>
              </div>
              <p
                v-if="
                  echoSyncCapabilities.browser
                    .prefersScreenShareAudioDisabledByDefault
                "
                class="mt-2 text-xs text-[var(--muted)]"
              >
                This environment may disable system audio by default for some
                capture sources.
              </p>
            </section>
          </div>

          <div v-else class="space-y-5">
            <section class="stream-card">
              <h3 class="stream-card-title">Camera quality</h3>
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="stream-option"
                  :class="{ 'stream-option--active': cameraQuality === '720p' }"
                  @click="cameraQuality = '720p'"
                >
                  <span class="font-semibold">720p</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Best overall clarity</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{ 'stream-option--active': cameraQuality === '480p' }"
                  @click="cameraQuality = '480p'"
                >
                  <span class="font-semibold">480p</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Lower bandwidth</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{ 'stream-option--active': cameraQuality === '360p' }"
                  @click="cameraQuality = '360p'"
                >
                  <span class="font-semibold">360p</span>
                  <span class="text-xs text-[var(--muted)]"
                    >Light CPU/GPU load</span
                  >
                </button>
                <button
                  type="button"
                  class="stream-option"
                  :class="{ 'stream-option--active': cameraQuality === '180p' }"
                  @click="cameraQuality = '180p'"
                >
                  <span class="font-semibold">180p</span>
                  <span class="text-xs text-[var(--muted)]">Fallback mode</span>
                </button>
              </div>
            </section>
          </div>

          <div
            class="mt-7 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-5"
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
              class="rounded-lg bg-indigo-600/90 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              @click="onConfirm"
            >
              {{ mode === 'screen' ? 'Start sharing' : 'Start camera' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.desktop-stream-overlay {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.desktop-stream-panel {
  box-shadow: 0 8px 60px var(--vue-auto-013);
  background-color: var(--vue-auto-015);
  border: 1px solid color-mix(in srgb, white 11%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.stream-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 12px;
}

.stream-card-title {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

.stream-card-copy {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.stream-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  text-align: left;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}

.stream-option:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.stream-option--active {
  border-color: color-mix(in srgb, var(--accent) 62%, transparent);
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}

.desktop-stream-modal-enter-active,
.desktop-stream-modal-leave-active {
  transition: opacity 0.2s ease;
}

.desktop-stream-modal-enter-from,
.desktop-stream-modal-leave-to {
  opacity: 0;
}
</style>
