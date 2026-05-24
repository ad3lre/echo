import { describe, expect, it, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { usePaperAppearance } from '@/features/paper/composables/usePaperAppearance';

const storage = new Map<string, string>();

describe('usePaperAppearance', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
  });

  it('persists appearance per channel', async () => {
    const channelId = ref('ch-a');
    const appearance = usePaperAppearance({
      channelId,
      contentJson: ref(null),
    });
    appearance.setAppearance('dark');
    expect(storage.get('echo-paper-appearance:ch-a')).toBe('dark');
    channelId.value = 'ch-b';
    await nextTick();
    expect(appearance.appearance.value).toBe('light');
    appearance.setAppearance('dark');
    channelId.value = 'ch-a';
    await nextTick();
    expect(appearance.appearance.value).toBe('dark');
  });
});
