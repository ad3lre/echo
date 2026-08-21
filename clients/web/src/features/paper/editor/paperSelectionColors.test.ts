import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { analyzePaperSelectionColors } from '@/features/paper/editor/paperSelectionColors';

describe('analyzePaperSelectionColors', () => {
  it('reports default text when no color mark is set', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Plain' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(2);
    const colors = analyzePaperSelectionColors(editor);
    editor.destroy();
    expect(colors.textIsDefault).toBe(true);
    expect(colors.textMixed).toBe(false);
  });
});
