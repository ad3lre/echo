<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import {
  usePaperEditorPanelBridge,
  type PaperEditorPanelTab,
} from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperEditorPanelPreferences } from '@/features/paper/composables/usePaperEditorPanelPreferences';
import PaperEditorDesignTab from '@/features/paper/components/PaperEditorDesignTab.vue';
import PaperEditorTextTab from '@/features/paper/components/PaperEditorTextTab.vue';
import PaperEditorAssetsTab from '@/features/paper/components/PaperEditorAssetsTab.vue';
import PaperEditorStructureTab from '@/features/paper/components/PaperEditorStructureTab.vue';
import { onPaperFormatBarMouseDown } from '@/features/paper/editor/paperFormatSelection';
import { icons } from '@/assets/icons';
import '@/features/paper/styles/paperTheme.scss';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
}>();

const bridge = usePaperEditorPanelBridge();
const { hideFormatBarWhenEditorPinned } = usePaperEditorPanelPreferences();

const appearance = computed(() => props.context.appearance.value);
const canCustomize = computed(() => props.context.canCustomize.value);
const editorEditable = computed(() => props.context.editorEditable.value);
const editorRef = computed(() => props.context.editor.value);

const tabs: { id: PaperEditorPanelTab; label: string; icon: string }[] = [
  { id: 'design', label: 'Design', icon: 'palette' },
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'assets', label: 'Assets', icon: 'image' },
  { id: 'structure', label: 'Structure', icon: 'list' },
];

const tabListRef = ref<HTMLElement | null>(null);
const isCoarsePointer = ref(false);

onMounted(() => {
  isCoarsePointer.value =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches;
});

function backToChannels() {
  bridge.closePanel();
}

function onPanelMouseDown(ev: MouseEvent) {
  onPaperFormatBarMouseDown(editorRef.value, ev);
}

function onTabKeydown(ev: KeyboardEvent) {
  const idx = tabs.findIndex((t) => t.id === bridge.activeTab.value);
  if (idx < 0) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
    ev.preventDefault();
    bridge.setActiveTab(tabs[(idx + 1) % tabs.length].id);
  } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
    ev.preventDefault();
    bridge.setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }
}

watch(
  editorRef,
  (ed, prev) => {
    const onSelectionUpdate = () => {
      if (!bridge.panelOpen.value || !ed) return;
      const { from, to } = ed.state.selection;
      if (from < to && bridge.activeTab.value !== 'text') {
        bridge.setActiveTab('text');
      }
    };
    prev?.off('selectionUpdate', onSelectionUpdate);
    ed?.on('selectionUpdate', onSelectionUpdate);
  },
  { immediate: true },
);
</script>

<template>
  <aside
    class="paper-editor-panel"
    :data-paper-appearance="appearance"
    @mousedown="onPanelMouseDown"
  >
    <header class="paper-editor-panel__header">
      <button
        type="button"
        class="paper-editor-panel__back"
        @click="backToChannels"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Channels
      </button>
      <div class="min-w-0 flex-1">
        <p class="paper-editor-panel__eyebrow">Paper editor</p>
        <h2 class="paper-editor-panel__title truncate">
          {{ context.channelName }}
        </h2>
      </div>
      <button
        type="button"
        class="paper-editor-panel__icon-btn"
        :title="
          appearance === 'dark' ? 'Light canvas preview' : 'Dark canvas preview'
        "
        @click="context.toggleAppearance()"
      >
        <img
          :src="appearance === 'dark' ? icons.sun : icons.moon"
          alt=""
          class="h-4 w-4 opacity-85"
        />
      </button>
    </header>

    <div class="paper-editor-panel__body">
      <div
        ref="tabListRef"
        class="paper-editor-panel__tabs"
        role="tablist"
        aria-label="Editor tools"
        @keydown="onTabKeydown"
      >
        <button
          v-for="tab in tabs"
          :id="`paper-editor-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="paper-editor-panel__tab"
          :class="{
            'paper-editor-panel__tab--active':
              bridge.activeTab.value === tab.id,
            'paper-editor-panel__tab--expanded': isCoarsePointer,
          }"
          :aria-selected="bridge.activeTab.value === tab.id"
          :aria-controls="`paper-editor-panel-${tab.id}`"
          :title="tab.label"
          @click="bridge.setActiveTab(tab.id)"
        >
          <span class="paper-editor-panel__tab-icon" aria-hidden="true">
            <svg
              v-if="tab.icon === 'palette'"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="8" cy="10" r="1.2" fill="currentColor" />
              <circle cx="15" cy="9" r="1.2" fill="currentColor" />
              <circle cx="10" cy="15" r="1.2" fill="currentColor" />
            </svg>
            <svg
              v-else-if="tab.icon === 'type'"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            <svg
              v-else-if="tab.icon === 'image'"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="9" y1="6" x2="20" y2="6" />
              <line x1="9" y1="12" x2="20" y2="12" />
              <line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="4" cy="6" r="1.5" fill="currentColor" />
              <circle cx="4" cy="12" r="1.5" fill="currentColor" />
              <circle cx="4" cy="18" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span class="paper-editor-panel__tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <div class="paper-editor-panel__scroll min-h-0 flex-1 overflow-y-auto">
        <div
          v-show="bridge.activeTab.value === 'design'"
          :id="`paper-editor-panel-design`"
          role="tabpanel"
          aria-labelledby="paper-editor-tab-design"
        >
          <PaperEditorDesignTab
            v-if="canCustomize"
            :context="context"
            :appearance="appearance"
          />
          <p
            v-else
            class="paper-editor-tab__hint paper-editor-tab__hint--center"
          >
            Switch to edit mode to customize the canvas.
          </p>
        </div>
        <div
          v-show="bridge.activeTab.value === 'text'"
          :id="`paper-editor-panel-text`"
          role="tabpanel"
          aria-labelledby="paper-editor-tab-text"
        >
          <PaperEditorTextTab
            :context="context"
            :appearance="appearance"
            :can-customize="canCustomize"
            :editor-editable="editorEditable"
          />
        </div>
        <div
          v-show="bridge.activeTab.value === 'assets'"
          :id="`paper-editor-panel-assets`"
          role="tabpanel"
          aria-labelledby="paper-editor-tab-assets"
        >
          <PaperEditorAssetsTab
            :context="context"
            :editor-editable="editorEditable"
          />
        </div>
        <div
          v-show="bridge.activeTab.value === 'structure'"
          :id="`paper-editor-panel-structure`"
          role="tabpanel"
          aria-labelledby="paper-editor-tab-structure"
        >
          <PaperEditorStructureTab
            :context="context"
            :editor-editable="editorEditable"
          />
        </div>
      </div>
    </div>

    <footer class="paper-editor-panel__footer">
      <label class="paper-editor-panel__setting">
        <input v-model="hideFormatBarWhenEditorPinned" type="checkbox" />
        <span>Hide bottom toolbar while editor is open</span>
      </label>
    </footer>
  </aside>
</template>
