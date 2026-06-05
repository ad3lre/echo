import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';

describe('PaperShape extension', () => {
  it('inserts a shape block into the document', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      },
    });
    editor.commands.insertPaperShape({
      shape: 'circle',
      fill: '#ef4444',
      width: '80px',
      height: '80px',
    });
    const json = editor.getJSON();
    const shape = json.content?.find((n) => n.type === 'paperShape');
    expect(shape?.attrs).toMatchObject({
      shape: 'circle',
      fill: '#ef4444',
      width: '80px',
      height: '80px',
    });
    editor.destroy();
  });
});
