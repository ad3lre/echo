import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/vue-3';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import {
  clearStoredPaperEditorSelection,
  getStoredPaperEditorSelection,
  onPaperFormatBarMouseDown,
  runPaperFormatCommand,
  snapshotPaperEditorSelection,
} from '@/features/paper/editor/paperFormatSelection';

function createEditor(content?: object) {
  return new Editor({
    extensions: buildPaperEditorExtensions(),
    content: content ?? {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    },
  });
}

function textColorAt(editor: Editor, pos: number): string | null {
  const mark = editor.state.doc
    .resolve(pos)
    .marks()
    .find((m) => m.type.name === 'textStyle');
  const color = mark?.attrs.color;
  return typeof color === 'string' && color.trim() ? color.trim() : null;
}

describe('paperFormatSelection', () => {
  it('snapshots and restores range when applying a mark command', () => {
    const editor = createEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    snapshotPaperEditorSelection(editor);
    editor.commands.setTextSelection(6);

    runPaperFormatCommand(editor, (chain) => chain.setFontFamily('Georgia'));

    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    expect(editor.getAttributes('textStyle').fontFamily).toBe('Georgia');
    editor.destroy();
  });

  it('applies one text color over a mixed-color selection', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Red',
              marks: [
                {
                  type: 'textStyle',
                  attrs: { color: '#ef4444' },
                },
              ],
            },
            {
              type: 'text',
              text: ' blue',
              marks: [
                {
                  type: 'textStyle',
                  attrs: { color: '#2563eb' },
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.setTextSelection({ from: 1, to: 10 });
    snapshotPaperEditorSelection(editor);
    runPaperFormatCommand(editor, (chain) => chain.setColor('#22c55e'));

    expect(textColorAt(editor, 2)).toBe('#22c55e');
    expect(textColorAt(editor, 8)).toBe('#22c55e');
    editor.destroy();
  });

  it('applies text color only to the selected characters', () => {
    const editor = createEditor();
    editor.commands.setTextSelection({ from: 1, to: 12 });
    runPaperFormatCommand(editor, (chain) => chain.setFontFamily('Georgia'));

    editor.commands.setTextSelection({ from: 7, to: 12 });
    snapshotPaperEditorSelection(editor);
    runPaperFormatCommand(editor, (chain) => chain.setColor('#ff0000'));

    expect(textColorAt(editor, 2)).toBeNull();
    expect(textColorAt(editor, 8)).toBe('#ff0000');
    editor.destroy();
  });

  it('onPaperFormatBarMouseDown snapshots selection and prevents default for buttons', () => {
    const editor = createEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    clearStoredPaperEditorSelection();

    const buttonEv = {
      target: { closest: () => null },
      preventDefault: vi.fn(),
    } as unknown as MouseEvent;
    onPaperFormatBarMouseDown(editor, buttonEv);
    expect(buttonEv.preventDefault).toHaveBeenCalled();
    expect(getStoredPaperEditorSelection()).toEqual({ from: 1, to: 6 });

    clearStoredPaperEditorSelection();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const inputEv = {
      target: { closest: (sel: string) => (sel.includes('input') ? {} : null) },
      preventDefault: vi.fn(),
    } as unknown as MouseEvent;
    onPaperFormatBarMouseDown(editor, inputEv);
    expect(inputEv.preventDefault).not.toHaveBeenCalled();
    expect(getStoredPaperEditorSelection()).toEqual({ from: 1, to: 6 });

    editor.destroy();
  });
});
