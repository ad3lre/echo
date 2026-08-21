import { computed, ref, watch, type Ref } from 'vue';
import {
  PAPER_APPEARANCE_CYCLE,
  readPaperPageColors,
  resolvePaperPageSurfaceStyle,
  type PaperAppearanceMode,
} from '@/features/paper/editor/paperPageAppearance';

export type { PaperAppearanceMode };

const STORAGE_PREFIX = 'echo-paper-appearance:';

const VALID_MODES = new Set<string>(PAPER_APPEARANCE_CYCLE);

function normalizeStoredMode(raw: string | null): PaperAppearanceMode | null {
  if (!raw) return null;
  if (raw === 'amber') return 'sunny';
  if (VALID_MODES.has(raw)) return raw as PaperAppearanceMode;
  return null;
}

function loadStored(channelId: string): PaperAppearanceMode | null {
  try {
    return normalizeStoredMode(
      sessionStorage.getItem(`${STORAGE_PREFIX}${channelId}`),
    );
  } catch {
    /* ignore */
  }
  return null;
}

function store(channelId: string, mode: PaperAppearanceMode) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${channelId}`, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Read the global Echo theme from the DOM so Paper inherits it on first open
 * (before the user picks a per-channel canvas mode).
 */
export function detectGlobalAppearance(): PaperAppearanceMode {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  if (root.dataset.theme === 'light') {
    return root.dataset.echoLightVariant === 'sunny' ? 'sunny' : 'light';
  }
  return root.dataset.echoDarkVariant === 'amoled' ? 'amoled' : 'dark';
}

export function usePaperAppearance(opts: {
  channelId: Ref<string>;
  contentJson: Ref<Record<string, unknown> | null | undefined>;
}) {
  const appearance = ref<PaperAppearanceMode>(detectGlobalAppearance());

  watch(
    () => opts.channelId.value,
    (id) => {
      if (!id.trim()) return;
      appearance.value = loadStored(id) ?? detectGlobalAppearance();
    },
    { immediate: true },
  );

  function setAppearance(mode: PaperAppearanceMode) {
    appearance.value = mode;
    const id = opts.channelId.value.trim();
    if (id) store(id, mode);
  }

  function toggleAppearance() {
    const idx = PAPER_APPEARANCE_CYCLE.indexOf(appearance.value);
    const next =
      PAPER_APPEARANCE_CYCLE[(idx + 1) % PAPER_APPEARANCE_CYCLE.length] ??
      'light';
    setAppearance(next);
  }

  const pageSurfaceStyle = computed(() => {
    const colors = readPaperPageColors(opts.contentJson.value);
    return resolvePaperPageSurfaceStyle(appearance.value, colors);
  });

  return {
    appearance,
    setAppearance,
    toggleAppearance,
    pageSurfaceStyle,
  };
}
