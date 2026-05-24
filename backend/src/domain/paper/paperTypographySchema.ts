/**
 * Typography extensions for server-side Paper JSON (must match the Paper editor).
 */
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Extension } from '@tiptap/core';

const PaperFontSize = Extension.create({
  name: 'paperFontSize',
  addOptions() {
    return { types: ['textStyle'] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: () => null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              const raw = String(attributes.fontSize);
              const px = raw.endsWith('px') ? raw : `${raw}px`;
              return { style: `font-size: ${px}` };
            },
          },
        },
      },
    ];
  },
});

const PaperDocumentAttributes = Extension.create({
  name: 'paperDocumentAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          defaultFontFamily: {
            default: 'Inter',
            parseHTML: () => 'Inter',
            renderHTML: (attributes) => ({
              'data-default-font': attributes.defaultFontFamily,
            }),
          },
          paperPageColorLight: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute('data-paper-page-color-light'),
            renderHTML: (attributes) => {
              const v = attributes.paperPageColorLight;
              if (!v) return {};
              return { 'data-paper-page-color-light': v };
            },
          },
          paperPageColorDark: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute('data-paper-page-color-dark'),
            renderHTML: (attributes) => {
              const v = attributes.paperPageColorDark;
              if (!v) return {};
              return { 'data-paper-page-color-dark': v };
            },
          },
        },
      },
    ];
  },
});

export const paperTypographyExtensions = [
  PaperDocumentAttributes,
  TextStyle,
  FontFamily.configure({ types: ['textStyle'] }),
  PaperFontSize,
  Color.configure({ types: ['textStyle'] }),
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
];
