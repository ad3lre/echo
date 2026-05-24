import { computed, ref, watch, type Ref } from 'vue';
import {
  derivePaperSurfaceStyle,
  readPaperPageColors,
} from '@/features/paper/editor/paperPageAppearance';

export type PaperAppearanceMode = 'light' | 'dark';

const STORAGE_PREFIX = 'echo-paper-appearance:';

function loadStored(channelId: string): PaperAppearanceMode | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${channelId}`);
    if (raw === 'light' || raw === 'dark') return raw;
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

export function usePaperAppearance(opts: {
  channelId: Ref<string>;
  contentJson: Ref<Record<string, unknown> | null | undefined>;
}) {
  const appearance = ref<PaperAppearanceMode>('light');

  watch(
    () => opts.channelId.value,
    (id) => {
      if (!id.trim()) return;
      appearance.value = loadStored(id) ?? 'light';
    },
    { immediate: true },
  );

  function setAppearance(mode: PaperAppearanceMode) {
    appearance.value = mode;
    const id = opts.channelId.value.trim();
    if (id) store(id, mode);
  }

  function toggleAppearance() {
    setAppearance(appearance.value === 'light' ? 'dark' : 'light');
  }

  const pageSurfaceStyle = computed(() => {
    const colors = readPaperPageColors(opts.contentJson.value);
    const hex = appearance.value === 'dark' ? colors.dark : colors.light;
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
