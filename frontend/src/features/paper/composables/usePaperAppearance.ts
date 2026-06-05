import { computed, ref, watch, type Ref } from 'vue';
import {
  derivePaperSurfaceStyle,
  readPaperPageColors,
} from '@/features/paper/editor/paperPageAppearance';

export type PaperAppearanceMode = 'light' | 'dark' | 'amber';

const STORAGE_PREFIX = 'echo-paper-appearance:';

function loadStored(channelId: string): PaperAppearanceMode | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${channelId}`);
    if (raw === 'light' || raw === 'dark' || raw === 'amber') return raw;
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

/** Read the global app theme from the DOM so paper inherits it on first open. */
export function detectGlobalAppearance(): PaperAppearanceMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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
    const order: PaperAppearanceMode[] = ['light', 'dark', 'amber'];
    const idx = order.indexOf(appearance.value);
    setAppearance(order[(idx + 1) % order.length]);
  }

  const pageSurfaceStyle = computed(() => {
    const colors = readPaperPageColors(opts.contentJson.value);
    const hex =
      appearance.value === 'dark'
        ? colors.dark
        : appearance.value === 'amber'
          ? (colors.light ?? '#fffbf0')
          : colors.light;
    if (!hex) return {};
    return derivePaperSurfaceStyle(hex);
  });

  return {
    appearance,
    setAppearance,
    toggleAppearance,
    pageSurfaceStyle,
  };
}
