import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import {
  clearStoredPaperEditorSelection,
  getStoredPaperEditorSelection,
  onPaperFormatBarMouseDown,
  runPaperFormatCommand,
  snapshotPaperEditorSelection,
} from '@/features/paper/editor/paperFormatSelection';

function createEditor(content?: object) {
  return new Editor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
    ],
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

describe('paperFormatSelection', () => {
  it('snapshots and restores range when applying a mark command', () => {
    const editor = createEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    snapshotPaperEditorSelection(editor);
    editor.commands.setTextSelection(6);

    runPaperFormatCommand(editor, (chain) =>
      chain.extendMarkRange('textStyle').setFontFamily('Georgia'),
    );

    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    expect(editor.getAttributes('textStyle').fontFamily).toBe('Georgia');
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
