import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import { analyzePaperSelectionFormat } from '@/features/paper/editor/paperSelectionFormat';
import { PAPER_BLOCK_DEFAULT_FONT_PX } from '@/features/paper/editor/paperTypography';

describe('analyzePaperSelectionFormat', () => {
  it('uses H1 default px when caret in heading without fontSize mark', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(2);
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.heading).toBe('h1');
    expect(fmt.fontSizePx).toBe(PAPER_BLOCK_DEFAULT_FONT_PX.heading1);
    expect(fmt.fontSizeUsesDefault).toBe(true);
  });

  it('reports mixed heading when selection spans h1 and paragraph', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection({ from: 2, to: 12 });
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.heading).toBe('mixed');
  });

  it('reports letter spacing when set via textStyle mark', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Normal ' },
              {
                type: 'text',
                text: 'Spaced',
                marks: [{ type: 'textStyle', attrs: { letterSpacing: '2px' } }],
              },
            ],
          },
        ],
      },
    });
    editor.commands.setTextSelection({ from: 9, to: 15 });
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.letterSpacing).toBe('2px');
    expect(fmt.letterSpacingMixed).toBe(false);
  });

  it('reports line height when set via textStyle mark', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Tall text',
                marks: [{ type: 'textStyle', attrs: { lineHeight: '2' } }],
              },
            ],
          },
        ],
      },
    });
    editor.commands.setTextSelection({ from: 2, to: 6 });
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.lineHeight).toBe('2');
    expect(fmt.lineHeightMixed).toBe(false);
  });

  it('reports text outline when set via textStyle mark', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Outlined',
                marks: [
                  {
                    type: 'textStyle',
                    attrs: {
                      textStrokeWidth: '1px',
                      textStrokeColor: 'currentColor',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    editor.commands.setTextSelection({ from: 2, to: 8 });
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.textOutlineWidth).toBe('1px');
    expect(fmt.textOutlineMixed).toBe(false);
  });

  it('reports paragraph indent from data-indent attr', () => {
    const editor = new Editor({
      extensions: buildPaperEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 2 },
            content: [{ type: 'text', text: 'Indented paragraph' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(5);
    const fmt = analyzePaperSelectionFormat(editor);
    editor.destroy();
    expect(fmt.indent).toBe(2);
    expect(fmt.indentMixed).toBe(false);
  });
});
