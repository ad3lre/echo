import { ref } from 'vue';
import {
  pushPaperRecentColor,
  readPaperRecentColors,
} from '@/features/paper/composables/usePaperRecentColors';
import { PAPER_DEFAULT_SHAPE_FILL } from '@/features/paper/editor/paperShapeExtension';

const STORAGE_KEY = 'echo.paper.pendingObjectColor';

function readPending(): string {
  if (typeof localStorage === 'undefined') return PAPER_DEFAULT_SHAPE_FILL;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (!raw) return PAPER_DEFAULT_SHAPE_FILL;
    const recent = readPaperRecentColors('object');
    if (recent.includes(raw.toLowerCase())) return raw.toLowerCase();
    return PAPER_DEFAULT_SHAPE_FILL;
  } catch {
    return PAPER_DEFAULT_SHAPE_FILL;
  }
}

function writePending(hex: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, hex);
  } catch {
    /* quota */
  }
}

const pendingObjectColor = ref(readPending());

export function usePaperObjectColor() {
  function setPendingObjectColor(hex: string) {
    const next = pushPaperRecentColor('object', hex)[0] ?? hex;
    pendingObjectColor.value = next;
    writePending(next);
  }

  function resetPendingObjectColor() {
    pendingObjectColor.value = PAPER_DEFAULT_SHAPE_FILL;
    writePending(PAPER_DEFAULT_SHAPE_FILL);
  }

  return {
    pendingObjectColor,
    setPendingObjectColor,
    resetPendingObjectColor,
  };
}
