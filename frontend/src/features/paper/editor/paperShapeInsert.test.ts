import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { insertPaperShapeAdjacent } from '@/features/paper/editor/paperShapeInsert';

type PaperJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PaperJsonNode[];
};

function createEditor() {
  return new Editor({
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
}

function selectFirstShapeNode(editor: Editor) {
  let shapePos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (shapePos < 0 && node.type.name === 'paperShape') shapePos = pos;
  });
  if (shapePos >= 0) {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, shapePos),
      ),
    );
  }
}

describe('insertPaperShapeAdjacent', () => {
  it('registers the paperShapeRow schema node', () => {
    const editor = createEditor();
    expect(editor.schema.nodes.paperShapeRow).toBeDefined();
    editor.destroy();
  });

  it('wraps a selected standalone shape into a row when adding another', () => {
    const editor = createEditor();
    editor.commands.insertPaperShape({
      shape: 'rectangle',
      fill: '#3b82f6',
      adjacent: false,
    });
    selectFirstShapeNode(editor);
    expect(editor.state.selection instanceof NodeSelection).toBe(true);

    const ok = insertPaperShapeAdjacent(editor, {
      shape: 'circle',
      fill: '#ef4444',
    });
    expect(ok).toBe(true);

    const json = editor.getJSON();
    const row = json.content?.find((n) => n.type === 'paperShapeRow') as
      | PaperJsonNode
      | undefined;
    expect(row?.content?.length).toBe(2);
    expect(row?.content?.[0]?.attrs?.shape).toBe('rectangle');
    expect(row?.content?.[1]?.attrs?.shape).toBe('circle');
    editor.destroy();
  });

  it('appends to an existing shape row', () => {
    const editor = createEditor();
    editor.commands.insertPaperShape({ shape: 'rectangle', adjacent: false });
    selectFirstShapeNode(editor);
    insertPaperShapeAdjacent(editor, { shape: 'circle' });
    selectFirstShapeNode(editor);

    const ok = insertPaperShapeAdjacent(editor, { shape: 'triangle' });
    expect(ok).toBe(true);

    const json = editor.getJSON();
    const row = json.content?.find((n) => n.type === 'paperShapeRow') as
      | PaperJsonNode
      | undefined;
    expect(row?.content?.length).toBe(3);
    editor.destroy();
  });
});
