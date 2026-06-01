import { computed, ref, unref, watch, type MaybeRef } from 'vue';

const LEGACY_GLOBAL_STORAGE_KEY = 'echo.channelMoveCrossCategoryPermission';

export type ChannelMoveCrossCategoryPermission = 'sync' | 'keep' | 'ask';

function perServerStorageKey(serverId: string): string {
  return `${LEGACY_GLOBAL_STORAGE_KEY}.${serverId}`;
}

function parseStoredMode(
  raw: string | null | undefined,
): ChannelMoveCrossCategoryPermission | null {
  const v = raw?.trim();
  if (v === 'sync' || v === 'keep' || v === 'ask') return v;
  return null;
}

export function getChannelMoveCrossCategoryPermission(
  serverId?: string | null,
): ChannelMoveCrossCategoryPermission {
  if (typeof window === 'undefined') return 'ask';
  try {
    const sid = serverId?.trim();
    if (sid) {
      const perServer = parseStoredMode(
        window.localStorage.getItem(perServerStorageKey(sid)),
      );
      if (perServer) return perServer;
    }
    const legacy = parseStoredMode(
      window.localStorage.getItem(LEGACY_GLOBAL_STORAGE_KEY),
    );
    if (legacy) return legacy;
  } catch {
    /* ignore */
  }
  return 'ask';
}

export function setChannelMoveCrossCategoryPermission(
  mode: ChannelMoveCrossCategoryPermission,
  serverId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const sid = serverId?.trim();
    if (sid) {
      window.localStorage?.setItem(perServerStorageKey(sid), mode);
      return;
    }
    window.localStorage?.setItem(LEGACY_GLOBAL_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** New servers start on “Decide each time” regardless of legacy global preference. */
export function seedChannelMoveCrossCategoryPreferenceForServer(
  serverId: string,
): void {
  const sid = serverId.trim();
  if (!sid) return;
  setChannelMoveCrossCategoryPermission('ask', sid);
}

function readStored(
  serverId?: string | null,
): ChannelMoveCrossCategoryPermission {
  return getChannelMoveCrossCategoryPermission(serverId);
}

/** When dragging a channel into another category: inherit new category permission rows vs keep channel overrides (compact). */
export function useChannelMoveCrossCategoryPreference(
  serverId?: MaybeRef<string | null | undefined>,
) {
  const mode = ref<ChannelMoveCrossCategoryPermission>(
    readStored(unref(serverId)),
  );

  watch(
    () => unref(serverId),
    (sid) => {
      mode.value = readStored(sid);
    },
  );

  watch(mode, (next) => {
    setChannelMoveCrossCategoryPermission(next, unref(serverId));
  });

  const syncWithNewCategory = computed({
    get: () => mode.value === 'sync',
    set: (v: boolean) => {
      mode.value = v ? 'sync' : 'keep';
    },
  });

  return { mode, syncWithNewCategory };
}
