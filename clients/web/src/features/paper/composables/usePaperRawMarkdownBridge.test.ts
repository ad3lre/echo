import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import { usePaperRawMarkdownBridge } from '@/features/paper/composables/usePaperRawMarkdownBridge';

describe('usePaperRawMarkdownBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads markdown when entering raw mode', async () => {
    const mode = ref<'inline' | 'raw'>('inline');
    const editor = ref<Editor | null>(null);
    editor.value = {
      getJSON: () => ({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }),
      commands: { setContent: vi.fn() },
    } as unknown as Editor;

    const bridge = usePaperRawMarkdownBridge({
      mode,
      editor: editor as Ref<Editor | null | undefined>,
    });
    mode.value = 'raw';
    await nextTick();
    expect(bridge.rawMarkdown.value).toBe('Hello');
  });
});
