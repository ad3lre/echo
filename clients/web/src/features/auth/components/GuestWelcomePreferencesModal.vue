<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useThemeStore } from '@/features/settings/themeStore';
import {
  THEMES_SELECTION_COMING_SOON,
  THEME_OPTIONS,
} from '@/features/settings/data';
import type {
  EchoActionRailPlacementId,
  EchoThemeId,
} from '@/features/settings/theme';
import ActionRailPlacementVisualPicker from '@/features/layout/ActionRailPlacementVisualPicker.vue';
import { ECHO_GUEST_WELCOME_LAYOUT_STORAGE_KEY } from '@/features/auth/guestWelcomeLayout';

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
        {{ echoT('auth.guestWelcome.title') }}
      </h2>
      <p class="mt-1 text-sm text-fg-soft">
        Pick a theme and where you want the server rail on desktop. You can
        change these anytime in Settings → Appearance.
      </p>
      <p class="mt-2 text-xs text-fg-subtle">
        {{ echoT('auth.guestWelcome.railNote') }}
      </p>

      <div class="mt-6 space-y-6">
        <div class="rounded-2xl border border-border p-4">
          <div
            class="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted"
          >
            {{ echoT('auth.guestWelcome.theme') }}
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
            class="grid min-w-0 grid-cols-2 gap-2 p-1 sm:grid-cols-4 sm:gap-3"
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
              class="guest-theme-card group flex min-w-0 flex-col rounded-xl border-2 text-left transition-[box-shadow,border-color,transform,opacity] duration-200"
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
                class="guest-theme-card-caption flex flex-col items-center justify-center bg-black px-1.5 py-2 text-center sm:px-2 sm:py-2.5"
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
            {{ echoT('auth.guestWelcome.serverRail') }}
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
          {{ echoT('auth.actions.skip') }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          @click="onContinue"
        >
          {{ echoT('auth.actions.continue') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style
  scoped
  lang="scss"
  src="./styles/GuestWelcomePreferencesModal.scss"
></style>
