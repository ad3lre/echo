import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  clearBugHunterTrace,
  setBugHunterRecordingEnabled,
} from '@/observability/bugHunterTrace';

const STORAGE_KEY = 'echo_bug_hunter_v1';

function isEnabledPayload(value: unknown): value is { enabled?: boolean } {
  if (!value || typeof value !== 'object') return false;
  const enabled = (value as { enabled?: unknown }).enabled;
  return enabled === undefined || typeof enabled === 'boolean';
}

function loadEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!isEnabledPayload(parsed)) return false;
    const p = parsed;
    return Boolean(p.enabled);
  } catch {
    return false;
  }
}

/**
 * Bug Hunter: device-local verbose tracing for user-submitted bug reports.
 * Not synced to the server.
 */
export const useBugHunterStore = defineStore('bugHunter', () => {
  const bugHunterEnabled = ref(loadEnabled());

  setBugHunterRecordingEnabled(bugHunterEnabled.value);

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled: bugHunterEnabled.value }),
      );
    } catch {
      // ignore quota
    }
  }

  function setBugHunterEnabled(enabled: boolean) {
    bugHunterEnabled.value = enabled;
    setBugHunterRecordingEnabled(enabled);
    if (!enabled) clearBugHunterTrace();
    persist();
  }

  return {
    bugHunterEnabled,
    setBugHunterEnabled,
  };
});
