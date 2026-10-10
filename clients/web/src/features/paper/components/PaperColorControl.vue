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
  variant?: 'text' | 'highlight' | 'object' | 'border';
  palette: readonly PaperColorSwatch[];
  pageLayout?: PaperPageLayout;
  paperAppearance?: PaperAppearanceMode;
}>();

const emit = defineEmits<{
  input: [value: string];
  clear: [];
}>();

const kind = computed<PaperColorKind>(() => {
  const variant = props.variant ?? 'text';
  if (variant === 'highlight') return 'highlight';
  if (variant === 'object' || variant === 'border') return 'object';
  return 'text';
});

const isTransparentColor = computed(() => {
  const value = props.color?.trim().toLowerCase();
  return value === 'transparent' || value === 'none';
});

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);

const swatchStyle = computed(() => {
  if (props.mixed) {
    return {
      background: 'linear-gradient(135deg, #ef4444 0 50%, #3b82f6 50% 100%)',
    };
  }
  if (
    (props.variant === 'object' || props.variant === 'border') &&
    isTransparentColor.value
  ) {
    return {};
  }
  if (props.variant === 'border' && props.color) {
    return {
      background: 'transparent',
      boxShadow: `inset 0 0 0 2px ${props.color}`,
    };
  }
  if (props.isDefault || !props.color) {
    if (props.variant === 'object' || props.variant === 'border') {
      return {};
    }
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
  open.value = !open.value;
}

function onContextMenu(ev: MouseEvent) {
  if (props.mixed || (!props.isDefault && props.color)) {
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
      :class="{ 'paper-color-trigger--mixed': mixed }"
      :title="
        mixed
          ? `${label}: mixed colors (pick one to apply to selection)`
          : isDefault
            ? `${label}: default (right-click to clear)`
            : `${label}: ${color ?? ''} (right-click to clear)`
      "
      :aria-label="label"
      :aria-expanded="open"
      :aria-haspopup="true"
      @mousedown.prevent
      @click="toggleOpen"
      @contextmenu="onContextMenu"
    >
      <span
        class="paper-color-swatch"
        :class="{
          'paper-color-swatch--mixed': mixed,
          'paper-color-swatch--none':
            (variant === 'object' || variant === 'border') &&
            isTransparentColor,
          'paper-color-swatch--border':
            variant === 'border' && !isTransparentColor && !isDefault,
        }"
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

<style scoped src="./styles/PaperColorControl.scss"></style>
