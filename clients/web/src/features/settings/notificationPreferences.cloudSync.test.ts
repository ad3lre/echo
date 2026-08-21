import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const fetchMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/api/echo/attention', () => ({
  fetchEchoPersonalNotificationPreferences: (...args: unknown[]) =>
    fetchMock(...args),
  putEchoPersonalNotificationPreferences: (...args: unknown[]) =>
    putMock(...args),
}));

vi.mock('@/features/layout/failures/primaryFlowFailure', () => ({
  reportPrimaryFlowFailure: vi.fn(),
}));

import { useNotificationPreferencesStore } from './notificationPreferences';

function stubLocalStorage(): void {
  const storage: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
    clear: () => {
      for (const k of Object.keys(storage)) delete storage[k];
    },
    key: (i: number) => Object.keys(storage)[i] ?? null,
    get length() {
      return Object.keys(storage).length;
    },
  });
}

describe('notificationPreferences cloud sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    putMock.mockReset();
    putMock.mockResolvedValue(undefined);
    stubLocalStorage();
    setActivePinia(createPinia());
  });

  it('applies remote settings on pull without pushing them back', async () => {
    fetchMock.mockResolvedValue({ desktopAlerts: false, soundEffects: false });
    const store = useNotificationPreferencesStore();

    await store.configureCloudSync(() => 'tok');
    await nextTick();
    await vi.runAllTimersAsync();

    expect(store.settings.desktopAlerts).toBe(false);
    expect(store.settings.soundEffects).toBe(false);
    // Applying a remote pull must not echo back as a push.
    expect(putMock).not.toHaveBeenCalled();
  });

  it('seeds the server when no remote settings exist yet', async () => {
    fetchMock.mockResolvedValue(null);
    const store = useNotificationPreferencesStore();

    await store.configureCloudSync(() => 'tok');
    await vi.runAllTimersAsync();

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0]?.[0]).toBe('tok');
  });

  it('pushes debounced edits after hydration', async () => {
    fetchMock.mockResolvedValue({ desktopAlerts: true });
    const store = useNotificationPreferencesStore();

    await store.configureCloudSync(() => 'tok');
    await vi.runAllTimersAsync();
    putMock.mockClear();

    store.patch({ mentionHighlights: false });
    await nextTick();
    await vi.runAllTimersAsync();

    expect(putMock).toHaveBeenCalledTimes(1);
    const payload = putMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.mentionHighlights).toBe(false);
  });

  it('stops pushing after cloud sync is disabled', async () => {
    fetchMock.mockResolvedValue({ desktopAlerts: true });
    const store = useNotificationPreferencesStore();
    await store.configureCloudSync(() => 'tok');
    await vi.runAllTimersAsync();
    putMock.mockClear();

    store.disableCloudSync();
    store.patch({ mentionHighlights: false });
    await nextTick();
    await vi.runAllTimersAsync();

    expect(putMock).not.toHaveBeenCalled();
  });
});
