import { ref, watch, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { markdownFromEchoContentJson } from '@/features/chat/echoContentJsonMarkdown';
import { applyPaperMarkdownToEditor } from '@/features/paper/editor/applyPaperMarkdownToEditor';
import type { PaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';

const SYNC_DEBOUNCE_MS = 280;

export function usePaperRawMarkdownBridge(opts: {
  mode: Ref<PaperSourceViewMode>;
  editor: Ref<Editor | null | undefined>;
  onSyncedToEditor?: () => void;
}) {
  const rawMarkdown = ref('');
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressRefresh = false;

  function refreshFromEditor() {
    const ed = opts.editor.value;
    if (!ed) return;
    rawMarkdown.value = markdownFromEchoContentJson(ed.getJSON());
  }

  function flushSyncToEditor() {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    const ed = opts.editor.value;
    if (!ed || opts.mode.value !== 'raw') return;
    suppressRefresh = true;
    try {
      applyPaperMarkdownToEditor(ed, rawMarkdown.value, { emitUpdate: true });
      opts.onSyncedToEditor?.();
    } finally {
      suppressRefresh = false;
    }
  }

  function scheduleSyncToEditor() {
    if (opts.mode.value !== 'raw') return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      flushSyncToEditor();
    }, SYNC_DEBOUNCE_MS);
  }

  function onRawMarkdownInput(next: string) {
    rawMarkdown.value = next;
    scheduleSyncToEditor();
  }

  watch(
    () => opts.mode.value,
    (mode, prev) => {
      if (mode === 'raw') {
        refreshFromEditor();
        return;
      }
      if (prev === 'raw') {
        flushSyncToEditor();
      }
    },
  );

  watch(
    () => opts.editor.value,
    (ed) => {
      if (!ed || opts.mode.value !== 'raw' || suppressRefresh) return;
      refreshFromEditor();
    },
  );

  function refreshFromEditorIfRaw() {
    if (opts.mode.value === 'raw') refreshFromEditor();
  }

  return {
    rawMarkdown,
    onRawMarkdownInput,
    flushSyncToEditor,
    refreshFromEditor,
    refreshFromEditorIfRaw,
  };
}
