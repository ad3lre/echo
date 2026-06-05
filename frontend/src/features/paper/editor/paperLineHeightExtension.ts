import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperLineHeight: {
      setLineHeight: (height: string | null) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

/** Inline line-height via the `textStyle` mark — Canva-style leading. */
export const PaperLineHeight = Extension.create({
  name: 'paperLineHeight',

  addOptions() {
    return { types: ['textStyle'] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => {
              const height = element.style.lineHeight;
              if (!height) return null;
              return height;
            },
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string | null) =>
        ({ chain }) => {
          if (!lineHeight) {
            return chain()
              .setMark('textStyle', { lineHeight: null })
              .removeEmptyTextStyle()
              .run();
          }
          return chain().setMark('textStyle', { lineHeight }).run();
        },
      unsetLineHeight:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { lineHeight: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
