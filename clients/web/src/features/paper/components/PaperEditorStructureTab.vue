<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/paperEditorPanelBridge';
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
        <h4 class="paper-editor-tab__label">
          {{ echoT('b43.paperStructure.lists') }}
        </h4>
        <div class="paper-editor-panel__tool-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            @click="actions.toggleList('toggleBulletList')"
          >
            {{ echoT('b43.paperStructure.bullet') }}
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            @click="actions.toggleList('toggleOrderedList')"
          >
            {{ echoT('b43.paperStructure.numbered') }}
          </button>
        </div>
      </section>

      <section class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">
          {{ echoT('b43.paperStructure.dividers') }}
        </h4>
        <button
          type="button"
          class="paper-editor-panel__asset-btn paper-editor-panel__asset-btn--ghost"
          @click="actions.insertHorizontalRule()"
        >
          {{ echoT('b43.paperStructure.hr') }}
        </button>
      </section>
    </template>

    <p v-else class="paper-editor-tab__hint paper-editor-tab__hint--center">
      {{ echoT('b43.paperStructure.switchEdit') }}
    </p>
  </div>
</template>
