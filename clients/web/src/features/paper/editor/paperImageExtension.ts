import Image from '@tiptap/extension-image';

export type PaperImageAlign = 'left' | 'center' | 'right';
export type PaperImageWrap = 'none' | 'left' | 'right';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperImage: {
      setImageWidth: (width: string | null) => ReturnType;
      setImageAlign: (align: PaperImageAlign) => ReturnType;
      setImageWrap: (wrap: PaperImageWrap) => ReturnType;
      updateImageAttributes: (attrs: {
        width?: string | null;
        align?: PaperImageAlign;
        wrap?: PaperImageWrap;
      }) => ReturnType;
    };
  }
}

/** Extended Image node with width, alignment, and text-wrap support — Canva-style. */
export const PaperImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          const style = element.style.width;
          return width || style || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width as string };
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) => {
          const dataAlign = element.getAttribute('data-paper-image-align');
          if (
            dataAlign === 'left' ||
            dataAlign === 'center' ||
            dataAlign === 'right'
          ) {
            return dataAlign;
          }
          // Infer from style/classes
          const style = element.style;
          const marginLeft = style.marginLeft;
          const marginRight = style.marginRight;
          if (marginLeft === '0' && marginRight === 'auto') return 'left';
          if (marginLeft === 'auto' && marginRight === '0') return 'right';
          if (marginLeft === 'auto' && marginRight === 'auto') return 'center';
          return 'center';
        },
        renderHTML: (attributes) => {
          const align = attributes.align as PaperImageAlign | undefined;
          return { 'data-paper-image-align': align ?? 'center' };
        },
      },
      wrap: {
        default: 'none',
        parseHTML: (element) => {
          const dataWrap = element.getAttribute('data-paper-image-wrap');
          if (
            dataWrap === 'left' ||
            dataWrap === 'right' ||
            dataWrap === 'none'
          ) {
            return dataWrap;
          }
          // Infer from float style
          const float = element.style.float;
          if (float === 'left') return 'left';
          if (float === 'right') return 'right';
          return 'none';
        },
        renderHTML: (attributes) => {
          const wrap = attributes.wrap as PaperImageWrap | undefined;
          return { 'data-paper-image-wrap': wrap ?? 'none' };
        },
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { width, align, wrap, ...baseAttrs } = HTMLAttributes;
    const attrs: Record<string, string> = {
      ...baseAttrs,
      class: this.options.HTMLAttributes?.class || 'paper-editor-image',
    };
    const src = node.attrs.src;
    if (typeof src === 'string' && src.trim()) {
      attrs.src = src.trim();
    }

    // Add alignment class
    if (align && align !== 'center') {
      attrs.class += ` paper-editor-image--align-${align}`;
    }

    // Add wrap class and float style
    if (wrap && wrap !== 'none') {
      attrs.class += ` paper-editor-image--wrap-${wrap}`;
      attrs.style = `${attrs.style || ''} float: ${wrap};`.trim();
    } else {
      // Default center alignment margin styles when not floating
      if (align === 'left') {
        attrs.style =
          `${attrs.style || ''} margin-left: 0; margin-right: auto;`.trim();
      } else if (align === 'right') {
        attrs.style =
          `${attrs.style || ''} margin-left: auto; margin-right: 0;`.trim();
      } else if (align === 'center') {
        attrs.style =
          `${attrs.style || ''} margin-left: auto; margin-right: auto;`.trim();
      }
    }

    // Add width
    if (width) {
      attrs.style = `${attrs.style || ''} width: ${width};`.trim();
    }

    return ['img', attrs];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageWidth:
        (width: string | null) =>
        ({ commands }) => {
          return commands.updateAttributes('image', { width });
        },
      setImageAlign:
        (align: PaperImageAlign) =>
        ({ commands }) => {
          return commands.updateAttributes('image', { align });
        },
      setImageWrap:
        (wrap: PaperImageWrap) =>
        ({ commands }) => {
          return commands.updateAttributes('image', { wrap });
        },
      updateImageAttributes:
        (attrs: {
          width?: string | null;
          align?: PaperImageAlign;
          wrap?: PaperImageWrap;
        }) =>
        ({ commands }) => {
          return commands.updateAttributes('image', attrs);
        },
    };
  },
});
