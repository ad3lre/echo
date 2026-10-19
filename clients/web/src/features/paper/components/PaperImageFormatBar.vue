<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import type { Editor } from '@tiptap/core';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import type {
  PaperImageAlign,
  PaperImageWrap,
} from '@/features/paper/editor/paperImageExtension';
import { runPaperFormatCommand } from '@/features/paper/editor/paperFormatSelection';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';

const props = defineProps<{
  editor: Editor | null;
  visible?: boolean;
  pageLayout?: PaperPageLayout;
  paperAppearance?: PaperAppearanceMode;
}>();

const ed = computed(() => props.editor);
const show = computed(
  () => props.visible !== false && !!ed.value && ed.value.isActive('image'),
);

const widthOptions = computed<EchoDropdownOption[]>(() => [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
  { label: echoT('b37.pif.auto'), value: '' },
]);

const alignOptions = computed<EchoDropdownOption[]>(() => [
  { label: echoT('b37.pif.left'), value: 'left' },
  { label: echoT('b37.pif.center'), value: 'center' },
  { label: echoT('b37.pif.right'), value: 'right' },
]);

const wrapOptions = computed<EchoDropdownOption[]>(() => [
  { label: echoT('b37.pif.none'), value: 'none' },
  { label: echoT('b37.pif.left'), value: 'left' },
  { label: echoT('b37.pif.right'), value: 'right' },
]);

const currentWidth = computed(() => {
  const attrs = ed.value?.getAttributes('image');
  return attrs?.width ?? '';
});

const currentAlign = computed(() => {
  const attrs = ed.value?.getAttributes('image');
  return (attrs?.align as PaperImageAlign) ?? 'center';
});

const currentWrap = computed(() => {
  const attrs = ed.value?.getAttributes('image');
  return (attrs?.wrap as PaperImageWrap) ?? 'none';
});

function setWidth(value: string) {
  runPaperFormatCommand(ed.value, (chain) =>
    chain.updateAttributes('image', { width: value || null }),
  );
}

function setAlign(value: string) {
  runPaperFormatCommand(ed.value, (chain) =>
    chain.updateAttributes('image', { align: value as PaperImageAlign }),
  );
}

function setWrap(value: string) {
  runPaperFormatCommand(ed.value, (chain) =>
    chain.updateAttributes('image', { wrap: value as PaperImageWrap }),
  );
}

const barStyle = computed(() => {
  const layout = props.pageLayout;
  if (!layout || layout.width <= 0) {
    return { left: '50%', transform: 'translateX(-50%)' };
  }
  return {
    left: `${layout.viewportCenterX}px`,
    transform: 'translateX(-50%)',
  };
});
</script>

<template>
  <div
    v-if="show"
    class="paper-format-bar paper-image-format-bar pointer-events-none fixed bottom-20 z-40"
    :style="barStyle"
    role="toolbar"
    :aria-label="echoT('b37.pif.format')"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 overflow-x-auto overflow-y-visible rounded-full border border-border px-2 py-1 shadow-lg backdrop-blur-md"
      style="background: var(--paper-format-bar-bg)"
    >
      <EchoDropdown
        :model-value="currentWidth"
        :options="widthOptions"
        :label="echoT('b37.pif.width')"
        compact
        @update:model-value="setWidth"
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <EchoDropdown
        :model-value="currentAlign"
        :options="alignOptions"
        :label="echoT('b37.pif.align')"
        compact
        @update:model-value="setAlign"
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <EchoDropdown
        :model-value="currentWrap"
        :options="wrapOptions"
        :label="echoT('b37.pif.wrap')"
        compact
        @update:model-value="setWrap"
      />
    </div>
  </div>
</template>

<style scoped>
.paper-image-format-bar {
  bottom: 5rem;
}
</style>
