import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  EXTENDED_VISIBLE_SERVER_RAIL_SLOT_COUNT,
  VISIBLE_SERVER_RAIL_SLOT_COUNT,
} from '@/features/layout/composables/rail/serverRailReorder';

export type ServerRailUiPreferences = {
  /**
   * Keep the server icon cluster visible on the action rail even when DM or
   * Explore is selected (normally the folder collapses off the servers tab).
   */
  serversAlwaysOn: boolean;
  /**
   * Show up to 10 guild icons on the side rail instead of the default 5.
   */
  extendedServerList: boolean;
};

const STORAGE_KEY = 'echo-server-rail-ui-preferences-v1';

const DEFAULTS: ServerRailUiPreferences = {
  serversAlwaysOn: false,
  extendedServerList: false,
};

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function readStored(): Partial<ServerRailUiPreferences> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ServerRailUiPreferences>;
  } catch {
    return {};
  }
}

function persist(settings: ServerRailUiPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadServerRailUiPreferences(): ServerRailUiPreferences {
  const s = readStored();
  return {
    serversAlwaysOn: isBool(s.serversAlwaysOn)
      ? s.serversAlwaysOn
      : DEFAULTS.serversAlwaysOn,
    extendedServerList: isBool(s.extendedServerList)
      ? s.extendedServerList
      : DEFAULTS.extendedServerList,
  };
}

export function resolveVisibleServerRailSlotCount(
  extendedServerList: boolean,
): number {
  return extendedServerList
    ? EXTENDED_VISIBLE_SERVER_RAIL_SLOT_COUNT
    : VISIBLE_SERVER_RAIL_SLOT_COUNT;
}

export const useServerRailUiPreferencesStore = defineStore(
  'serverRailUiPreferences',
  () => {
    const initial = loadServerRailUiPreferences();
    const serversAlwaysOn = ref(initial.serversAlwaysOn);
    const extendedServerList = ref(initial.extendedServerList);

    const visibleSlotCount = computed(() =>
      resolveVisibleServerRailSlotCount(extendedServerList.value),
    );

    /** Joined-server count at which the Extra servers control appears. */
    const extraServersMinJoined = computed(() => visibleSlotCount.value + 1);

    watch(
      [serversAlwaysOn, extendedServerList],
      () => {
        persist({
          serversAlwaysOn: serversAlwaysOn.value,
          extendedServerList: extendedServerList.value,
        });
      },
      { flush: 'sync' },
    );

    function setServersAlwaysOn(next: boolean): void {
      serversAlwaysOn.value = !!next;
    }

    function setExtendedServerList(next: boolean): void {
      extendedServerList.value = !!next;
    }

    function hydrateFromStorage(): void {
      const next = loadServerRailUiPreferences();
      serversAlwaysOn.value = next.serversAlwaysOn;
      extendedServerList.value = next.extendedServerList;
    }

    return {
      serversAlwaysOn,
      extendedServerList,
      visibleSlotCount,
      extraServersMinJoined,
      setServersAlwaysOn,
      setExtendedServerList,
      hydrateFromStorage,
    };
  },
);
