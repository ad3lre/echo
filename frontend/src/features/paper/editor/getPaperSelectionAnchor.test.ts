import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { getPaperSelectionAnchor } from '@/features/paper/editor/paperSelectionAnchor';

describe('getPaperSelectionAnchor', () => {
  it('resolves anchor for paragraph inside bullet list', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    attrs: { paperBlockId: 'nested-list-paragraph' },
                    content: [{ type: 'text', text: 'List item text' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const snippet = 'List item text';
    let from = -1;
    let to = -1;
    const size = editor.state.doc.content.size;
    for (let p = 0; p < size; p++) {
      const slice = editor.state.doc.textBetween(
        p,
        Math.min(p + snippet.length, size),
      );
      if (slice === snippet) {
        from = p;
        to = p + snippet.length;
        break;
      }
    }
    expect(from).toBeGreaterThan(-1);
    editor.commands.setTextSelection({ from, to });
    const anchor = getPaperSelectionAnchor(editor);
    editor.destroy();
    expect(anchor).not.toBeNull();
    expect(anchor?.anchorBlockId).toBe('nested-list-paragraph');
    expect(anchor?.anchorQuote).toContain('List item');
  });
});
