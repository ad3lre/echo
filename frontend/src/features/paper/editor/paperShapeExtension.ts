import { Node, mergeAttributes } from '@tiptap/core';
import { createPaperShapeNodeView } from '@/features/paper/editor/paperShapeNodeView';
import {
  alignWrapClass,
  shapeInlineStyle,
} from '@/features/paper/editor/paperShapeUtils';

export type PaperShapeKind = 'rectangle' | 'circle' | 'triangle' | 'line';
export type PaperShapeAlign = 'left' | 'center' | 'right';

export const PAPER_DEFAULT_SHAPE_FILL = '#3b82f6';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperShape: {
      insertPaperShape: (attrs: {
        shape: PaperShapeKind;
        fill?: string;
        width?: string;
        height?: string;
        align?: PaperShapeAlign;
      }) => ReturnType;
      updatePaperShapeAttributes: (attrs: {
        fill?: string;
        width?: string;
        height?: string;
        align?: PaperShapeAlign;
        shape?: PaperShapeKind;
      }) => ReturnType;
    };
  }
}

export function defaultPaperShapeSize(shape: PaperShapeKind): {
  width: string;
  height: string;
} {
  if (shape === 'line') return { width: '160px', height: '4px' };
  return { width: '120px', height: '120px' };
}

function readAttrsFromElement(element: HTMLElement): {
  shape: PaperShapeKind;
  fill: string;
  width: string;
  height: string;
  align: PaperShapeAlign;
} {
  const inner =
    element.matches('[data-paper-shape]') &&
    !element.matches('[data-paper-shape-wrap]')
      ? element
      : (element.querySelector<HTMLElement>('[data-paper-shape]') ?? element);
  const shapeRaw = inner.getAttribute('data-paper-shape');
  const shape: PaperShapeKind =
    shapeRaw === 'circle' ||
    shapeRaw === 'triangle' ||
    shapeRaw === 'line' ||
    shapeRaw === 'rectangle'
      ? shapeRaw
      : 'rectangle';
  const defaults = defaultPaperShapeSize(shape);
  const alignRaw =
    element.getAttribute('data-paper-shape-align') ??
    inner.getAttribute('data-paper-shape-align');
  const align: PaperShapeAlign =
    alignRaw === 'left' || alignRaw === 'right' || alignRaw === 'center'
      ? alignRaw
      : 'center';
  return {
    shape,
    fill:
      inner.getAttribute('data-paper-shape-fill') ?? PAPER_DEFAULT_SHAPE_FILL,
    width: inner.style.width || defaults.width,
    height: inner.style.height || defaults.height,
    align,
  };
}

/** Block-level vector shapes (squares, circles, etc.) for paper documents. */
export const PaperShape = Node.create({
  name: 'paperShape',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      shape: {
        default: 'rectangle',
        parseHTML: (element) => readAttrsFromElement(element).shape,
        renderHTML: (attributes) => ({
          'data-paper-shape': attributes.shape as string,
        }),
      },
      fill: {
        default: PAPER_DEFAULT_SHAPE_FILL,
        parseHTML: (element) => readAttrsFromElement(element).fill,
        renderHTML: (attributes) => ({
          'data-paper-shape-fill': attributes.fill as string,
        }),
      },
      width: {
        default: '120px',
        parseHTML: (element) => readAttrsFromElement(element).width,
        renderHTML: () => ({}),
      },
      height: {
        default: '120px',
        parseHTML: (element) => readAttrsFromElement(element).height,
        renderHTML: () => ({}),
      },
      align: {
        default: 'center',
        parseHTML: (element) => readAttrsFromElement(element).align,
        renderHTML: (attributes) => ({
          'data-paper-shape-align': attributes.align as string,
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-paper-shape-wrap]' },
      { tag: 'div[data-paper-shape]' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const shape = (node.attrs.shape as PaperShapeKind) ?? 'rectangle';
    const fill = (node.attrs.fill as string) ?? PAPER_DEFAULT_SHAPE_FILL;
    const width = (node.attrs.width as string) ?? '120px';
    const height = (node.attrs.height as string) ?? '120px';
    const align = (node.attrs.align as PaperShapeAlign) ?? 'center';
    const innerStyle = shapeInlineStyle(shape, fill, width, height);

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: `paper-editor-shape-wrap ${alignWrapClass(align)}`,
        'data-paper-shape-wrap': '',
        'data-paper-shape-align': align,
      }),
      [
        'div',
        {
          class: `paper-editor-shape paper-editor-shape--${shape}`,
          style: innerStyle,
          'data-paper-shape': shape,
          'data-paper-shape-fill': fill,
        },
      ],
    ];
  },

  addNodeView() {
    return createPaperShapeNodeView();
  },

  addCommands() {
    return {
      insertPaperShape:
        (attrs) =>
        ({ commands }) => {
          const shape = attrs.shape ?? 'rectangle';
          const size = defaultPaperShapeSize(shape);
          return commands.insertContent({
            type: this.name,
            attrs: {
              shape,
              fill: attrs.fill ?? PAPER_DEFAULT_SHAPE_FILL,
              width: attrs.width ?? size.width,
              height: attrs.height ?? size.height,
              align: attrs.align ?? 'center',
            },
          });
        },
      updatePaperShapeAttributes:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});
