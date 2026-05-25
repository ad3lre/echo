import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  usePaperAppearance,
  detectGlobalAppearance,
} from '@/features/paper/composables/usePaperAppearance';

const storage = new Map<string, string>();

function stubDocumentTheme(theme: string | undefined) {
  const dataset: Record<string, string | undefined> = {};
  if (theme) dataset.theme = theme;
  vi.stubGlobal('document', {
    documentElement: { dataset },
  });
}

describe('usePaperAppearance', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    stubDocumentTheme('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(appearance.appearance.value).toBe('dark');
    appearance.setAppearance('light');
    channelId.value = 'ch-a';
    await nextTick();
    expect(appearance.appearance.value).toBe('dark');
  });

  it('defaults to global dark theme when no stored preference', () => {
    stubDocumentTheme('dark');
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('dark');
  });

  it('defaults to global light theme when no stored preference', () => {
    stubDocumentTheme('light');
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('light');
  });

  it('detectGlobalAppearance reads data-theme from document', () => {
    stubDocumentTheme('light');
    expect(detectGlobalAppearance()).toBe('light');
    stubDocumentTheme('dark');
    expect(detectGlobalAppearance()).toBe('dark');
    stubDocumentTheme(undefined);
    expect(detectGlobalAppearance()).toBe('dark');
  });
});
