<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  youtubeGoLiveDescriptionPlaceholder,
  youtubeGoLiveModalSubtitle,
  youtubeGoLiveModalTitle,
  youtubeGoLiveStreamKeyModalHint,
  youtubeGoLiveThumbnailHint,
  youtubeStageStreamKeyLiveHint,
} from '@/features/youtube/youtubeIntegrationCopy';

export type YoutubeGoLivePrivacy = 'public' | 'unlisted' | 'private';

export type YoutubeGoLiveConfirmPayload = {
  title: string;
  description: string;
  privacyStatus: YoutubeGoLivePrivacy;
};

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    busy?: boolean;
    usesStreamKeyDelivery?: boolean;
    youtubeChannelTitle?: string | null;
    youtubeChannelThumbnailUrl?: string | null;
    /** Fallback art when no channel thumbnail (e.g. lobby hero). */
    fallbackThumbnailUrl?: string;
    initialTitle?: string;
    initialDescription?: string;
    initialPrivacy?: YoutubeGoLivePrivacy;
  }>(),
  {
    busy: false,
    usesStreamKeyDelivery: false,
    youtubeChannelTitle: null,
    youtubeChannelThumbnailUrl: null,
    fallbackThumbnailUrl: '',
    initialTitle: '',
    initialDescription: '',
    initialPrivacy: 'unlisted',
  },
);

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  confirm: [payload: YoutubeGoLiveConfirmPayload];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const draftTitle = ref('');
const draftDescription = ref('');
const draftPrivacy = ref<YoutubeGoLivePrivacy>('unlisted');
const customThumbnailPreview = ref<string | null>(null);
const thumbnailInputRef = ref<HTMLInputElement | null>(null);
const titleInputRef = ref<HTMLInputElement | null>(null);

const PRIVACY_OPTIONS: {
  value: YoutubeGoLivePrivacy;
  label: string;
  description: string;
}[] = [
  {
    value: 'unlisted',
    label: 'Unlisted',
    description: 'Anyone with the link can watch',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Listed on your channel and in search',
  },
  {
    value: 'private',
    label: 'Private',
    description: 'Only you and people you invite',
  },
];

const privacyDropdownOptions = PRIVACY_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

const selectedPrivacyMeta = computed(
  () =>
    PRIVACY_OPTIONS.find((o) => o.value === draftPrivacy.value) ??
    PRIVACY_OPTIONS[0]!,
);

const linkedThumbnailUrl = computed(() => {
  const raw = props.youtubeChannelThumbnailUrl?.trim();
  return raw ? safeImageUrl(raw) : '';
});

const previewThumbnailUrl = computed(
  () =>
    customThumbnailPreview.value ||
    linkedThumbnailUrl.value ||
    props.fallbackThumbnailUrl?.trim() ||
    '',
);

const showThumbnailPicker = computed(() => !props.usesStreamKeyDelivery);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      if (customThumbnailPreview.value) {
        URL.revokeObjectURL(customThumbnailPreview.value);
        customThumbnailPreview.value = null;
      }
      return;
    }
    draftTitle.value = props.initialTitle ?? '';
    draftDescription.value = props.initialDescription ?? '';
    draftPrivacy.value = props.initialPrivacy ?? 'unlisted';
    void nextTick(() => titleInputRef.value?.focus());
  },
);

function close() {
  emit('update:modelValue', false);
}

function onConfirm() {
  emit('confirm', {
    title: draftTitle.value.trim(),
    description: draftDescription.value.trim(),
    privacyStatus: draftPrivacy.value,
  });
}

function onThumbnailPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (customThumbnailPreview.value) {
    URL.revokeObjectURL(customThumbnailPreview.value);
  }
  customThumbnailPreview.value = URL.createObjectURL(file);
  (e.target as HTMLInputElement).value = '';
}

function clearCustomThumbnail() {
  if (customThumbnailPreview.value) {
    URL.revokeObjectURL(customThumbnailPreview.value);
    customThumbnailPreview.value = null;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="stage-youtube-go-live-modal">
      <div
        v-if="modelValue"
        class="stage-youtube-go-live-overlay fixed inset-0 z-[500] flex items-center justify-center px-4 py-8"
        tabindex="-1"
        @click.self="close"
        @keydown.esc="close"
      >
        <form
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stage-youtube-go-live-title"
          class="stage-youtube-go-live-panel real-glass-modal relative w-full max-w-lg overflow-hidden rounded-2xl text-foreground outline-none"
          @submit.prevent="onConfirm"
        >
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-red-600/25 via-red-950/10 to-transparent"
            aria-hidden="true"
          />

          <div class="relative p-6 sm:p-7">
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-start gap-3">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-950/50"
                  aria-hidden="true"
                >
                  <img :src="icons.youtube" alt="" class="h-6 w-6" />
                </div>
                <div class="min-w-0">
                  <h2
                    id="stage-youtube-go-live-title"
                    class="text-lg font-bold leading-tight tracking-tight"
                  >
                    {{ youtubeGoLiveModalTitle() }}
                  </h2>
                  <p class="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    {{ youtubeGoLiveModalSubtitle() }}
                  </p>
                </div>
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

            <div
              v-if="usesStreamKeyDelivery"
              class="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm leading-relaxed text-amber-100/90"
            >
              {{ youtubeGoLiveStreamKeyModalHint() }}
              <span class="mt-1 block text-xs text-amber-100/70">
                {{ youtubeStageStreamKeyLiveHint() }}
              </span>
            </div>

            <div
              v-else-if="youtubeChannelTitle"
              class="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]"
            >
              <span
                class="font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                >Channel</span
              >
              <span class="truncate font-medium text-[var(--text)]">{{
                youtubeChannelTitle
              }}</span>
            </div>

            <div class="mt-6 space-y-5">
              <div
                class="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div class="relative aspect-video w-full bg-[#0b0a10]">
                  <img
                    v-if="previewThumbnailUrl"
                    :src="previewThumbnailUrl"
                    alt=""
                    class="h-full w-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--muted)]"
                  >
                    <img
                      :src="icons.youtube"
                      alt=""
                      class="h-10 w-10 opacity-40"
                    />
                    <span class="text-xs">Stream preview</span>
                  </div>
                  <div
                    class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10"
                  >
                    <p class="truncate text-sm font-semibold text-white">
                      {{ draftTitle.trim() || 'Untitled stream' }}
                    </p>
                    <p
                      v-if="youtubeChannelTitle && !usesStreamKeyDelivery"
                      class="truncate text-xs text-white/70"
                    >
                      {{ youtubeChannelTitle }}
                    </p>
                  </div>
                </div>
                <div
                  v-if="showThumbnailPicker"
                  class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3"
                >
                  <p
                    class="min-w-0 flex-1 text-xs leading-relaxed text-[var(--muted)]"
                  >
                    {{ youtubeGoLiveThumbnailHint() }}
                  </p>
                  <div class="flex shrink-0 items-center gap-2">
                    <input
                      ref="thumbnailInputRef"
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      @change="onThumbnailPick"
                    />
                    <button
                      v-if="customThumbnailPreview"
                      type="button"
                      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--glass-tint)] hover:text-[var(--text)]"
                      @click="clearCustomThumbnail"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--glass-tint)]"
                      @click="thumbnailInputRef?.click()"
                    >
                      Preview image
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label
                  for="stage-youtube-go-live-title-input"
                  class="stage-youtube-field-label"
                >
                  Title
                </label>
                <input
                  id="stage-youtube-go-live-title-input"
                  ref="titleInputRef"
                  v-model="draftTitle"
                  type="text"
                  maxlength="100"
                  placeholder="What are you streaming?"
                  class="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20"
                />
                <p
                  class="mt-1.5 text-right text-[11px] tabular-nums text-[var(--muted)]"
                >
                  {{ draftTitle.length }}/100
                </p>
              </div>

              <div>
                <label
                  for="stage-youtube-go-live-description"
                  class="stage-youtube-field-label"
                >
                  Description
                </label>
                <textarea
                  id="stage-youtube-go-live-description"
                  v-model="draftDescription"
                  rows="3"
                  maxlength="5000"
                  :placeholder="youtubeGoLiveDescriptionPlaceholder()"
                  class="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--text)] outline-none transition focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div v-if="!usesStreamKeyDelivery">
                <EchoDropdown
                  v-model="draftPrivacy"
                  label="Privacy"
                  :options="privacyDropdownOptions"
                  teleport-menu
                />
                <p class="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  {{ selectedPrivacyMeta.description }}
                </p>
              </div>
            </div>

            <div
              class="mt-8 flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-end"
            >
              <button
                type="button"
                class="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--glass-tint)] hover:text-[var(--text)]"
                :disabled="busy"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-950/30 transition hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:opacity-50"
                :disabled="busy"
              >
                <span
                  v-if="busy"
                  class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Go live on YouTube
              </button>
            </div>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.stage-youtube-field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.stage-youtube-go-live-overlay {
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

.stage-youtube-go-live-modal-enter-active,
.stage-youtube-go-live-modal-leave-active {
  transition: opacity 0.2s ease;
}

.stage-youtube-go-live-modal-enter-from,
.stage-youtube-go-live-modal-leave-to {
  opacity: 0;
}

.stage-youtube-go-live-modal-enter-active .stage-youtube-go-live-panel {
  transition:
    transform 0.24s cubic-bezier(0.34, 1.2, 0.64, 1),
    opacity 0.22s ease;
}

.stage-youtube-go-live-modal-leave-active .stage-youtube-go-live-panel {
  transition:
    transform 0.16s ease-in,
    opacity 0.16s ease;
}

.stage-youtube-go-live-modal-enter-from .stage-youtube-go-live-panel {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

.stage-youtube-go-live-modal-leave-to .stage-youtube-go-live-panel {
  opacity: 0;
  transform: scale(0.98) translateY(4px);
}
</style>
