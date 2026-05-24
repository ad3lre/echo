import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import {
  analyzePaperSelectionFormat,
  type PaperSelectionFormatSnapshot,
} from '@/features/paper/editor/paperSelectionFormat';
import { analyzePaperSelectionColors } from '@/features/paper/editor/paperSelectionColors';

export function usePaperSelectionFormat(
  editor: Ref<Editor | null | undefined>,
) {
  const revision = ref(0);

  function bump() {
    revision.value += 1;
  }

  function attach(ed: Editor | null | undefined) {
    if (!ed) return;
    ed.on('selectionUpdate', bump);
    ed.on('update', bump);
  }

  function detach(ed: Editor | null | undefined) {
    if (!ed) return;
    ed.off('selectionUpdate', bump);
    ed.off('update', bump);
  }

  watch(
    editor,
    (ed, prev) => {
      detach(prev);
      attach(ed);
      bump();
    },
    { immediate: true },
  );

  onUnmounted(() => detach(editor.value));

  const format = computed((): PaperSelectionFormatSnapshot => {
    void revision.value;
    return analyzePaperSelectionFormat(editor.value);
  });

  const colors = computed(() => {
    void revision.value;
    return analyzePaperSelectionColors(editor.value);
  });

  return { format, colors, revision };
}
