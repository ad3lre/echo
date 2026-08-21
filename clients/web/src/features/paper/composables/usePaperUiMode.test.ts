import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { usePaperUiMode } from '@/features/paper/composables/usePaperUiMode';

const storage = new Map<string, string>();

describe('usePaperUiMode', () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => storage.clear(),
    });
  });

  it('defaults to edit when author permissions load without stored preference', async () => {
    const canAuthor = ref(false);
    const canComment = ref(false);
    const ui = usePaperUiMode({
      channelId: ref('ch-1'),
      canAuthor,
      canComment,
    });
    expect(ui.effectiveMode.value).toBe('view');
    canAuthor.value = true;
    await nextTick();
    expect(ui.effectiveMode.value).toBe('edit');
  });

  it('respects stored view preference for authors', async () => {
    storage.set('echo-paper-ui-mode:ch-2', 'view');
    const ui = usePaperUiMode({
      channelId: ref('ch-2'),
      canAuthor: ref(true),
      canComment: ref(false),
    });
    await nextTick();
    expect(ui.effectiveMode.value).toBe('view');
  });

  it('clamps edit mode when author permission is revoked', async () => {
    const canAuthor = ref(true);
    const ui = usePaperUiMode({
      channelId: ref('ch-3'),
      canAuthor,
      canComment: ref(false),
    });
    ui.setMode('edit');
    expect(ui.effectiveMode.value).toBe('edit');
    canAuthor.value = false;
    await nextTick();
    expect(ui.effectiveMode.value).toBe('view');
  });
});
