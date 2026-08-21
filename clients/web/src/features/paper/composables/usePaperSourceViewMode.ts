import { ref, watch, type Ref } from 'vue';
import { setPaperMarkdownRenderInlineValue } from '@/features/paper/editor/paperMarkdownRenderState';

/**
 * Paper document surface mode.
 * - `inline`: WYSIWYG editor with live markdown delimiter styling and KaTeX.
 * - `raw`: full-document markdown source (monospace editor).
 */
export type PaperSourceViewMode = 'raw' | 'inline';

const STORAGE_PREFIX = 'echo-paper-source-view:';

function loadStored(channelId: string): PaperSourceViewMode | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${channelId}`);
    if (raw === 'raw' || raw === 'inline') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function store(channelId: string, mode: PaperSourceViewMode) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${channelId}`, mode);
  } catch {
    /* ignore */
  }
}

export function usePaperSourceViewMode(opts: { channelId: Ref<string> }) {
  const mode = ref<PaperSourceViewMode>('inline');

  function applyMode(next: PaperSourceViewMode) {
    mode.value = next;
    setPaperMarkdownRenderInlineValue(next === 'inline');
    const id = opts.channelId.value.trim();
    if (id) store(id, next);
  }

  watch(
    () => opts.channelId.value,
    (id) => {
      if (!id.trim()) return;
      applyMode(loadStored(id) ?? 'inline');
    },
    { immediate: true },
  );

  function setMode(next: PaperSourceViewMode) {
    applyMode(next);
  }

  function toggleMode() {
    setMode(mode.value === 'inline' ? 'raw' : 'inline');
  }

  return {
    mode,
    setMode,
    toggleMode,
  };
}
