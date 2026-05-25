<script setup lang="ts">
import { computed, watch } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { THEMES_SELECTION_COMING_SOON } from '@/features/settings/data';
import {
  normalizeInterfaceDensityId,
  type EchoActionRailPlacementId,
  type EchoThemeId,
} from '@/utils/theme';
import ActionRailPlacementVisualPicker from '@/components/ActionRailPlacementVisualPicker.vue';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

interface ThemeOption {
  id: string;
  disabled?: boolean;
}

interface DensityOption {
  id: string;
  desc: string;
}

const props = defineProps<{
  form: SettingsForm;
  themeOptions: ThemeOption[];
  densityOptions: DensityOption[];
  echoPlan?: 'free' | 'plus' | 'black';
}>();

const themeStore = useThemeStore();

const styleSettingsLocked = computed(() => THEMES_SELECTION_COMING_SOON);

/** While themes are gated, OS sync is off in the UI even if still stored for later. */
const syncWithSystemShownOn = computed(
  () =>
    !styleSettingsLocked.value &&
    !!props.form.styleSettings.syncThemeWithSystem,
);

/** The theme currently shown as selected in the UI. When syncing with system, this reflects the resolved theme. */
const visuallySelectedTheme = computed<EchoThemeId>(() => {
  if (styleSettingsLocked.value) return props.form.theme as EchoThemeId;
  if (props.form.styleSettings.syncThemeWithSystem) {
    return themeStore.resolvedTheme;
  }
  return props.form.theme as EchoThemeId;
});

function themeOptionDisabled(t: { id?: string; disabled?: boolean }): boolean {
  if (styleSettingsLocked.value) {
    return true;
  }
  return !!t.disabled;
}

/**
 * Miniature uses scoped canonical hexes from themes.css (light / dark / AMOLED),
 * not live CSS variables, so previews stay honest inside the settings shell.
 */
function themePreviewKind(id: string): 'light' | 'dark' | 'amoled' | 'sunny' {
  if (id === 'Amoled') return 'amoled';
  if (id === 'Sunny') return 'sunny';
  if (id === 'Light') return 'light';
  return 'dark';
}

function themeRadioTabIndex(t: { id?: string }): number {
  if (themeOptionDisabled(t)) return -1;
  const enabled = props.themeOptions.filter((x) => !themeOptionDisabled(x));
  const selected = enabled.find((x) => x.id === visuallySelectedTheme.value);
  const tabStop = selected ?? enabled[0];
  return tabStop?.id === t.id ? 0 : -1;
}

function selectThemeById(id: EchoThemeId): void {
  if (styleSettingsLocked.value) return;
  const opt = props.themeOptions.find((x) => x.id === id);
  if (!opt || themeOptionDisabled(opt)) return;
  props.form.theme = id;
}

function onThemeRadioKeydown(ev: KeyboardEvent, index: number): void {
  const group = (ev.currentTarget as HTMLElement).closest(
    '[role="radiogroup"]',
  );
  if (!group) return;

  const radios = Array.from(
    group.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
  const enabledIndices = radios
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.getAttribute('aria-disabled') !== 'true');

  const move = (delta: number) => {
    const pos = enabledIndices.findIndex(({ i }) => i === index);
    if (pos < 0) return;
    const next =
      enabledIndices[
        (pos + delta + enabledIndices.length) % enabledIndices.length
      ];
    const id = next.el.dataset.themeId as EchoThemeId | undefined;
    if (id) {
      selectThemeById(id);
      next.el.focus();
    }
  };

  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
    ev.preventDefault();
    move(1);
  } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    move(-1);
  } else if (ev.key === 'Home') {
    ev.preventDefault();
    const first = enabledIndices[0];
    if (first) {
      const id = first.el.dataset.themeId as EchoThemeId | undefined;
      if (id) {
        selectThemeById(id);
        first.el.focus();
      }
    }
  } else if (ev.key === 'End') {
    ev.preventDefault();
    const last = enabledIndices[enabledIndices.length - 1];
    if (last) {
      const id = last.el.dataset.themeId as EchoThemeId | undefined;
      if (id) {
        selectThemeById(id);
        last.el.focus();
      }
    }
  }
}

watch(
  () => props.form.theme,
  (next: string) => {
    if (styleSettingsLocked.value) return;
    /* Always apply: same id + OS sync on still left the DOM on dark while form showed Light. */
    themeStore.setTheme(next as EchoThemeId);
  },
);

watch(
  () => props.form.styleSettings.syncThemeWithSystem,
  (next: boolean) => {
    if (styleSettingsLocked.value) return;
    if (next !== themeStore.syncWithSystem) themeStore.setSyncWithSystem(next);
  },
);

watch(
  () => props.form.styleSettings.saturateAccents,
  (next: boolean) => {
    if (styleSettingsLocked.value) return;
    if (next !== themeStore.vibrantAccents) themeStore.setVibrantAccents(next);
  },
);

watch(
  () => props.form.density,
  (next: string) => {
    if (styleSettingsLocked.value) return;
    const id = normalizeInterfaceDensityId(next);
    if (id !== themeStore.interfaceDensity) themeStore.setInterfaceDensity(id);
  },
);

watch(
  () => themeStore.interfaceDensity,
  (next) => {
    if (styleSettingsLocked.value) return;
    if (props.form.density !== next) props.form.density = next;
  },
);

watch(
  () => props.form.actionRailPlacement,
  (next: string) => {
    const id: EchoActionRailPlacementId = next === 'top' ? 'top' : 'left';
    if (id !== themeStore.actionRailPlacement)
      themeStore.setActionRailPlacement(id);
  },
);

watch(
  () => themeStore.actionRailPlacement,
  (next) => {
    if (props.form.actionRailPlacement !== next)
      props.form.actionRailPlacement = next;
  },
);

/** Keep settings form toggle in sync when the store clears OS sync (e.g. after picking a theme). */
watch(
  () => themeStore.syncWithSystem,
  (next) => {
    if (styleSettingsLocked.value) return;
    if (props.form.styleSettings.syncThemeWithSystem !== next) {
      props.form.styleSettings.syncThemeWithSystem = next;
    }
  },
);

/** Keep Vibrant Accents toggle aligned with persisted DOM/theme store (e.g. ThemeLab, hydration). */
watch(
  () => themeStore.vibrantAccents,
  (next) => {
    if (styleSettingsLocked.value) return;
    if (props.form.styleSettings.saturateAccents !== next) {
      props.form.styleSettings.saturateAccents = next;
    }
  },
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="theme-selection-panel rounded-2xl border border-border p-5">
      <div
        class="theme-selection-panel__label-chip mb-5 inline-flex rounded-lg px-3 py-1.5"
      >
        <h2
          id="theme-selection-heading"
          class="theme-selection-panel__label-text"
        >
          Theme selection
        </h2>
      </div>
      <p
        v-if="styleSettingsLocked"
        class="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-foreground"
      >
        Style customization is
        <span class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
          >coming soon</span
        >
        for everyone.
      </p>
      <div
        role="radiogroup"
        aria-labelledby="theme-selection-heading"
        class="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      >
        <button
          v-for="(t, themeIndex) in themeOptions"
          :key="t.id"
          type="button"
          role="radio"
          :data-theme-id="t.id"
          :tabindex="themeRadioTabIndex(t)"
          :disabled="themeOptionDisabled(t)"
          :aria-checked="visuallySelectedTheme === t.id"
          :aria-disabled="themeOptionDisabled(t) ? 'true' : undefined"
          class="theme-card group flex min-w-0 flex-col overflow-hidden rounded-xl border-2 text-left transition-[box-shadow,border-color,transform,opacity] duration-200"
          :class="[
            themeOptionDisabled(t)
              ? 'cursor-not-allowed opacity-45 border-transparent'
              : visuallySelectedTheme === t.id
                ? 'theme-card--selected border-[color:var(--accent)]'
                : 'border-transparent hover:border-border hover:shadow-md',
          ]"
          @click="selectThemeById(t.id as EchoThemeId)"
          @keydown="onThemeRadioKeydown($event, themeIndex)"
        >
          <div
            class="theme-card-preview relative flex min-h-[5.25rem] flex-col justify-center gap-2 px-3 py-3"
            :class="`theme-card-preview--${themePreviewKind(t.id)}`"
            aria-hidden="true"
          >
            <div
              class="theme-card-preview__bar theme-card-preview__bar--long"
            />
            <div
              class="theme-card-preview__bar theme-card-preview__bar--short"
            />
          </div>
          <div
            class="theme-card-caption flex flex-col items-center justify-center bg-black px-2 py-2.5 text-center"
          >
            <span
              class="text-[11px] font-bold uppercase leading-tight tracking-[0.12em] text-white"
            >
              {{ t.id }}
            </span>
            <span
              v-if="themeOptionDisabled(t) && !styleSettingsLocked"
              class="theme-card-caption__sub mt-0.5 text-[9px] font-semibold uppercase tracking-wide"
            >
              Plus
            </span>
          </div>
        </button>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="settings-card rounded-2xl p-6">
        <div class="settings-label mb-4">Action rail (desktop)</div>
        <p class="mb-4 text-sm text-muted">
          Compact phone and tablet layouts always keep the rail on the side.
        </p>
        <ActionRailPlacementVisualPicker
          :model-value="form.actionRailPlacement"
          @update:model-value="
            (v: EchoActionRailPlacementId) => (form.actionRailPlacement = v)
          "
        />
      </div>

      <div class="settings-card rounded-2xl p-6">
        <div class="settings-label mb-4">Interface Density</div>
        <div class="flex flex-col gap-3">
          <button
            v-for="d in densityOptions"
            :key="d.id"
            type="button"
            :disabled="styleSettingsLocked"
            class="density-row flex items-center justify-between p-4 rounded-xl transition-all border border-transparent"
            :class="
              styleSettingsLocked
                ? 'cursor-not-allowed opacity-50 bg-scrim-1'
                : form.density === d.id
                  ? 'bg-indigo-500/10 border-indigo-500/30'
                  : 'bg-scrim-1 hover:bg-glass-1'
            "
            @click="!styleSettingsLocked && (form.density = d.id)"
          >
            <div class="text-left">
              <div class="text-sm font-bold text-foreground">{{ d.id }}</div>
              <div class="text-xs text-muted mt-0.5">{{ d.desc }}</div>
            </div>
            <div
              class="h-5 w-5 rounded-full border-2 border-border flex items-center justify-center"
              :class="{ 'border-indigo-500': form.density === d.id }"
            >
              <div
                v-if="form.density === d.id"
                class="h-2.5 w-2.5 rounded-full bg-indigo-500"
              ></div>
            </div>
          </button>
        </div>
      </div>

      <div class="settings-card rounded-2xl p-6">
        <div class="settings-label mb-4">Appearance Settings</div>
        <div class="flex flex-col gap-3">
          <button
            type="button"
            class="settings-toggle"
            :class="[
              styleSettingsLocked ? 'cursor-not-allowed opacity-50' : '',
            ]"
            :disabled="styleSettingsLocked"
            @click="
              !styleSettingsLocked &&
              (form.styleSettings.syncThemeWithSystem =
                !form.styleSettings.syncThemeWithSystem)
            "
          >
            <span
              ><span class="block text-sm font-semibold text-foreground"
                >Sync with system</span
              ><span class="block text-sm text-muted text-left">{{
                styleSettingsLocked
                  ? 'Coming soon — style settings are temporarily unavailable for everyone.'
                  : 'Match your OS light/dark mode.'
              }}</span></span
            >
            <span
              :class="
                syncWithSystemShownOn
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
          <button
            type="button"
            class="settings-toggle"
            :class="[
              styleSettingsLocked ? 'cursor-not-allowed opacity-50' : '',
            ]"
            :disabled="styleSettingsLocked"
            @click="
              !styleSettingsLocked &&
              (form.styleSettings.saturateAccents =
                !form.styleSettings.saturateAccents)
            "
          >
            <span
              ><span class="block text-sm font-semibold text-foreground"
                >Vibrant Accents</span
              ><span class="block text-sm text-muted text-left"
                >Stronger accent, mention, and ping colors across the app.</span
              ></span
            >
            <span
              :class="
                form.styleSettings.saturateAccents
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Canonical preview fills — keep aligned with frontend/src/assets/themes.css */

.theme-selection-panel {
  background: var(--elevated);
  /* Fallback when `color-mix` is unsupported or flaky (older WebKit). */
  box-shadow: inset 0 0 0 1px var(--border);
}

@supports (color: color-mix(in srgb, red, blue)) {
  .theme-selection-panel {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--border) 55%, transparent);
  }
}

.theme-selection-panel__label-chip {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--border);
}

@supports (color: color-mix(in srgb, red, blue)) {
  .theme-selection-panel__label-chip {
    background: color-mix(in srgb, var(--surface) 78%, var(--border) 22%);
  }
}

.theme-selection-panel__label-text {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted);
}

.theme-card-preview {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border-radius: 0.5rem 0.5rem 0 0;
}

.theme-card-preview__bar {
  align-self: flex-start;
  flex-shrink: 0;
  height: 0.375rem;
  max-width: 100%;
  border-radius: 9999px;
}

.theme-card-preview__bar--long {
  width: 88%;
}

.theme-card-preview__bar--short {
  width: 56%;
  opacity: 0.88;
}

/* Light */
.theme-card-preview--light {
  background: #f0f3fa;
  box-shadow: inset 0 0 0 1px rgba(15, 10, 25, 0.09);
}
.theme-card-preview--light .theme-card-preview__bar {
  background: rgba(30, 41, 59, 0.42);
}

/* Dark */
.theme-card-preview--dark {
  background: #1a1225;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}
.theme-card-preview--dark .theme-card-preview__bar {
  background: rgba(255, 255, 255, 0.28);
}

/* AMOLED */
.theme-card-preview--amoled {
  background: #050505;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.theme-card-preview--amoled .theme-card-preview__bar {
  background: rgba(255, 255, 255, 0.22);
}

/* Sunny — warm cream preview (canonical id maps to light + warm accents in app) */
.theme-card-preview--sunny {
  background: #faf3e6;
  box-shadow: inset 0 0 0 1px rgba(120, 80, 30, 0.12);
}

.theme-card-preview--sunny::after {
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

.theme-card-preview--sunny .theme-card-preview__bar {
  position: relative;
  z-index: 2;
  background: rgba(90, 62, 38, 0.45);
}

.theme-card-caption__sub {
  color: rgba(255, 255, 255, 0.82);
}

.theme-card:not(:disabled):focus-visible {
  outline: 2px solid var(--accent, #6366f1);
  outline-offset: 2px;
}

/* Selected swatch ring: avoid Tailwind arbitrary `color-mix` in `box-shadow` (Safari quirks). */
.theme-card--selected {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.35);
}

@supports (color: color-mix(in srgb, red, blue)) {
  .theme-card--selected {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }
}
</style>
