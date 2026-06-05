<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  PAPER_FONT_CATALOG,
  paperFontFamilyCss,
  paperFontHolderBindings,
  paperFontIdFromFamily,
  type PaperFontDefinition,
} from '@/features/paper/editor/paperTypography';
import { ensurePaperFontLoaded } from '@/features/paper/editor/paperFontLoader';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';

const props = defineProps<{
  modelValue: string;
  mixed?: boolean;
  documentDefaultFamily?: string;
  paperAppearance?: 'light' | 'dark' | 'amber';
  variant?: 'popover' | 'panel';
}>();

const emit = defineEmits<{
  'update:modelValue': [fontId: string];
  clear: [];
}>();

const open = ref(false);
const query = ref('');
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);

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

function preloadFilteredFonts() {
  for (const font of filtered.value) {
    void ensurePaperFontLoaded(font.id);
  }
}

const triggerLabel = computed(() => {
  if (props.mixed) return 'Mixed';
  return triggerFont.value?.label ?? 'Font';
});

const isPopover = computed(() => props.variant !== 'panel');

const categories: { id: PaperFontDefinition['category']; label: string }[] = [
  { id: 'sans', label: 'Sans serif' },
  { id: 'serif', label: 'Serif' },
  { id: 'devanagari', label: 'Devanagari' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Script' },
  { id: 'mono', label: 'Mono' },
];

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return PAPER_FONT_CATALOG.filter(
    (f) =>
      !q ||
      f.label.toLowerCase().includes(q) ||
      f.family.toLowerCase().includes(q),
  );
});

function close() {
  open.value = false;
}

async function positionPanel() {
  await nextTick();
  const root = rootRef.value;
  if (!root) {
    panelStyle.value = null;
    return;
  }
  const rect = root.getBoundingClientRect();
  panelStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    bottom: `${window.innerHeight - rect.top + 8}px`,
    width: `${Math.max(rect.width, 224)}px`,
    zIndex: '100',
  };
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!open.value) return;
  const root = rootRef.value;
  const target = ev.target as Node;
  if (root && !root.contains(target)) {
    const panel = document.getElementById('paper-font-picker-panel');
    if (panel?.contains(target)) return;
    close();
  }
}

function pick(font: PaperFontDefinition) {
  void ensurePaperFontLoaded(font.id);
  emit('update:modelValue', font.id);
}

function useDocumentDefault() {
  emit('clear');
}

watch(query, () => {
  if (open.value) preloadFilteredFonts();
});

watch(open, (isOpen) => {
  if (isOpen) {
    preloadFilteredFonts();
    void positionPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    panelStyle.value = null;
    query.value = '';
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', positionPanel, true);
});
</script>

<template>
  <div ref="rootRef" class="relative" :class="{ 'w-full': !isPopover }">
    <button
      v-if="isPopover"
      type="button"
      class="paper-font-picker-trigger"
      :title="`Font: ${triggerLabel} · Shift+←→`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @mousedown.prevent
      @click="open = !open"
    >
      <span
        class="max-w-[5.5rem] truncate"
        v-bind="triggerBindings.attributes"
        :style="triggerBindings.style"
      >
        {{ triggerLabel }}
      </span>
      <svg
        class="h-3 w-3 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
    <Teleport v-if="isPopover" to="body">
      <div
        v-if="open && panelStyle"
        id="paper-font-picker-panel"
        class="paper-font-picker-panel paper-font-picker-panel--teleport paper-teleport-surface"
        :data-paper-appearance="paperAppearance ?? 'light'"
        :style="panelStyle"
        role="listbox"
        @click.stop
        @mousedown.prevent
      >
        <input
          v-model="query"
          type="search"
          class="paper-font-picker-search"
          placeholder="Search fonts…"
          @click.stop
        />
        <button
          type="button"
          class="paper-font-picker-row paper-font-picker-row--default"
          @click.stop="useDocumentDefault()"
        >
          Use document font
        </button>
        <template v-for="cat in categories" :key="cat.id">
          <template v-if="filtered.some((f) => f.category === cat.id)">
            <div class="paper-font-picker-cat">{{ cat.label }}</div>
            <button
              v-for="font in filtered.filter((f) => f.category === cat.id)"
              :key="font.id"
              type="button"
              class="paper-font-picker-row"
              :class="{
                'paper-font-picker-row--active': font.id === selectedId,
              }"
              v-bind="font.attributes"
              :style="{ fontFamily: font.family }"
              role="option"
              :aria-selected="font.id === selectedId"
              @click.stop="pick(font)"
            >
              {{ font.label }}
            </button>
          </template>
        </template>
      </div>
    </Teleport>

    <!-- Panel variant (inline, no teleport, full width) -->
    <div
      v-else
      class="paper-font-picker-panel paper-font-picker-panel--inline"
      :data-paper-appearance="paperAppearance ?? 'light'"
      role="listbox"
    >
      <input
        v-model="query"
        type="search"
        class="paper-font-picker-search"
        placeholder="Search fonts…"
      />
      <button
        type="button"
        class="paper-font-picker-row paper-font-picker-row--default"
        @click="useDocumentDefault()"
      >
        Use document font
      </button>
      <div class="paper-font-picker-scroll">
        <template v-for="cat in categories" :key="cat.id">
          <template v-if="filtered.some((f) => f.category === cat.id)">
            <div class="paper-font-picker-cat">{{ cat.label }}</div>
            <button
              v-for="font in filtered.filter((f) => f.category === cat.id)"
              :key="font.id"
              type="button"
              class="paper-font-picker-row"
              :class="{
                'paper-font-picker-row--active': font.id === selectedId,
              }"
              v-bind="font.attributes"
              :style="{ fontFamily: font.family }"
              role="option"
              :aria-selected="font.id === selectedId"
              @click="pick(font)"
            >
              {{ font.label }}
            </button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-font-picker-trigger {
  display: inline-flex;
  height: 2rem;
  max-width: 7rem;
  align-items: center;
  gap: 0.25rem;
  border-radius: 8px;
  padding: 0 0.4rem;
  font-size: 0.75rem;
  color: var(--text);
}

.paper-font-picker-trigger:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-font-picker-panel {
  max-height: min(24rem, 70vh);
  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--elevated);
  color: var(--text);
  padding: 0.35rem 0;
  box-shadow: var(--paper-dropdown-shadow);
}

.paper-font-picker-search {
  margin: 0 0.5rem 0.35rem;
  width: calc(100% - 1rem);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--ui-glass-2);
  color: var(--text);
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
}

.paper-font-picker-search::placeholder {
  color: var(--muted);
}

.paper-font-picker-panel--inline {
  max-height: 16rem;
  border-radius: 0.5rem;
  box-shadow: none;
  border: 1px solid var(--border);
}

.paper-font-picker-scroll {
  max-height: 12rem;
  overflow-y: auto;
}

.paper-font-picker-cat {
  padding: 0.35rem 0.75rem 0.15rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.paper-font-picker-row {
  display: block;
  width: 100%;
  padding: 0.35rem 0.75rem;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--text);
}

.paper-font-picker-row:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.paper-font-picker-row--active {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.paper-font-picker-row--default {
  font-family: inherit;
  font-size: 0.75rem;
  border-bottom: 1px solid var(--border);
}
</style>
