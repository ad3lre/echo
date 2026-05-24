<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import PaperColorPickerPanel, {
  type PaperColorSwatch,
} from '@/features/paper/components/PaperColorPickerPanel.vue';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import type { PaperColorKind } from '@/features/paper/composables/usePaperRecentColors';

const props = defineProps<{
  label: string;
  color: string | null;
  mixed?: boolean;
  isDefault?: boolean;
  /** 'text' shows underlined A; 'highlight' shows marker icon */
  variant?: 'text' | 'highlight';
  palette: readonly PaperColorSwatch[];
  pageLayout?: PaperPageLayout;
  paperAppearance?: PaperAppearanceMode;
}>();

const emit = defineEmits<{
  input: [value: string];
  clear: [];
}>();

const kind = computed<PaperColorKind>(() =>
  (props.variant ?? 'text') === 'highlight' ? 'highlight' : 'text',
);

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);

const swatchStyle = computed(() => {
  if (props.mixed) {
    return {
      background: 'linear-gradient(135deg, #ef4444 0 50%, #3b82f6 50% 100%)',
    };
  }
  if (props.isDefault || !props.color) {
    return {
      background: 'var(--paper-surface-fg)',
      color: 'var(--paper-surface-bg)',
    };
  }
  return { background: props.color };
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
  const layout = props.pageLayout;
  const pad = 8;
  const vw = window.innerWidth;

  if (layout && layout.width > 0) {
    const width = Math.min(layout.width, vw - pad * 2);
    const left = Math.max(
      pad,
      Math.min(layout.viewportCenterX - width / 2, vw - width - pad),
    );
    panelStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      width: `${width}px`,
      bottom: `${window.innerHeight - rect.top + 8}px`,
      zIndex: '100',
    };
    return;
  }

  panelStyle.value = {
    position: 'fixed',
    left: `${Math.max(pad, rect.left)}px`,
    width: `${Math.min(280, vw - pad * 2)}px`,
    bottom: `${window.innerHeight - rect.top + 8}px`,
    zIndex: '100',
  };
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!open.value) return;
  const target = ev.target as Node;
  const root = rootRef.value;
  if (root?.contains(target)) return;
  const panel = document.getElementById(`paper-color-picker-${kind.value}`);
  if (panel?.contains(target)) return;
  close();
}

function onPick(value: string) {
  emit('input', value);
}

function onClear() {
  emit('clear');
}

function toggleOpen() {
  if (props.mixed) return;
  open.value = !open.value;
}

function onContextMenu(ev: MouseEvent) {
  if (props.mixed) return;
  if (!props.isDefault && props.color) {
    ev.preventDefault();
    emit('clear');
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    void positionPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    panelStyle.value = null;
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', positionPanel, true);
});
</script>

<template>
  <div ref="rootRef" class="paper-color-control">
    <button
      type="button"
      class="paper-color-trigger"
      :class="{ 'paper-color-trigger--disabled': mixed }"
      :title="
        mixed
          ? `${label}: mixed`
          : isDefault
            ? `${label}: default (right-click to clear)`
            : `${label}: ${color ?? ''} (right-click to clear)`
      "
      :aria-label="label"
      :aria-expanded="open"
      :aria-haspopup="true"
      :disabled="mixed"
      @mousedown.prevent
      @click="toggleOpen"
      @contextmenu="onContextMenu"
    >
      <span
        class="paper-color-swatch"
        :class="{ 'paper-color-swatch--mixed': mixed }"
        :style="swatchStyle"
        aria-hidden="true"
      >
        <span
          v-if="isDefault && !mixed && (variant ?? 'text') === 'text'"
          class="paper-color-swatch-glyph paper-color-swatch-glyph--text"
          >A</span
        >
        <svg
          v-else-if="isDefault && !mixed && variant === 'highlight'"
          class="paper-color-swatch-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span v-else-if="mixed" class="paper-color-swatch-glyph">…</span>
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open && panelStyle"
        :id="`paper-color-picker-${kind}`"
        class="paper-color-picker-shell paper-teleport-surface"
        :data-paper-appearance="paperAppearance ?? 'light'"
        :style="panelStyle"
        @click.stop
        @mousedown.prevent
      >
        <PaperColorPickerPanel
          :kind="kind"
          :palette="palette"
          :color="color"
          :mixed="mixed"
          :is-default="isDefault"
          @pick="onPick"
          @clear="onClear"
          @close="close"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.paper-color-control {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.paper-color-trigger {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  cursor: pointer;
  color: inherit;
}

.paper-color-trigger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-color-trigger:focus {
  outline: none;
}

.paper-color-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.paper-color-trigger--disabled,
.paper-color-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.paper-color-swatch {
  display: flex;
  height: 1.25rem;
  width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid var(--border);
  font-size: 0.625rem;
  font-weight: 700;
}

.paper-color-swatch-glyph--text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-color-swatch-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.paper-color-swatch--mixed {
  border-style: dashed;
}

.paper-color-picker-shell {
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--elevated);
  color: var(--text);
  box-shadow: var(--paper-dropdown-shadow);
  max-height: min(70vh, 20rem);
  overflow-y: auto;
}
</style>
