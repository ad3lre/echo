<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAuthSessionStore } from '@/stores/authSession';
import { useThemeStore } from '@/stores/theme';
import {
  THEMES_SELECTION_COMING_SOON,
  THEME_OPTIONS,
} from '@/features/settings/data';
import type { EchoActionRailPlacementId, EchoThemeId } from '@/utils/theme';
import ActionRailPlacementVisualPicker from '@/components/ActionRailPlacementVisualPicker.vue';
import { ECHO_GUEST_WELCOME_LAYOUT_STORAGE_KEY } from '@/utils/guestWelcomeLayout';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const auth = useAuthSessionStore();
const themeStore = useThemeStore();
const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const themeLocked = computed(() => THEMES_SELECTION_COMING_SOON);
const themeOptions = THEME_OPTIONS;

const draftTheme = ref<EchoThemeId>(themeStore.theme);
const draftPlacement = ref<EchoActionRailPlacementId>(
  themeStore.actionRailPlacement,
);

const snapshotTheme = ref<EchoThemeId>(themeStore.theme);
const snapshotPlacement = ref<EchoActionRailPlacementId>(
  themeStore.actionRailPlacement,
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    snapshotTheme.value = themeStore.theme;
    snapshotPlacement.value = themeStore.actionRailPlacement;
    draftTheme.value = themeStore.theme;
    draftPlacement.value = themeStore.actionRailPlacement;
  },
);

function themePreviewKind(id: string): 'light' | 'dark' | 'amoled' | 'sunny' {
  if (id === 'Amoled') return 'amoled';
  if (id === 'Sunny') return 'sunny';
  if (id === 'Light') return 'light';
  return 'dark';
}

function themeOptionDisabled(t: { id?: string; disabled?: boolean }): boolean {
  if (themeLocked.value) return true;
  return !!t.disabled;
}

const visuallySelectedTheme = computed(() =>
  themeLocked.value ? draftTheme.value : draftTheme.value,
);

function selectThemeById(id: EchoThemeId): void {
  if (themeLocked.value) return;
  const opt = themeOptions.find((x) => x.id === id);
  if (!opt || themeOptionDisabled(opt)) return;
  draftTheme.value = id;
  themeStore.setTheme(id);
}

function onPlacementChange(next: EchoActionRailPlacementId) {
  draftPlacement.value = next;
  themeStore.setActionRailPlacement(next);
}

const guestUserId = computed(() => auth.backendUser?.id?.trim() ?? '');

function persistDismissed() {
  const uid = guestUserId.value;
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ECHO_GUEST_WELCOME_LAYOUT_STORAGE_KEY, uid);
  } catch {
    /* ignore */
  }
}

function onContinue() {
  if (!themeLocked.value) themeStore.setTheme(draftTheme.value);
  themeStore.setActionRailPlacement(draftPlacement.value);
  persistDismissed();
  emit('update:modelValue', false);
}

function onSkip() {
  if (!themeLocked.value) themeStore.setTheme(snapshotTheme.value);
  themeStore.setActionRailPlacement(snapshotPlacement.value);
  draftTheme.value = snapshotTheme.value;
  draftPlacement.value = snapshotPlacement.value;
  persistDismissed();
  emit('update:modelValue', false);
}

function themeRadioTabIndex(t: { id?: string }): number {
  if (themeOptionDisabled(t)) return -1;
  const enabled = themeOptions.filter((x) => !themeOptionDisabled(x));
  const selected = enabled.find((x) => x.id === visuallySelectedTheme.value);
  const tabStop = selected ?? enabled[0];
  return tabStop?.id === t.id ? 0 : -1;
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[155] flex items-center justify-center bg-overlay-heavy px-4 py-6"
    role="presentation"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-welcome-title"
      class="guest-welcome-modal max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-border bg-[var(--echo-modal-bg)] p-6 shadow-xl"
      @click.stop
    >
      <h2
        id="guest-welcome-title"
        class="text-lg font-semibold text-foreground"
      >
        Welcome — make Echo yours
      </h2>
      <p class="mt-1 text-sm text-fg-soft">
        Pick a theme and where you want the server rail on desktop. You can
        change these anytime in Settings → Appearance.
      </p>
      <p class="mt-2 text-xs text-fg-subtle">
        On small screens the rail stays on the side for easier reach.
      </p>

      <div class="mt-6 space-y-6">
        <div class="rounded-2xl border border-border p-4">
          <div
            class="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted"
          >
            Theme
          </div>
          <p
            v-if="themeLocked"
            class="mb-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-foreground"
          >
            Theme selection is temporarily limited. Layout choice below still
            applies.
          </p>
          <div
            role="radiogroup"
            aria-label="Theme"
            class="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
          >
            <button
              v-for="t in themeOptions"
              :key="t.id"
              type="button"
              role="radio"
              :data-theme-id="t.id"
              :tabindex="themeRadioTabIndex(t)"
              :disabled="themeOptionDisabled(t)"
              :aria-checked="visuallySelectedTheme === t.id"
              :aria-disabled="themeOptionDisabled(t) ? 'true' : undefined"
              class="guest-theme-card group flex min-w-0 flex-col overflow-hidden rounded-xl border-2 text-left transition-[box-shadow,border-color,transform,opacity] duration-200"
              :class="[
                themeOptionDisabled(t)
                  ? 'cursor-not-allowed opacity-45 border-transparent'
                  : visuallySelectedTheme === t.id
                    ? 'guest-theme-card--selected border-[color:var(--accent)]'
                    : 'border-transparent hover:border-border hover:shadow-md',
              ]"
              @click="selectThemeById(t.id as EchoThemeId)"
            >
              <div
                class="guest-theme-card-preview relative flex min-h-[4.5rem] flex-col justify-center gap-1.5 px-2 py-2.5 sm:min-h-[5rem] sm:gap-2 sm:px-3 sm:py-3"
                :class="`guest-theme-card-preview--${themePreviewKind(t.id)}`"
                aria-hidden="true"
              >
                <div
                  class="guest-theme-card-preview__bar guest-theme-card-preview__bar--long"
                />
                <div
                  class="guest-theme-card-preview__bar guest-theme-card-preview__bar--short"
                />
              </div>
              <div
                class="flex flex-col items-center justify-center bg-black px-1.5 py-2 text-center sm:px-2 sm:py-2.5"
              >
                <span
                  class="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-white sm:text-[11px] sm:tracking-[0.12em]"
                >
                  {{ t.id }}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div class="rounded-2xl border border-border p-4">
          <div
            class="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted"
          >
            Server rail (desktop)
          </div>
          <ActionRailPlacementVisualPicker
            :model-value="draftPlacement"
            @update:model-value="onPlacementChange"
          />
        </div>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-fg-soft hover:bg-glass-hover"
          @click="onSkip"
        >
          Skip
        </button>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          @click="onContinue"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.guest-welcome-modal {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--border) 40%, transparent),
    0 24px 48px rgba(0, 0, 0, 0.35);
}

.guest-theme-card-preview {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border-radius: 0.5rem 0.5rem 0 0;
}

.guest-theme-card-preview__bar {
  align-self: flex-start;
  flex-shrink: 0;
  height: 0.3rem;
  max-width: 100%;
  border-radius: 9999px;
}

.guest-theme-card-preview__bar--long {
  width: 88%;
}

.guest-theme-card-preview__bar--short {
  width: 56%;
  opacity: 0.88;
}

.guest-theme-card-preview--light {
  background: #f0f3fa;
  box-shadow: inset 0 0 0 1px rgba(15, 10, 25, 0.09);
}
.guest-theme-card-preview--light .guest-theme-card-preview__bar {
  background: rgba(30, 41, 59, 0.42);
}

.guest-theme-card-preview--dark {
  background: #1a1225;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}
.guest-theme-card-preview--dark .guest-theme-card-preview__bar {
  background: rgba(255, 255, 255, 0.28);
}

.guest-theme-card-preview--amoled {
  background: #050505;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.guest-theme-card-preview--amoled .guest-theme-card-preview__bar {
  background: rgba(255, 255, 255, 0.22);
}

.guest-theme-card-preview--sunny {
  background: #faf3e6;
  box-shadow: inset 0 0 0 1px rgba(120, 80, 30, 0.12);
}
.guest-theme-card-preview--sunny::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 216, 154, 0.22) 0%,
    transparent 55%
  );
}
.guest-theme-card-preview--sunny .guest-theme-card-preview__bar {
  position: relative;
  z-index: 2;
  background: rgba(90, 62, 38, 0.45);
}

.guest-theme-card--selected {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
}

.guest-theme-card:focus-visible {
  outline: 2px solid var(--accent, #6366f1);
  outline-offset: 2px;
}
</style>
