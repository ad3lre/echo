import { Extension, type Command } from '@tiptap/core';
import { PAPER_DEFAULT_FONT_FAMILY } from '@shared/types/paperEmptyDocument';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperDocument: {
      setPaperDefaultFont: (family: string) => ReturnType;
      setPaperPageColorLight: (hex: string | null) => ReturnType;
      setPaperPageColorDark: (hex: string | null) => ReturnType;
    };
  }
}

/** Document-level typography and page appearance prefs. */
export const PaperDocumentAttributes = Extension.create({
  name: 'paperDocumentAttributes',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          defaultFontFamily: {
            default: PAPER_DEFAULT_FONT_FAMILY,
            parseHTML: (element) =>
              element.getAttribute('data-default-font') ??
              PAPER_DEFAULT_FONT_FAMILY,
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

  addCommands() {
    const setDocAttrs =
      (patch: Record<string, unknown>): Command =>
      ({ tr, dispatch }) => {
        if (dispatch) {
          for (const [key, value] of Object.entries(patch)) {
            tr.setDocAttribute(key, value);
          }
          dispatch(tr);
        }
        return true;
      };

    return {
      setPaperDefaultFont: (family: string) =>
        setDocAttrs({
          defaultFontFamily: family.trim() || PAPER_DEFAULT_FONT_FAMILY,
        }),
      setPaperPageColorLight: (hex: string | null) =>
        setDocAttrs({
          paperPageColorLight: hex?.trim() || null,
        }),
      setPaperPageColorDark: (hex: string | null) =>
        setDocAttrs({
          paperPageColorDark: hex?.trim() || null,
        }),
    };
  },
});

export function readPaperDefaultFont(
  doc: Record<string, unknown> | null | undefined,
): string {
  if (!doc || typeof doc !== 'object') return PAPER_DEFAULT_FONT_FAMILY;
  const attrs = doc.attrs;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    const f = (attrs as Record<string, unknown>).defaultFontFamily;
    if (typeof f === 'string' && f.trim()) return f.trim();
  }
  return PAPER_DEFAULT_FONT_FAMILY;
}
