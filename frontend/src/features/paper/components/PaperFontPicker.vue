<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue';
import {
  PAPER_FONT_CATALOG,
  paperFontFamilyCss,
  paperFontHolderBindings,
  paperFontIdFromFamily,
  type PaperFontDefinition,
} from '@/features/paper/editor/paperTypography';
import { ensurePaperFontLoaded } from '@/features/paper/editor/paperFontLoader';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    mixed?: boolean;
    documentDefaultFamily?: string;
    paperAppearance?: PaperAppearanceMode;
    /** Compact toolbar chip vs full-width field row. */
    layout?: 'compact' | 'field';
    placement?: 'above' | 'below';
    /** Show "Use document font" in the menu (hide for document-default picker). */
    showDocumentDefault?: boolean;
  }>(),
  {
    layout: 'compact',
    placement: 'above',
    showDocumentDefault: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [fontId: string];
  clear: [];
  /** Capture-phase mousedown on the teleported panel (parent should snapshot editor selection). */
  'panel-mousedown': [ev: MouseEvent];
}>();

const open = ref(false);
const query = ref('');
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);
/** Unique per instance: multiple pickers must not share one DOM id. */
const panelId = `paper-font-picker-panel-${useId()}`;

const selectedId = computed(() =>
  props.mixed ? '' : paperFontIdFromFamily(props.modelValue),
);

const triggerFont = computed(() =>
  props.mixed
    ? null
    : (PAPER_FONT_CATALOG.find((f) => f.id === selectedId.value) ?? null),
);

const triggerBindings = computed(() => {
  if (props.mixed) {
    return {
      attributes: { 'data-font-mixed': 'true' as const },
      style: { fontFamily: paperFontFamilyCss(props.modelValue) },
    };
  }
  if (triggerFont.value) return paperFontHolderBindings(triggerFont.value);
  return {
    attributes: {
      'data-font-family': props.modelValue,
    },
    style: { fontFamily: paperFontFamilyCss(props.modelValue) },
  };
});

const triggerLabel = computed(() => {
  if (props.mixed) return 'Mixed';
  return triggerFont.value?.label ?? 'Font';
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const hits = PAPER_FONT_CATALOG.filter(
    (f) =>
      !q ||
      f.label.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q),
  );
  return [...hits].sort((a, b) => a.label.localeCompare(b.label));
});

function preloadFilteredFonts() {
  for (const font of filtered.value) {
    void ensurePaperFontLoaded(font.id);
  }
}

function close() {
  open.value = false;
}

function toggleOpen() {
  open.value = !open.value;
}

async function positionPanel() {
  await nextTick();
  const root = rootRef.value;
  if (!root) {
    panelStyle.value = null;
    return;
  }
  const rect = root.getBoundingClientRect();
  const width = Math.max(rect.width, props.layout === 'field' ? 240 : 208);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

  if (props.placement === 'below') {
    panelStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      top: `${rect.bottom + 6}px`,
      width: `${width}px`,
      zIndex: '450',
    };
    return;
  }

  panelStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    bottom: `${window.innerHeight - rect.top + 6}px`,
    width: `${width}px`,
    zIndex: '450',
  };
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!open.value) return;
  const root = rootRef.value;
  const target = ev.target as Node;
  if (root?.contains(target)) return;
  const panel = document.getElementById(panelId);
  if (panel?.contains(target)) return;
  close();
}

function onPanelCaptureMouseDown(ev: MouseEvent) {
  emit('panel-mousedown', ev);
}

function pick(font: PaperFontDefinition) {
  void ensurePaperFontLoaded(font.id);
  emit('update:modelValue', font.id);
  close();
}

function useDocumentDefault() {
  emit('clear');
  close();
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && open.value) close();
}

watch(query, () => {
  if (open.value) preloadFilteredFonts();
});

watch(open, (isOpen) => {
  if (isOpen) {
    preloadFilteredFonts();
    void positionPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    panelStyle.value = null;
    query.value = '';
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', positionPanel, true);
});
</script>

<template>
  <div
    ref="rootRef"
    class="paper-font-picker"
    :class="{ 'paper-font-picker--field': layout === 'field' }"
  >
    <button
      type="button"
      class="paper-font-picker-trigger"
      :class="{ 'paper-font-picker-trigger--field': layout === 'field' }"
      :title="`Font: ${triggerLabel}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @mousedown.prevent
      @click="toggleOpen"
    >
      <span
        class="paper-font-picker-trigger__label"
        v-bind="triggerBindings.attributes"
        :style="triggerBindings.style"
      >
        {{ triggerLabel }}
      </span>
      <svg
        class="paper-font-picker-trigger__chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open && panelStyle"
        :id="panelId"
        class="paper-font-picker-menu paper-teleport-surface"
        :data-paper-appearance="paperAppearance ?? 'light'"
        :style="panelStyle"
        role="listbox"
        :aria-label="`Font: ${triggerLabel}`"
        @click.stop
        @mousedown.capture="onPanelCaptureMouseDown"
      >
        <input
          v-model="query"
          type="search"
          class="paper-font-picker-menu__search"
          placeholder="Search fonts"
          @click.stop
        />
        <button
          v-if="showDocumentDefault"
          type="button"
          class="paper-font-picker-menu__row paper-font-picker-menu__row--meta"
          @mousedown.prevent.stop="useDocumentDefault()"
        >
          Use document font
        </button>
        <div class="paper-font-picker-menu__list">
          <button
            v-for="font in filtered"
            :key="font.id"
            type="button"
            class="paper-font-picker-menu__row"
            :class="{
              'paper-font-picker-menu__row--active': font.id === selectedId,
            }"
            v-bind="font.attributes"
            :style="{ fontFamily: font.family }"
            role="option"
            :aria-selected="font.id === selectedId"
            @mousedown.prevent.stop="pick(font)"
          >
            {{ font.label }}
          </button>
          <p v-if="filtered.length === 0" class="paper-font-picker-menu__empty">
            No fonts match
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.paper-font-picker {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.paper-font-picker--field {
  display: flex;
  width: 100%;
}

.paper-font-picker-trigger {
  display: inline-flex;
  height: 2rem;
  max-width: 7rem;
  align-items: center;
  gap: 0.25rem;
  border: none;
  border-radius: 8px;
  padding: 0 0.4rem;
  font-size: 0.75rem;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.paper-font-picker-trigger--field {
  width: 100%;
  max-width: none;
  height: 2.25rem;
  justify-content: space-between;
  padding: 0 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--text) 4%, transparent);
}

.paper-font-picker-trigger:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-font-picker-trigger--field:hover {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

.paper-font-picker-trigger:focus {
  outline: none;
}

.paper-font-picker-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.paper-font-picker-trigger__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-font-picker-trigger:not(.paper-font-picker-trigger--field)
  .paper-font-picker-trigger__label {
  max-width: 5.5rem;
}

.paper-font-picker-trigger__chevron {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
  opacity: 0.55;
}

.paper-font-picker-menu {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--elevated);
  color: var(--text);
  box-shadow: var(--paper-dropdown-shadow);
}

.paper-font-picker-menu__search {
  margin: 0.4rem 0.45rem 0.3rem;
  width: calc(100% - 0.9rem);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--text) 4%, transparent);
  color: var(--text);
  padding: 0.4rem 0.5rem;
  font-size: 0.75rem;
}

.paper-font-picker-menu__search::placeholder {
  color: var(--muted);
}

.paper-font-picker-menu__search:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.paper-font-picker-menu__list {
  max-height: min(14rem, 42vh);
  overflow-y: auto;
  padding: 0.15rem 0 0.25rem;
}

.paper-font-picker-menu__row {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0.38rem 0.65rem;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--text);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.paper-font-picker-menu__row:hover {
  background: color-mix(in srgb, var(--text) 7%, transparent);
}

.paper-font-picker-menu__row--active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.paper-font-picker-menu__row--meta {
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.paper-font-picker-menu__empty {
  margin: 0;
  padding: 0.65rem 0.75rem;
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
