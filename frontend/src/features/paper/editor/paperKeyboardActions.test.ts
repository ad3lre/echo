import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { paperToggleMark } from '@/features/paper/editor/paperKeyboardActions';
import { snapshotPaperEditorSelection } from '@/features/paper/editor/paperFormatSelection';
import {
  cycleFontInCatalog,
  cycleHighlightColor,
  stepFontSizePx,
} from '@/features/paper/editor/paperKeyboardHelpers';
import {
  PAPER_FONT_CATALOG,
  PAPER_FONT_SIZE_PRESETS,
} from '@/features/paper/editor/paperTypography';

describe('stepFontSizePx', () => {
  it('steps up through presets', () => {
    expect(stepFontSizePx(14, 'up')).toBe(16);
    expect(stepFontSizePx(16, 'up')).toBe(18);
  });

  it('steps down through presets', () => {
    expect(stepFontSizePx(16, 'down')).toBe(14);
    expect(stepFontSizePx(14, 'down')).toBe(12);
  });

  it('clamps at preset bounds', () => {
    expect(stepFontSizePx(PAPER_FONT_SIZE_PRESETS[0]!, 'down')).toBe(
      PAPER_FONT_SIZE_PRESETS[0],
    );
    const max = PAPER_FONT_SIZE_PRESETS[PAPER_FONT_SIZE_PRESETS.length - 1]!;
    expect(stepFontSizePx(max, 'up')).toBe(max);
  });
});

describe('cycleFontInCatalog', () => {
  it('wraps forward and backward through the catalog', () => {
    const first = PAPER_FONT_CATALOG[0]!;
    const second = PAPER_FONT_CATALOG[1]!;
    const last = PAPER_FONT_CATALOG[PAPER_FONT_CATALOG.length - 1]!;

    expect(cycleFontInCatalog(first.family, 'next').id).toBe(second.id);
    expect(cycleFontInCatalog(second.family, 'prev').id).toBe(first.id);
    expect(cycleFontInCatalog(last.family, 'next').id).toBe(first.id);
    expect(cycleFontInCatalog(first.family, 'prev').id).toBe(last.id);
  });
});

describe('paperToggleMark', () => {
  it('toggles bold and italic on the current selection', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
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
    editor.commands.setTextSelection({ from: 1, to: 6 });
    snapshotPaperEditorSelection(editor);

    paperToggleMark(editor, 'toggleBold');
    expect(
      editor.state.doc
        .resolve(2)
        .marks()
        .some((mark) => mark.type.name === 'bold'),
    ).toBe(true);

    paperToggleMark(editor, 'toggleItalic');
    expect(
      editor.state.doc
        .resolve(2)
        .marks()
        .some((mark) => mark.type.name === 'italic'),
    ).toBe(true);

    editor.destroy();
  });
});

describe('cycleHighlightColor', () => {
  it('starts at first color when none is set', () => {
    expect(cycleHighlightColor(null)).toBe('#fef08a');
  });

  it('cycles through highlight swatches', () => {
    expect(cycleHighlightColor('#fef08a')).toBe('#bbf7d0');
    expect(cycleHighlightColor('#fed7aa')).toBe('#e9d5ff');
  });
});
