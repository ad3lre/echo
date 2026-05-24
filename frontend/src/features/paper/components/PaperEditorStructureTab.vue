<script setup lang="ts">
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperFormatActions } from '@/features/paper/composables/usePaperFormatActions';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  editorEditable: boolean;
}>();

const editorRef = computed(() => props.context.editor.value);
const actions = usePaperFormatActions(editorRef);
</script>

<template>
  <div class="paper-editor-tab">
    <template v-if="editorEditable">
      <section class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">Lists</h4>
        <div class="paper-editor-panel__tool-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            @click="actions.toggleList('toggleBulletList')"
          >
            Bullet list
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            @click="actions.toggleList('toggleOrderedList')"
          >
            Numbered list
          </button>
        </div>
      </section>

      <section class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">Dividers</h4>
        <button
          type="button"
          class="paper-editor-panel__asset-btn paper-editor-panel__asset-btn--ghost"
          @click="actions.insertHorizontalRule()"
        >
          Insert horizontal rule
        </button>
      </section>
    </template>

    <p v-else class="paper-editor-tab__hint paper-editor-tab__hint--center">
      Switch to edit mode to add structure.
    </p>
  </div>
</template>
