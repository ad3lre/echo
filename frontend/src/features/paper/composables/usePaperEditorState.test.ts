import { describe, expect, it, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import StarterKit from '@tiptap/starter-kit';
import { usePaperEditorState } from '@/features/paper/composables/usePaperEditorState';

vi.mock('@/features/paper/editor/paperEditorExtensions', () => ({
  buildPaperEditorExtensions: () => [StarterKit],
}));

describe('usePaperEditorState', () => {
  it('mounts read-only editor for viewer when document is loaded', async () => {
    const mode = ref<'viewer'>('viewer');
    const editable = ref(false);
    const documentLoaded = ref(true);
    const contentJson = ref<Record<string, unknown>>({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Hi' }],
        },
      ],
    });

    const { editor } = usePaperEditorState({
      mode,
      editable,
      documentLoaded,
      contentJson,
    });

    await nextTick();
    await nextTick();
    expect(editor.value).not.toBeNull();
    expect(editor.value?.isEditable).toBe(false);
  });

  it('mounts editable editor for author when document is loaded', async () => {
    const mode = ref<'author'>('author');
    const editable = ref(true);
    const documentLoaded = ref(true);
    const contentJson = ref<Record<string, unknown>>({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Hi' }],
        },
      ],
    });

    const { editor } = usePaperEditorState({
      mode,
      editable,
      documentLoaded,
      contentJson,
    });

    await nextTick();
    await nextTick();
    expect(editor.value).not.toBeNull();
    expect(editor.value?.isEditable).toBe(true);
  });
});
