import { ref } from 'vue';

export type PaperColorTarget = 'text' | 'highlight' | 'object';

const STORAGE_KEY = 'echo.paper.colorTarget';

const TARGETS: PaperColorTarget[] = ['text', 'highlight', 'object'];

function readTarget(): PaperColorTarget {
  if (typeof sessionStorage === 'undefined') return 'text';
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw && TARGETS.includes(raw as PaperColorTarget)) {
      return raw as PaperColorTarget;
    }
  } catch {
    /* private mode */
  }
  return 'text';
}

const activeColorTarget = ref<PaperColorTarget>(readTarget());

export function usePaperColorTarget() {
  function setColorTarget(target: PaperColorTarget) {
    activeColorTarget.value = target;
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(STORAGE_KEY, target);
    } catch {
      /* quota */
    }
  }

  return {
    activeColorTarget,
    setColorTarget,
  };
}
