import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { analyzePaperSelectionFormat } from '@/features/paper/editor/paperSelectionFormat';
import { PAPER_BLOCK_DEFAULT_FONT_PX } from '@/features/paper/editor/paperTypography';

describe('analyzePaperSelectionFormat', () => {
  it('uses H1 default px when caret in heading without fontSize mark', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(2);
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.heading).toBe('h1');
    expect(fmt.fontSizePx).toBe(PAPER_BLOCK_DEFAULT_FONT_PX.heading1);
    expect(fmt.fontSizeUsesDefault).toBe(true);
  });

  it('reports mixed heading when selection spans h1 and paragraph', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection({ from: 2, to: 12 });
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.heading).toBe('mixed');
  });
});
