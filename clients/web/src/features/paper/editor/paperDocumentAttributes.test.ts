import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { PAPER_DEFAULT_FONT_FAMILY } from '@shared/types/paperEmptyDocument';
import {
  PaperDocumentAttributes,
  readPaperDefaultFont,
} from '@/features/paper/editor/paperDocumentAttributes';

function createEditor() {
  return new Editor({
    extensions: [StarterKit, PaperDocumentAttributes],
    content: {
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

describe('PaperDocumentAttributes', () => {
  it('updates doc attrs when the cursor is inside content', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(3);

    expect(editor.commands.setPaperPageColorLight('#ff0000')).toBe(true);
    expect(editor.state.doc.attrs.paperPageColorLight).toBe('#ff0000');
    expect(editor.getJSON().attrs?.paperPageColorLight).toBe('#ff0000');

    expect(editor.commands.setPaperPageColorDark('#112233')).toBe(true);
    expect(editor.getJSON().attrs?.paperPageColorDark).toBe('#112233');

    expect(editor.commands.setPaperDefaultFont('Georgia, serif')).toBe(true);
    expect(editor.getJSON().attrs?.defaultFontFamily).toBe('Georgia, serif');

    editor.destroy();
  });

  it('clears page colors and trims font family', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(8);

    editor.commands.setPaperPageColorLight('#abcdef');
    editor.commands.setPaperPageColorDark('#fedcba');
    expect(editor.commands.setPaperPageColorLight(null)).toBe(true);
    expect(editor.commands.setPaperPageColorDark('  ')).toBe(true);
    expect(editor.getJSON().attrs?.paperPageColorLight).toBeNull();
    expect(editor.getJSON().attrs?.paperPageColorDark).toBeNull();

    editor.commands.setPaperDefaultFont('  ');
    expect(editor.getJSON().attrs?.defaultFontFamily).toBe(
      PAPER_DEFAULT_FONT_FAMILY,
    );

    editor.destroy();
  });

  it('readPaperDefaultFont falls back when attrs are missing', () => {
    expect(readPaperDefaultFont(null)).toBe(PAPER_DEFAULT_FONT_FAMILY);
    expect(readPaperDefaultFont({ type: 'doc' })).toBe(
      PAPER_DEFAULT_FONT_FAMILY,
    );
    expect(
      readPaperDefaultFont({
        type: 'doc',
        attrs: { defaultFontFamily: 'Inter, sans-serif' },
      }),
    ).toBe('Inter, sans-serif');
  });
});
