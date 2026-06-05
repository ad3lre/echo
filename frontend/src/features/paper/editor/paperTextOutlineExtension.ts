import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperTextOutline: {
      setTextOutline: (
        width: string | null,
        color?: string | null,
      ) => ReturnType;
      unsetTextOutline: () => ReturnType;
    };
  }
}

/** Text outline via `-webkit-text-stroke` on the `textStyle` mark — Canva-style text stroke. */
export const PaperTextOutline = Extension.create({
  name: 'paperTextOutline',

  addOptions() {
    return { types: ['textStyle'] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textStrokeWidth: {
            default: null,
            parseHTML: (element) => {
              const stroke = element.style.webkitTextStrokeWidth;
              if (!stroke) return null;
              return stroke;
            },
            renderHTML: (attributes) => {
              if (!attributes.textStrokeWidth) return {};
              return {
                style: `-webkit-text-stroke-width: ${attributes.textStrokeWidth}`,
              };
            },
          },
          textStrokeColor: {
            default: null,
            parseHTML: (element) => {
              const color = element.style.webkitTextStrokeColor;
              if (!color) return null;
              return color;
            },
            renderHTML: (attributes) => {
              if (!attributes.textStrokeColor) return {};
              return {
                style: `-webkit-text-stroke-color: ${attributes.textStrokeColor}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextOutline:
        (width: string | null, color?: string | null) =>
        ({ chain }) => {
          if (!width) {
            return chain()
              .setMark('textStyle', {
                textStrokeWidth: null,
                textStrokeColor: null,
              })
              .removeEmptyTextStyle()
              .run();
          }
          return chain()
            .setMark('textStyle', {
              textStrokeWidth: width,
              textStrokeColor: color ?? 'currentColor',
            })
            .run();
        },
      unsetTextOutline:
        () =>
        ({ chain }) =>
          chain()
            .setMark('textStyle', {
              textStrokeWidth: null,
              textStrokeColor: null,
            })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
