import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { usePaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';
import { getPaperMarkdownRenderInline } from '@/features/paper/editor/paperMarkdownRenderState';

const storage = new Map<string, string>();

describe('usePaperSourceViewMode', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to inline and persists per channel', async () => {
    const channelId = ref('ch-a');
    const view = usePaperSourceViewMode({ channelId });
    expect(view.mode.value).toBe('inline');

    view.setMode('raw');
    expect(storage.get('echo-paper-source-view:ch-a')).toBe('raw');
    expect(getPaperMarkdownRenderInline()).toBe(false);

    channelId.value = 'ch-b';
    await nextTick();
    expect(view.mode.value).toBe('inline');

    channelId.value = 'ch-a';
    await nextTick();
    expect(view.mode.value).toBe('raw');
  });

  it('toggleMode switches between raw and inline', () => {
    const view = usePaperSourceViewMode({ channelId: ref('ch-x') });
    view.toggleMode();
    expect(view.mode.value).toBe('raw');
    view.toggleMode();
    expect(view.mode.value).toBe('inline');
  });
});
