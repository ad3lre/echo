import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'echo_dev_settings_v1';
const STORAGE_KEY_CHANNEL_PANEL_RUNTIME_STATS =
  'echo_channel_panel_server_runtime_stats_v1';

function loadDevModeIds(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (!raw) return false;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    // Self-heal unexpected/corrupt values.
    localStorage.removeItem(STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}

/**
 * Client-only Developer Mode conveniences (e.g. copy Echo IDs, role preview tools,
 * and experimental DM E2EE UI). Not synced to the server.
 */
function loadChannelPanelRuntimeStats(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return (
      localStorage.getItem(STORAGE_KEY_CHANNEL_PANEL_RUNTIME_STATS) === '1'
    );
  } catch {
    return false;
  }
}

export const useDevSettingsStore = defineStore('devSettings', () => {
  const devModeIdsEnabled = ref(loadDevModeIds());
  const channelPanelServerRuntimeStatsEnabled = ref(
    loadChannelPanelRuntimeStats(),
  );

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, devModeIdsEnabled.value ? '1' : '0');
    } catch {
      // ignore quota
    }
  }

  function setDevModeIdsEnabled(enabled: boolean) {
    devModeIdsEnabled.value = enabled;
    persist();
  }

  function setChannelPanelServerRuntimeStatsEnabled(enabled: boolean) {
    channelPanelServerRuntimeStatsEnabled.value = enabled;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY_CHANNEL_PANEL_RUNTIME_STATS,
        enabled ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }

  return {
    devModeIdsEnabled,
    setDevModeIdsEnabled,
    channelPanelServerRuntimeStatsEnabled,
    setChannelPanelServerRuntimeStatsEnabled,
  };
});
