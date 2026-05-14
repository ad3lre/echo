import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'echo.channelMoveCrossCategoryPermission';

export type ChannelMoveCrossCategoryPermission = 'sync' | 'keep' | 'ask';

export function getChannelMoveCrossCategoryPermission(): ChannelMoveCrossCategoryPermission {
  if (typeof window === 'undefined') return 'keep';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (v === 'sync' || v === 'keep' || v === 'ask') return v;
  } catch {
    /* ignore */
  }
  return 'keep';
}

export function setChannelMoveCrossCategoryPermission(
  mode: ChannelMoveCrossCategoryPermission,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function readStored(): ChannelMoveCrossCategoryPermission {
  return getChannelMoveCrossCategoryPermission();
}

/** When dragging a channel into another category: inherit new category permission rows vs keep channel overrides (compact). */
export function useChannelMoveCrossCategoryPreference() {
  const mode = ref<ChannelMoveCrossCategoryPermission>(readStored());

  watch(mode, (next) => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  });

  const syncWithNewCategory = computed({
    get: () => mode.value === 'sync',
    set: (v: boolean) => {
      mode.value = v ? 'sync' : 'keep';
    },
  });

  return { mode, syncWithNewCategory };
}
