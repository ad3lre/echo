import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  usePaperAppearance,
  detectGlobalAppearance,
} from '@/features/paper/composables/usePaperAppearance';

const storage = new Map<string, string>();

function stubDocumentTheme(opts: {
  theme?: string;
  echoLightVariant?: string;
  echoDarkVariant?: string;
}) {
  const dataset: Record<string, string | undefined> = {};
  if (opts.theme) dataset.theme = opts.theme;
  if (opts.echoLightVariant) dataset.echoLightVariant = opts.echoLightVariant;
  if (opts.echoDarkVariant) dataset.echoDarkVariant = opts.echoDarkVariant;
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
    stubDocumentTheme({ theme: 'dark' });
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
    stubDocumentTheme({ theme: 'dark' });
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('dark');
  });

  it('defaults to global light theme when no stored preference', () => {
    stubDocumentTheme({ theme: 'light' });
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('light');
  });

  it('defaults to sunny when global light variant is sunny', () => {
    stubDocumentTheme({ theme: 'light', echoLightVariant: 'sunny' });
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('sunny');
  });

  it('defaults to amoled when global dark variant is amoled', () => {
    stubDocumentTheme({ theme: 'dark', echoDarkVariant: 'amoled' });
    const result = usePaperAppearance({
      channelId: ref('ch-new'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('amoled');
  });

  it('migrates stored amber to sunny', async () => {
    storage.set('echo-paper-appearance:ch-old', 'amber');
    const result = usePaperAppearance({
      channelId: ref('ch-old'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('sunny');
  });

  it('detectGlobalAppearance maps all four Echo main themes', () => {
    stubDocumentTheme({ theme: 'light' });
    expect(detectGlobalAppearance()).toBe('light');
    stubDocumentTheme({ theme: 'light', echoLightVariant: 'sunny' });
    expect(detectGlobalAppearance()).toBe('sunny');
    stubDocumentTheme({ theme: 'dark' });
    expect(detectGlobalAppearance()).toBe('dark');
    stubDocumentTheme({ theme: 'dark', echoDarkVariant: 'amoled' });
    expect(detectGlobalAppearance()).toBe('amoled');
    stubDocumentTheme({});
    expect(detectGlobalAppearance()).toBe('dark');
  });

  it('cycles through all four modes on toggle', () => {
    stubDocumentTheme({ theme: 'light', echoLightVariant: 'sunny' });
    const result = usePaperAppearance({
      channelId: ref('ch-cycle'),
      contentJson: ref(null),
    });
    expect(result.appearance.value).toBe('sunny');
    result.toggleAppearance();
    expect(result.appearance.value).toBe('light');
    result.toggleAppearance();
    expect(result.appearance.value).toBe('dark');
    result.toggleAppearance();
    expect(result.appearance.value).toBe('amoled');
    result.toggleAppearance();
    expect(result.appearance.value).toBe('sunny');
  });
});
