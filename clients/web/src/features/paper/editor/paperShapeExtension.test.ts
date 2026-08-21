import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';

type PaperJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PaperJsonNode[];
  text?: string;
};

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

  it('stores optional text and image attributes on shapes', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paperShape',
            attrs: {
              shape: 'rectangle',
              fill: '#3b82f6',
              width: '120px',
              height: '120px',
              imageSrc: 'https://example.com/photo.png',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Label' }],
              },
            ],
          },
        ],
      },
    });
    const shape = editor.getJSON().content?.[0] as PaperJsonNode | undefined;
    expect(shape?.attrs?.imageSrc).toBe('https://example.com/photo.png');
    expect(shape?.content?.[0]?.content?.[0]?.text).toBe('Label');
    editor.destroy();
  });
});
