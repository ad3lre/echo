import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperFontSize: {
      setFontSize: (size: string | null) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Inline font size (px) via the `textStyle` mark — Canva-style character sizing. */
export const PaperFontSize = Extension.create({
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
            parseHTML: (element) => {
              const size = element.style.fontSize;
              if (!size) return null;
              return size.endsWith('px') ? size : `${parseFloat(size)}px`;
            },
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

  addCommands() {
    return {
      setFontSize:
        (fontSize: string | null) =>
        ({ chain }) => {
          if (!fontSize) {
            return chain()
              .setMark('textStyle', { fontSize: null })
              .removeEmptyTextStyle()
              .run();
          }
          const px = fontSize.endsWith('px') ? fontSize : `${fontSize}px`;
          return chain().setMark('textStyle', { fontSize: px }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
