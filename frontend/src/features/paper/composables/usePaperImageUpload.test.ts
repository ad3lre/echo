import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { insertPaperImage } from '@/features/paper/editor/insertPaperImage';

describe('paper image insertion', () => {
  it('setImage inserts a block image into the document', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'hi' }],
          },
        ],
      },
    });

    insertPaperImage(editor, 'https://example.com/test.png');

    const json = editor.getJSON() as {
      content?: { type: string; attrs?: { src?: string } }[];
    };
    const image = json.content?.find((n) => n.type === 'image');
    expect(image?.attrs?.src).toBe('https://example.com/test.png');

    editor.destroy();
  });
});
