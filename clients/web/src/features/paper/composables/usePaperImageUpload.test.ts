// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { insertPaperImage } from '@/features/paper/editor/insertPaperImage';
import { snapshotPaperEditorCaret } from '@/features/paper/editor/paperFormatSelection';

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
      content?: {
        type: string;
        attrs?: { src?: string; align?: string; wrap?: string };
      }[];
    };
    const image = json.content?.find((n) => n.type === 'image');
    expect(image?.attrs?.src).toBe('https://example.com/test.png');
    expect(image?.attrs?.align).toBe('center');
    expect(image?.attrs?.wrap).toBe('none');
    expect(editor.getHTML()).toContain('src="https://example.com/test.png"');

    editor.destroy();
  });

  it('inserts at a snapshotted caret after the file picker blurs the editor', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'before' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'after' }],
          },
        ],
      },
    });

    editor.commands.setTextSelection(3);
    snapshotPaperEditorCaret(editor);

    insertPaperImage(editor, 'https://example.com/caret.png', {
      restoreCaret: true,
    });

    const json = editor.getJSON() as {
      content?: { type: string }[];
    };
    expect(json.content?.some((n) => n.type === 'image')).toBe(true);
    expect(json.content?.[0]?.type).toBe('paragraph');

    editor.destroy();
  });
});
