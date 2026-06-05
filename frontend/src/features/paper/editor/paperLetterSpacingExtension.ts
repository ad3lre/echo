import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperLetterSpacing: {
      setLetterSpacing: (spacing: string | null) => ReturnType;
      unsetLetterSpacing: () => ReturnType;
    };
  }
}

/** Inline letter-spacing via the `textStyle` mark — Canva-style character tracking. */
export const PaperLetterSpacing = Extension.create({
  name: 'paperLetterSpacing',

  addOptions() {
    return { types: ['textStyle'] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => {
              const spacing = element.style.letterSpacing;
              if (!spacing) return null;
              return spacing;
            },
            renderHTML: (attributes) => {
              if (!attributes.letterSpacing) return {};
              return { style: `letter-spacing: ${attributes.letterSpacing}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLetterSpacing:
        (letterSpacing: string | null) =>
        ({ chain }) => {
          if (!letterSpacing) {
            return chain()
              .setMark('textStyle', { letterSpacing: null })
              .removeEmptyTextStyle()
              .run();
          }
          return chain().setMark('textStyle', { letterSpacing }).run();
        },
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', { letterSpacing: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
