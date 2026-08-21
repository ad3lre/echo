import type { Ref } from 'vue';

/** Increments a refresh key so live channel capability queries re-run. */
export function createBumpLiveChannelCapabilitiesKey(refreshKey: Ref<number>) {
  return () => {
    refreshKey.value += 1;
  };
}
