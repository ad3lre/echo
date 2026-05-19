import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * In-app desktop update banner (fed by {@link useDesktopUpdateMonitor}).
 */
export const useDesktopUpdateStore = defineStore('desktopUpdate', () => {
  const pendingVersion = ref<string | null>(null);

  function setPending(version: string) {
    pendingVersion.value = version;
  }

  function clearPending() {
    pendingVersion.value = null;
  }

  return { pendingVersion, setPending, clearPending };
});
